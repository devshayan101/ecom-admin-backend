import mongoose from 'mongoose';
import { OrderModel, IOrder, OrderStatus } from '../models/order';
import { AppError, ErrorCodes } from '../utils/errors';
import { getRedis } from '../utils/redisClient';
import { getStripe } from '../utils/stripeClient';
import { config } from '../config/secrets';
import * as inventoryService from './inventoryService';
import { writeSystemAuditLog } from '../middleware/auditLog';
import { parsePaginationParams, buildCursorQuery, buildPaginationResult } from '../utils/pagination';

// Valid transitions per PRD §4.6
const VALID_TRANSITIONS: Record<string, { to: OrderStatus[]; requiresUnpaid?: boolean }> = {
    PENDING: { to: ['CONFIRMED', 'CANCELLED'], requiresUnpaid: true },
    CONFIRMED: { to: ['SHIPPED', 'CANCELLED'] },
    SHIPPED: { to: ['DELIVERED'] },
};

export async function listOrders(query: Record<string, string | undefined>) {
    const { limit, cursor, sortField, sortOrder } = parsePaginationParams(query, ['created_at']);
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.payment_status) filter.payment_status = query.payment_status;

    const cursorQuery = buildCursorQuery(cursor, sortField, sortOrder);
    const combinedFilter = { ...filter, ...cursorQuery };

    const items = await OrderModel.find(combinedFilter)
        .sort({ [sortField]: sortOrder, _id: sortOrder })
        .limit(limit + 1)
        .lean();

    return buildPaginationResult(items, limit, sortField);
}

export async function getOrderById(id: string) {
    const order = await OrderModel.findById(id).lean();
    if (!order) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Order not found');
    return order;
}

export async function createOrder(body: {
    customer_id: string;
    items: Array<{ variant_id: string; sku: string; price_at_purchase: number; quantity: number }>;
    shipping_address: any;
    idempotency_key: string;
    payment_method?: 'STRIPE' | 'COD';
}) {
    const redis = getRedis();
    const idemKey = `idem:${body.idempotency_key}`;

    // Check idempotency
    const cached = await redis.get(idemKey);
    if (cached) return JSON.parse(cached);

    const payment_method = body.payment_method || 'STRIPE';
    const total_amount = body.items.reduce((sum, i) => sum + i.price_at_purchase * i.quantity, 0);
    const paymentDeadline = payment_method === 'STRIPE'
        ? new Date(Date.now() + config.paymentDeadlineMinutes * 60 * 1000)
        : null;

    const session = await mongoose.startSession();
    let order: any;

    try {
        session.startTransaction();

        // Reserve all inventory items atomically
        await inventoryService.reserveItems(session, body.items.map(i => ({
            variant_id: i.variant_id,
            quantity: i.quantity,
        })));

        // Persist order
        const [created] = await OrderModel.create([{
            customer_id: new mongoose.Types.ObjectId(body.customer_id),
            status: 'PENDING',
            payment_status: 'UNPAID',
            payment_method,
            idempotency_key: body.idempotency_key,
            payment_deadline_at: paymentDeadline,
            shipping_address: body.shipping_address,
            items: body.items,
            total_amount,
        }], { session });

        order = created;

        await session.commitTransaction();
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        await session.endSession();
    }

    let client_secret: string | undefined;

    if (payment_method === 'STRIPE') {
        // Create Stripe PaymentIntent (after transaction commit)
        let paymentIntent;
        try {
            const stripe = getStripe();
            paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(total_amount * 100), // cents
                currency: 'usd',
                metadata: { order_id: order._id.toString() },
            }, { idempotencyKey: body.idempotency_key });

            // Save stripe PI id
            await OrderModel.updateOne({ _id: order._id }, {
                stripe_payment_intent_id: paymentIntent.id,
            });
            client_secret = paymentIntent.client_secret ?? undefined;
        } catch (stripeErr) {
            // Compensation: cancel order and release reservations
            const compSession = await mongoose.startSession();
            try {
                compSession.startTransaction();
                await OrderModel.updateOne(
                    { _id: order._id },
                    { status: 'CANCELLED', cancel_reason: 'PAYMENT_INTENT_FAILED' as any },
                    { session: compSession }
                );
                for (const item of body.items) {
                    await inventoryService.releaseReservation(item.variant_id, item.quantity);
                }
                await compSession.commitTransaction();
            } catch {
                await compSession.abortTransaction();
            } finally {
                await compSession.endSession();
            }
            throw new AppError(
                ErrorCodes.PAYMENT_INTENT_FAILED.code,
                ErrorCodes.PAYMENT_INTENT_FAILED.statusCode,
                'Failed to create payment intent. Order has been cancelled.'
            );
        }
    }

    const result = { order: order.toObject(), client_secret };

    // Cache idempotency result (24h)
    await redis.set(idemKey, JSON.stringify(result), 'EX', 86400);

    return result;
}

export async function updateOrderStatus(orderId: string, toStatus: OrderStatus, cancelReason?: string) {
    const order = await OrderModel.findById(orderId);
    if (!order) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Order not found');

    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed || !allowed.to.includes(toStatus)) {
        throw new AppError(ErrorCodes.INVALID_TRANSITION.code, ErrorCodes.INVALID_TRANSITION.statusCode,
            `Cannot transition from ${order.status} to ${toStatus}`);
    }

    // PENDING -> CANCELLED requires UNPAID
    if (toStatus === 'CANCELLED' && allowed.requiresUnpaid && order.payment_status !== 'UNPAID') {
        throw new AppError(ErrorCodes.INVALID_TRANSITION.code, ErrorCodes.INVALID_TRANSITION.statusCode,
            'Cannot cancel a paid order in MVP');
    }

    order.status = toStatus;

    if (toStatus === 'CANCELLED') {
        order.cancel_reason = (cancelReason as any) || 'ADMIN_CANCELLED';
        // Release reserved inventory
        for (const item of order.items) {
            await inventoryService.releaseReservation(item.variant_id, item.quantity);
        }
    }

    await order.save();
    return order;
}

// Called by stripe webhook processor for late success after timeout cancellation
export async function handleLateStripeSuccess(orderId: string, eventId: string) {
    await writeSystemAuditLog({
        actorType: 'webhook',
        action: 'MANUAL_REMEDIATION_REQUIRED',
        result: 'success',
        entityType: 'order',
        entityId: orderId,
        changes: { after: { stripe_event_id: eventId, note: 'Late payment after timeout cancellation. Requires manual refund.' } },
    });
}

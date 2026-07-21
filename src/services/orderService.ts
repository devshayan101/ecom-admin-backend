import crypto from 'crypto';
import mongoose from 'mongoose';
import { OrderModel, IOrder, OrderStatus } from '../models/order';
import { SettingsModel } from '../models/settings';
import { SETTINGS_ID } from './settingsService';
import { ProductModel } from '../models/product';
import { AppError, ErrorCodes } from '../utils/errors';
import { getRedis } from '../utils/redisClient';
import { getStripe } from '../utils/stripeClient';
import { getRazorpay } from '../utils/razorpayClient';
import { config } from '../config/secrets';
import * as inventoryService from './inventoryService';
import { writeSystemAuditLog } from '../middleware/auditLog';
import { parsePaginationParams, buildCursorQuery, buildPaginationResult } from '../utils/pagination';
import { orderNotifyQueue } from '../queues/queues';

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
        .populate('customer_id', 'name')
        .sort({ [sortField]: sortOrder, _id: sortOrder })
        .limit(limit + 1)
        .lean();

    const mappedItems = items.map((item: any) => {
        const customerName = item.customer_id?.name || 'Customer';
        const customerIdString = item.customer_id?._id?.toString() || item.customer_id?.toString() || '';
        return {
            ...item,
            customer_name: customerName,
            customer_id: customerIdString
        };
    });

    return buildPaginationResult(mappedItems, limit, sortField);
}

export async function getOrderById(id: string) {
    const order = await OrderModel.findById(id).lean();
    if (!order) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Order not found');
    return order;
}

function normalizeCountry(country: string): string {
    const c = country.trim().toLowerCase();
    if (c === 'india') return 'in';
    if (c === 'united states' || c === 'usa' || c === 'us') return 'us';
    return c;
}

export async function createOrder(body: {
    customer_id: string;
    items: Array<{ variant_id: string; sku: string; price_at_purchase: number; quantity: number }>;
    shipping_address: any;
    shipping_cost?: number;
    shipping_rate_name?: string;
    idempotency_key: string;
    payment_method?: 'STRIPE' | 'RAZORPAY' | 'COD';
}) {
    const redis = getRedis();
    const idemKey = `idem:${body.idempotency_key}`;

    // Check idempotency
    const cached = await redis.get(idemKey);
    if (cached) return JSON.parse(cached);

    const payment_method = body.payment_method || 'STRIPE';

    // Calculate tax-inclusive prices and total amount based on settings and slabs
    const settings = await SettingsModel.findOne({ _id: SETTINGS_ID });
    const inclusive = settings?.taxes?.gstVatSettings?.inclusive ?? false;
    const taxRules = settings?.taxes?.taxRules ?? [];

    const calculatedItems = [];
    const rawCountry = body.shipping_address.country || 'India';
    const shippingCountry = normalizeCountry(rawCountry);
    const shippingState = body.shipping_address.state || '';

    for (const item of body.items) {
        const product = await ProductModel.findOne({ "variants._id": new mongoose.Types.ObjectId(item.variant_id) });
        if (!product) {
            throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, `Product variant not found: ${item.variant_id}`);
        }
        const variant = product.variants.find((v: any) => v._id.toString() === item.variant_id);
        if (!variant) {
            throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, `Variant not found: ${item.variant_id}`);
        }

        // Determine tax rate
        let taxRate = 0;

        // 1. Check product-level tax slabs
        const productSlab = product.tax_slabs?.find((slab: any) => {
            const slabRegion = slab.region.toLowerCase();
            const matchedCountry = rawCountry.toLowerCase();
            const matchedCode = normalizeCountry(rawCountry).toLowerCase();

            // Find resolved state codes from settings rules matching this country and state
            const matchedRules = taxRules.filter((r: any) =>
                (r.country.toLowerCase() === matchedCountry || (r.countryCode || '').toLowerCase() === matchedCode) &&
                r.state.toLowerCase() === shippingState.toLowerCase()
            );
            const resolvedStateCodes = matchedRules.map((r: any) => (r.stateCode || '').toLowerCase()).filter(Boolean);

            const stateMatches = (slabState: string) => {
                const s = slabState.toLowerCase();
                const sh = shippingState.toLowerCase();
                return s === sh || resolvedStateCodes.includes(s);
            };

            const parts = slabRegion.split(' - ');
            if (parts.length === 1) {
                return slabRegion === matchedCountry || slabRegion === matchedCode;
            } else if (parts.length === 2) {
                const slabCountry = parts[0];
                const slabState = parts[1];
                const countryMatches = slabCountry === matchedCountry || slabCountry === matchedCode;
                return countryMatches && stateMatches(slabState);
            }
            return false;
        });

        if (productSlab) {
            taxRate = productSlab.rate;
        } else {
            const matchedCountry = rawCountry.toLowerCase();
            const matchedCode = normalizeCountry(rawCountry).toLowerCase();
            const matchedState = shippingState.toLowerCase();

            const countryRules = taxRules.filter((rule: any) => {
                if (!rule.active) return false;
                const ruleCountry = rule.country.toLowerCase();
                const ruleCountryCode = (rule.countryCode || '').toLowerCase();
                return ruleCountry === matchedCountry || ruleCountryCode === matchedCode || ruleCountryCode === matchedCountry || ruleCountry === matchedCode;
            });

            let globalRule = countryRules.find((rule: any) => {
                const ruleState = (rule.state || '').toLowerCase();
                const ruleStateCode = (rule.stateCode || '').toLowerCase();
                if (!ruleState || ruleState === 'all states' || ruleStateCode === 'all') return false;
                return ruleState === matchedState || ruleStateCode === matchedState;
            });

            if (!globalRule) {
                globalRule = countryRules.find((rule: any) => {
                    const ruleState = (rule.state || '').toLowerCase();
                    const ruleStateCode = (rule.stateCode || '').toLowerCase();
                    return ruleState === 'all states' || ruleStateCode === 'all';
                });
            }

            if (!globalRule) {
                globalRule = countryRules.find((rule: any) => !rule.state);
            }

            if (globalRule) {
                taxRate = globalRule.rate;
            }
        }

        // Apply rate
        let priceAtPurchase = variant.price;
        if (!inclusive) {
            // Exclusive: add tax on top
            priceAtPurchase = variant.price * (1 + taxRate / 100);
        }

        calculatedItems.push({
            variant_id: item.variant_id,
            sku: item.sku,
            price_at_purchase: Math.round(priceAtPurchase * 100) / 100,
            quantity: item.quantity,
        });
    }

    const shipping_cost = body.shipping_cost || 0;
    const shipping_rate_name = body.shipping_rate_name || '';
    const total_amount = calculatedItems.reduce((sum, i) => sum + i.price_at_purchase * i.quantity, 0) + shipping_cost;
    const paymentDeadline = (payment_method === 'STRIPE' || payment_method === 'RAZORPAY')
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
            items: calculatedItems,
            shipping_cost,
            shipping_rate_name,
            total_amount,
        }], { session });

        order = created;

        await session.commitTransaction();
    } catch (err) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        throw err;
    } finally {
        await session.endSession();
    }

    let client_secret: string | undefined;
    let razorpay_order: { razorpay_order_id: string; razorpay_key_id: string; amount: number; currency: string } | undefined;

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
    } else if (payment_method === 'RAZORPAY') {
        try {
            const razorpay = getRazorpay();
            const rzpOrder = await razorpay.orders.create({
                amount: Math.round(total_amount * 100), // paise
                currency: 'INR',
                receipt: order._id.toString(),
                notes: { order_id: order._id.toString() }
            });

            await OrderModel.updateOne({ _id: order._id }, {
                razorpay_order_id: rzpOrder.id,
            });

            razorpay_order = {
                razorpay_order_id: rzpOrder.id,
                razorpay_key_id: config.razorpayKeyId,
                amount: Math.round(total_amount * 100),
                currency: 'INR',
            };
        } catch (rzpErr) {
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
                'Failed to create Razorpay order. Order has been cancelled.'
            );
        }
    }

    const result = { order: order.toObject(), client_secret, razorpay_order };

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

export async function verifyRazorpayPayment(
    orderId: string,
    razorpayPaymentId: string,
    razorpayOrderId: string,
    razorpaySignature: string
) {
    // 1. Verify HMAC signature FIRST using timing-safe buffer comparison
    const generatedSignature = crypto
        .createHmac('sha256', config.razorpayKeySecret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

    const expectedBuf = Buffer.from(generatedSignature, 'utf-8');
    const providedBuf = Buffer.from(razorpaySignature || '', 'utf-8');

    if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, 400, 'Invalid Razorpay payment signature');
    }

    // 2. Wrap order status update & inventory reservation conversion in a DB transaction
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const order = await OrderModel.findById(orderId).session(session);
        if (!order) {
            throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Order not found');
        }

        if (order.payment_status === 'PAID') {
            await session.abortTransaction();
            return order;
        }

        if (order.status === 'CANCELLED') {
            await handleLateRazorpaySuccess(orderId, razorpayPaymentId);
            throw new AppError(ErrorCodes.VALIDATION_ERROR.code, 400, 'Order was already cancelled due to timeout.');
        }

        if (order.status !== 'PENDING' || order.payment_status !== 'UNPAID') {
            await session.abortTransaction();
            return order;
        }

        // Convert reserved inventory to sale atomically inside transaction
        for (const item of order.items) {
            await inventoryService.convertReservationToSale(item.variant_id, item.quantity, session);
        }

        order.payment_status = 'PAID';
        order.status = 'CONFIRMED';
        order.paid_at = new Date();
        order.razorpay_order_id = razorpayOrderId;
        order.razorpay_payment_id = razorpayPaymentId;
        order.razorpay_signature = razorpaySignature;
        await order.save({ session });

        await session.commitTransaction();

        // Queue order confirmation notification
        await orderNotifyQueue.add('order-confirmed', {
            orderId: order._id.toString(),
            type: 'CONFIRMED',
        }).catch(() => { });

        await writeSystemAuditLog({
            actorType: 'system',
            action: 'ORDER_PAID',
            result: 'success',
            entityType: 'order',
            entityId: order._id.toString(),
            changes: { after: { payment_method: 'RAZORPAY', razorpay_payment_id: razorpayPaymentId } }
        });

        return order;
    } catch (err) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        throw err;
    } finally {
        await session.endSession();
    }
}
export async function handleLateRazorpaySuccess(orderId: string, paymentId: string) {
    await writeSystemAuditLog({
        actorType: 'webhook',
        action: 'MANUAL_REMEDIATION_REQUIRED',
        result: 'success',
        entityType: 'order',
        entityId: orderId,
        changes: { after: { razorpay_payment_id: paymentId, note: 'Late payment after timeout cancellation. Requires manual refund.' } },
    });
}

import { Worker } from 'bullmq';
import { config } from '../config/secrets';
import { OrderModel } from '../models/order';
import { getRedis, getRedisOptions } from '../utils/redisClient';
import * as inventoryService from '../services/inventoryService';
import * as orderService from '../services/orderService';
import { writeSystemAuditLog } from '../middleware/auditLog';
import { orderNotifyQueue } from '../queues/queues';

const connection = getRedisOptions();

export function startStripeProcessorWorker() {
    return new Worker('stripe-webhook-processor', async (job) => {
        const { eventId, type, paymentIntentId, metadata } = job.data;

        // Dedupe by payment_intent_id
        const redis = getRedis();
        const piDedupeKey = `stripe_pi:${paymentIntentId}`;
        const isNew = await redis.set(piDedupeKey, '1', 'EX', 86400, 'NX');
        if (!isNew) return; // Already processed

        if (type !== 'payment_intent.succeeded') return;

        const orderId = metadata?.order_id;
        if (!orderId) return;

        const order = await OrderModel.findById(orderId);
        if (!order) return;

        // Late success after cancellation
        if (order.status === 'CANCELLED') {
            await orderService.handleLateStripeSuccess(orderId, eventId);
            return;
        }

        // Already paid (duplicate)
        if (order.payment_status === 'PAID') return;

        // Only process PENDING + UNPAID
        if (order.status !== 'PENDING' || order.payment_status !== 'UNPAID') return;

        // Decrement stock and reserved atomically
        for (const item of order.items) {
            await inventoryService.convertReservationToSale(item.variant_id, item.quantity);
        }

        // Update order
        order.status = 'CONFIRMED';
        order.payment_status = 'PAID';
        order.paid_at = new Date();
        await order.save();

        // Enqueue confirmation email
        await orderNotifyQueue.add('notify', {
            customerId: order.customer_id.toString(),
            orderId: order._id.toString(),
            status: 'CONFIRMED',
        });

        // Audit log
        await writeSystemAuditLog({
            actorType: 'webhook',
            action: 'PAYMENT_CONFIRMED',
            result: 'success',
            entityType: 'order',
            entityId: orderId,
            changes: { before: { status: 'PENDING', payment_status: 'UNPAID' }, after: { status: 'CONFIRMED', payment_status: 'PAID' } },
        });
    }, {
        connection,
        autorun: true,
        settings: {
            backoffStrategy: (attemptsMade: number) => {
                // 1s, 5s, 25s exponential backoff
                return Math.pow(5, attemptsMade - 1) * 1000;
            },
        },
    });
}

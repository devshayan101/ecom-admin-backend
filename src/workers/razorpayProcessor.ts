import { Worker } from 'bullmq';
import { OrderModel } from '../models/order';
import { getRedis, getRedisOptions } from '../utils/redisClient';
import * as inventoryService from '../services/inventoryService';
import * as orderService from '../services/orderService';
import { writeSystemAuditLog } from '../middleware/auditLog';
import { orderNotifyQueue } from '../queues/queues';

const connection = getRedisOptions();

export function startRazorpayProcessorWorker() {
    return new Worker('razorpay-webhook-processor', async (job) => {
        const { event, payload } = job.data;
        const eventId = job.data.eventId || job.id;

        // Dedupe by eventId
        const redis = getRedis();
        const dedupeKey = `rzp_evt:${eventId}`;
        const isNew = await redis.set(dedupeKey, '1', 'EX', 86400, 'NX');
        if (!isNew) return; // Already processed

        if (event !== 'payment.captured' && event !== 'order.paid') return;

        const paymentEntity = payload?.payment?.entity;
        const razorpayOrderId = paymentEntity?.order_id || payload?.order?.entity?.id;
        const razorpayPaymentId = paymentEntity?.id;
        const orderId = paymentEntity?.notes?.order_id || payload?.order?.entity?.notes?.order_id;

        if (!orderId) return;

        const order = await OrderModel.findById(orderId);
        if (!order) return;

        // Late success after cancellation
        if (order.status === 'CANCELLED') {
            await orderService.handleLateRazorpaySuccess(orderId, razorpayPaymentId || eventId);
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
        if (razorpayOrderId) order.razorpay_order_id = razorpayOrderId;
        if (razorpayPaymentId) order.razorpay_payment_id = razorpayPaymentId;
        await order.save();

        // Enqueue confirmation email
        await orderNotifyQueue.add('notify', {
            customerId: order.customer_id.toString(),
            orderId: order._id.toString(),
            status: 'CONFIRMED',
        }).catch(() => {});

        // Audit log
        await writeSystemAuditLog({
            actorType: 'webhook',
            action: 'PAYMENT_CONFIRMED',
            result: 'success',
            entityType: 'order',
            entityId: orderId,
            changes: { before: { status: 'PENDING', payment_status: 'UNPAID' }, after: { status: 'CONFIRMED', payment_status: 'PAID', payment_method: 'RAZORPAY' } },
        });
    }, {
        connection,
        autorun: true,
        settings: {
            backoffStrategy: (attemptsMade: number) => {
                return Math.pow(5, attemptsMade - 1) * 1000;
            },
        },
    });
}

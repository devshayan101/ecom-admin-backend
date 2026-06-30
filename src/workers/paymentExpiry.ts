import { Worker } from 'bullmq';
import { config } from '../config/secrets';
import { OrderModel } from '../models/order';
import * as inventoryService from '../services/inventoryService';
import { writeSystemAuditLog } from '../middleware/auditLog';
import { getRedisOptions } from '../utils/redisClient';

const connection = getRedisOptions();

export async function processPaymentExpiry() {
    const now = new Date();

    // Find orders past deadline that are still PENDING + UNPAID
    const expiredOrders = await OrderModel.find({
        status: 'PENDING',
        payment_status: 'UNPAID',
        payment_deadline_at: { $lt: now },
    });

    for (const order of expiredOrders) {
        // Idempotent: skip if already cancelled or paid
        if (order.status !== 'PENDING' || order.payment_status !== 'UNPAID') continue;

        // Release reserved inventory
        for (const item of order.items) {
            await inventoryService.releaseReservation(item.variant_id, item.quantity);
        }

        order.status = 'CANCELLED';
        order.cancel_reason = 'PAYMENT_TIMEOUT';
        await order.save();

        await writeSystemAuditLog({
            actorType: 'system',
            action: 'PAYMENT_TIMEOUT_CANCEL',
            result: 'success',
            entityType: 'order',
            entityId: order._id.toString(),
            changes: { before: { status: 'PENDING' }, after: { status: 'CANCELLED', cancel_reason: 'PAYMENT_TIMEOUT' } },
        });
    }
}

export function startPaymentExpiryWorker() {
    return new Worker('order-payment-timeout', async () => {
        await processPaymentExpiry();
    }, { connection });
}


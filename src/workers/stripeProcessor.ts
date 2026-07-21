import { Worker } from 'bullmq';
import mongoose from 'mongoose';
import { config } from '../config/secrets';
import { OrderModel } from '../models/order';
import { ProcessedEventModel } from '../models/processedEvent';
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

        const session = await mongoose.startSession();
        let eventRecord: any;
        try {
            session.startTransaction();

            eventRecord = await ProcessedEventModel.findById(eventId).session(session);

            if (!eventRecord) {
                // Late success after cancellation
                if (order.status === 'CANCELLED') {
                    await session.abortTransaction();
                    await orderService.handleLateStripeSuccess(orderId, eventId);
                    return;
                }

                // Already paid (duplicate)
                if (order.payment_status === 'PAID') {
                    await session.abortTransaction();
                    return;
                }

                // Only process PENDING + UNPAID
                if (order.status !== 'PENDING' || order.payment_status !== 'UNPAID') {
                    await session.abortTransaction();
                    return;
                }

                // Decrement stock and reserved atomically
                for (const item of order.items) {
                    await inventoryService.convertReservationToSale(item.variant_id, item.quantity, session);
                }

                // Update order
                order.status = 'CONFIRMED';
                order.payment_status = 'PAID';
                order.paid_at = new Date();
                await order.save({ session });

                // Create processed event record
                const [createdEvent] = await ProcessedEventModel.create([{
                    _id: eventId,
                    order_id: order._id,
                    type: 'stripe',
                }], { session });
                eventRecord = createdEvent;

                await session.commitTransaction();
            } else {
                await session.abortTransaction();
            }
        } catch (err) {
            await redis.del(piDedupeKey).catch(() => {});
            if (session.inTransaction()) {
                await session.abortTransaction();
            }
            throw err;
        } finally {
            await session.endSession();
        }

        // Post-commit side effects processing (durably retried on failure)
        if (eventRecord) {
            if (!eventRecord.notification_sent) {
                await orderNotifyQueue.add('notify', {
                    customerId: order.customer_id.toString(),
                    orderId: order._id.toString(),
                    status: 'CONFIRMED',
                });
                await ProcessedEventModel.updateOne({ _id: eventId }, { notification_sent: true });
            }

            if (!eventRecord.audit_logged) {
                await writeSystemAuditLog({
                    actorType: 'webhook',
                    action: 'PAYMENT_CONFIRMED',
                    result: 'success',
                    entityType: 'order',
                    entityId: orderId,
                    changes: { before: { status: 'PENDING', payment_status: 'UNPAID' }, after: { status: 'CONFIRMED', payment_status: 'PAID' } },
                });
                await ProcessedEventModel.updateOne({ _id: eventId }, { audit_logged: true });
            }
        }
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

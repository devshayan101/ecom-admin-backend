import { Queue } from 'bullmq';
import { getRedisOptions } from '../utils/redisClient';

const connection = getRedisOptions();

export const lowStockQueue = new Queue('low-stock-alert', { connection });
export const orderNotifyQueue = new Queue('order-status-notification', { connection });
export const stripeEventQueue = new Queue('stripe-webhook-processor', { connection });
export const razorpayEventQueue = new Queue('razorpay-webhook-processor', { connection });
export const stripeDlqQueue = new Queue('stripe-dlq', { connection });
export const dashboardCronQueue = new Queue('dashboard-aggregation', { connection });
export const passwordResetQueue = new Queue('password-reset-email', { connection });
export const paymentExpiryQueue = new Queue('order-payment-timeout', { connection });
export const orphanCleanupQueue = new Queue('product-image-orphan-cleanup', { connection });

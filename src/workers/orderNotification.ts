import { Worker } from 'bullmq';
import { config } from '../config/secrets';
import { sendEmail } from '../utils/sesClient';
import { CustomerModel } from '../models/customer';

const connection = { url: config.redisUrl };

export function startOrderNotificationWorker() {
    return new Worker('order-status-notification', async (job) => {
        const { customerId, orderId, status } = job.data;

        const customer = await CustomerModel.findById(customerId).lean();
        if (!customer || !customer.email) return;

        const subjects: Record<string, string> = {
            CONFIRMED: 'Order Confirmed',
            SHIPPED: 'Your Order Has Shipped',
            DELIVERED: 'Your Order Has Been Delivered',
            CANCELLED: 'Order Cancelled',
        };

        const subject = subjects[status] || `Order Update: ${status}`;

        await sendEmail(
            customer.email,
            subject,
            `<p>Your order <strong>${orderId}</strong> status has been updated to <strong>${status}</strong>.</p>`
        );
    }, { connection });
}

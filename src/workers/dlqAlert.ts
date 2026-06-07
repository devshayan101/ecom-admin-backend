import { Worker } from 'bullmq';
import { config } from '../config/secrets';
import { stripeDlqQueue } from '../queues/queues';
import { getRedis } from '../utils/redisClient';
import { sendEmail } from '../utils/resendClient';

const connection = { url: config.redisUrl };

export function startDlqAlertWorker() {
    // Polls every 60 seconds
    return new Worker('stripe-dlq-alert', async () => {
        const depth = await stripeDlqQueue.getWaitingCount() + await stripeDlqQueue.getActiveCount();
        if (depth === 0) return;

        // Deduplicate alert
        const redis = getRedis();
        const alertKey = 'dlq_alerted';
        const set = await redis.set(alertKey, '1', 'EX', 3600, 'NX');
        if (!set) return;

        const failedJobs = await stripeDlqQueue.getFailed(0, 5);
        const jobDetails = failedJobs.map(j => `Job ${j.id}: ${j.failedReason}`).join('\n');

        await sendEmail(
            config.adminEmailAlert,
            `⚠️ Stripe DLQ Alert — ${depth} failed jobs`,
            `<p>There are ${depth} failed Stripe webhook jobs in the DLQ.</p>
       <pre>${jobDetails}</pre>
       <p>Please investigate and remediate.</p>`
        );
    }, { connection });
}

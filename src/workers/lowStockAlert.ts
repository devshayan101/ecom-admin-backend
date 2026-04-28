import { Worker } from 'bullmq';
import { config } from '../config/secrets';
import { InventoryModel } from '../models/inventory';
import { getRedis } from '../utils/redisClient';
import { sendEmail } from '../utils/sesClient';

const connection = { url: config.redisUrl };

export function startLowStockAlertWorker() {
    return new Worker('low-stock-alert', async (job) => {
        const { variantId, sku, stock, reserved, low_stock_threshold } = job.data;
        const available = stock - reserved;

        if (available > low_stock_threshold) return;

        // Dedup: one alert per variant per hour
        const redis = getRedis();
        const dedupeKey = `low_stock_notified:${variantId}`;
        const set = await redis.set(dedupeKey, '1', 'EX', 3600, 'NX');
        if (!set) return; // Already notified within the hour

        await sendEmail(
            config.adminEmailAlert,
            `Low Stock Alert: ${sku}`,
            `<p>Variant <strong>${sku}</strong> is running low.</p>
       <p>Stock: ${stock}, Reserved: ${reserved}, Available: ${available}, Threshold: ${low_stock_threshold}</p>`
        );
    }, { connection });
}

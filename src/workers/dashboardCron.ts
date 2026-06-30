import { Worker } from 'bullmq';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { config } from '../config/secrets';
import { OrderModel } from '../models/order';
import { getRedis, getRedisOptions } from '../utils/redisClient';

dayjs.extend(utc);
dayjs.extend(timezone);

const connection = getRedisOptions();

export function startDashboardCronWorker() {
    return new Worker('dashboard-aggregation', async () => {
        const tz = config.businessTimezone;
        const now = dayjs().tz(tz);
        const redis = getRedis();

        // Current calendar week: Monday 00:00 to next Monday 00:00
        const weekStart = now.startOf('week').add(1, 'day').toDate(); // dayjs week starts Sunday, adjust to Monday
        const weekEnd = dayjs(weekStart).add(7, 'day').toDate();

        const weeklyResult = await OrderModel.aggregate([
            { $match: { payment_status: 'PAID', paid_at: { $gte: weekStart, $lt: weekEnd } } },
            { $group: { _id: null, total: { $sum: '$total_amount' } } },
        ]);
        await redis.set('dashboard:weekly', (weeklyResult[0]?.total || 0).toString(), 'EX', 86400);

        // Current calendar month
        const monthStart = now.startOf('month').toDate();
        const monthEnd = now.add(1, 'month').startOf('month').toDate();

        const monthlyResult = await OrderModel.aggregate([
            { $match: { payment_status: 'PAID', paid_at: { $gte: monthStart, $lt: monthEnd } } },
            { $group: { _id: null, total: { $sum: '$total_amount' } } },
        ]);
        await redis.set('dashboard:monthly', (monthlyResult[0]?.total || 0).toString(), 'EX', 86400);

        // Top 10 products by revenue
        const topProducts = await OrderModel.aggregate([
            { $match: { payment_status: 'PAID' } },
            { $unwind: '$items' },
            { $group: { _id: '$items.sku', revenue: { $sum: { $multiply: ['$items.price_at_purchase', '$items.quantity'] } }, total_sold: { $sum: '$items.quantity' } } },
            { $sort: { revenue: -1 } },
            { $limit: 10 },
        ]);
        await redis.set('dashboard:top_products', JSON.stringify(topProducts), 'EX', 86400);

        console.log('Dashboard cron completed');
    }, { connection });
}

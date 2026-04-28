import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { OrderModel } from '../models/order';
import { getRedis } from '../utils/redisClient';
import { config } from '../config/secrets';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function getDashboardSummary() {
    const tz = config.businessTimezone;
    const now = dayjs().tz(tz);

    // Today revenue: live aggregation
    const todayStart = now.startOf('day').toDate();
    const todayRevenue = await OrderModel.aggregate([
        { $match: { payment_status: 'PAID', paid_at: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$total_amount' } } },
    ]);

    // Weekly/monthly from Redis cache
    const redis = getRedis();
    const weeklyRevenue = await redis.get('dashboard:weekly');
    const monthlyRevenue = await redis.get('dashboard:monthly');

    // Order count by status: live
    const orderCounts = await OrderModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const statusCounts: Record<string, number> = {};
    for (const oc of orderCounts) {
        statusCounts[oc._id] = oc.count;
    }

    return {
        today_revenue: todayRevenue[0]?.total || 0,
        weekly_revenue: weeklyRevenue ? parseFloat(weeklyRevenue) : 0,
        monthly_revenue: monthlyRevenue ? parseFloat(monthlyRevenue) : 0,
        order_counts: statusCounts,
    };
}

export async function getTopProducts() {
    const redis = getRedis();
    const cached = await redis.get('dashboard:top_products');
    if (cached) return JSON.parse(cached);

    // Fallback: live query
    const topProducts = await OrderModel.aggregate([
        { $match: { payment_status: 'PAID' } },
        { $unwind: '$items' },
        { $group: { _id: '$items.sku', revenue: { $sum: { $multiply: ['$items.price_at_purchase', '$items.quantity'] } }, total_sold: { $sum: '$items.quantity' } } },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
    ]);

    return topProducts;
}

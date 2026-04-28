import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { OrderModel } from '../models/order';
import { InventoryModel } from '../models/inventory';
import { config } from '../config/secrets';

dayjs.extend(utc);
dayjs.extend(timezone);

export async function getSalesReport(startDate: string, endDate: string) {
    const tz = config.businessTimezone;
    const start = dayjs.tz(startDate, tz).toDate();
    const end = dayjs.tz(endDate, tz).toDate();

    const result = await OrderModel.aggregate([
        { $match: { payment_status: 'PAID', paid_at: { $gte: start, $lt: end } } },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$paid_at', timezone: tz } },
                revenue: { $sum: '$total_amount' },
                order_count: { $sum: 1 },
            },
        },
        { $sort: { _id: 1 } },
    ]);

    const totalRevenue = result.reduce((sum, r) => sum + r.revenue, 0);
    const totalOrders = result.reduce((sum, r) => sum + r.order_count, 0);

    return { days: result, total_revenue: totalRevenue, total_orders: totalOrders };
}

export async function getInventoryReport() {
    return InventoryModel.find({
        $expr: { $lte: ['$stock', '$low_stock_threshold'] },
    }).lean();
}

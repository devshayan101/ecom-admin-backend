import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import * as dashboardService from '../services/dashboardService';

const dashboard = new Hono();

dashboard.use('/*', authMiddleware);

dashboard.get('/summary', requirePermission('dashboard:read'), async (c) => {
    const result = await dashboardService.getDashboardSummary();
    return c.json(result);
});

dashboard.get('/top-products', requirePermission('dashboard:read'), async (c) => {
    const result = await dashboardService.getTopProducts();
    return c.json({ items: result });
});

export default dashboard;

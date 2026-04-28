import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import * as reportService from '../services/reportService';

const reports = new Hono();

reports.use('/*', authMiddleware);

reports.get('/sales', requirePermission('reports:read'), async (c) => {
    const { start_date, end_date } = c.req.query();
    if (!start_date || !end_date) {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'start_date and end_date are required' } }, 422);
    }
    const result = await reportService.getSalesReport(start_date, end_date);
    return c.json(result);
});

reports.get('/inventory', requirePermission('reports:read'), async (c) => {
    const result = await reportService.getInventoryReport();
    return c.json({ items: result });
});

export default reports;

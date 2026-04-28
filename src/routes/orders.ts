import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import * as orderService from '../services/orderService';
import { AppError, ErrorCodes } from '../utils/errors';

const orders = new Hono();

orders.use('/*', authMiddleware);

orders.get('/', requirePermission('orders:read'), async (c) => {
    const query = c.req.query();
    const result = await orderService.listOrders(query);
    return c.json(result);
});

orders.post('/', requirePermission('orders:write'), async (c) => {
    const idempotencyKey = c.req.header('Idempotency-Key');
    if (!idempotencyKey) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Idempotency-Key header is required');
    }
    const body = await c.req.json();
    const result = await orderService.createOrder({ ...body, idempotency_key: idempotencyKey });
    return c.json(result, 201);
});

orders.get('/:id', requirePermission('orders:read'), async (c) => {
    const id = c.req.param('id')!;
    const order = await orderService.getOrderById(id);
    return c.json(order);
});

orders.patch('/:id/status', requirePermission('orders:write'), async (c) => {
    const id = c.req.param('id')!;
    const { status, cancel_reason } = await c.req.json();
    const order = await orderService.updateOrderStatus(id, status, cancel_reason);
    return c.json(order);
});

export default orders;

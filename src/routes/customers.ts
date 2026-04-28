import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import * as customerService from '../services/customerService';

const customers = new Hono();

customers.use('/*', authMiddleware);

customers.get('/', requirePermission('customers:read'), async (c) => {
    const query = c.req.query();
    const result = await customerService.listCustomers(query);
    return c.json(result);
});

customers.post('/', requirePermission('customers:write'), async (c) => {
    const body = await c.req.json();
    const customer = await customerService.createCustomer(body);
    return c.json(customer, 201);
});

customers.get('/:id', requirePermission('customers:read'), async (c) => {
    const id = c.req.param('id')!;
    const customer = await customerService.getCustomerById(id);
    return c.json(customer);
});

customers.patch('/:id', requirePermission('customers:write'), async (c) => {
    const id = c.req.param('id')!;
    const body = await c.req.json();
    const customer = await customerService.updateCustomer(id, body);
    return c.json(customer);
});

customers.delete('/:id', requirePermission('customers:write'), async (c) => {
    const id = c.req.param('id')!;
    await customerService.deleteCustomer(id);
    return c.json({ message: 'Customer deleted' });
});

customers.patch('/:id/restore', requirePermission('customers:write'), async (c) => {
    const id = c.req.param('id')!;
    const customer = await customerService.restoreCustomer(id);
    return c.json(customer);
});

customers.get('/:id/orders', requirePermission('orders:read'), async (c) => {
    const id = c.req.param('id')!;
    const query = c.req.query();
    const result = await customerService.getCustomerOrders(id, query);
    return c.json(result);
});

export default customers;

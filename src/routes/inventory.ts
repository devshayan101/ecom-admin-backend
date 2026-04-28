import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import * as inventoryService from '../services/inventoryService';

const inventory = new Hono();

inventory.use('/*', authMiddleware);

inventory.get('/', requirePermission('inventory:read'), async (c) => {
    const query = c.req.query();
    const result = await inventoryService.listInventory(query);
    return c.json(result);
});

inventory.get('/:variantId', requirePermission('inventory:read'), async (c) => {
    const id = c.req.param('variantId')!;
    const inv = await inventoryService.getInventoryByVariantId(id);
    return c.json(inv);
});

inventory.patch('/:variantId/adjust', requirePermission('inventory:write'), async (c) => {
    const variantId = c.req.param('variantId')!;
    const { delta, reason } = await c.req.json();
    const auth = (c as any).get('auth');
    const inv = await inventoryService.adjustInventory(variantId, delta, reason, auth.userId);
    return c.json(inv);
});

export default inventory;

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { RoleModel } from '../models/role';

const roles = new Hono();

roles.use('/*', authMiddleware);
roles.use('/*', requirePermission('users:write')); // superadmin only

roles.get('/', async (c) => {
    const roles = await RoleModel.find({}).lean();
    return c.json({ items: roles });
});

export default roles;

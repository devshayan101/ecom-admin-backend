import { Hono } from 'hono';
import bcrypt from 'bcrypt';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { AdminUserModel } from '../models/adminUser';
import { AppError, ErrorCodes } from '../utils/errors';

const users = new Hono();

users.use('/*', authMiddleware);
users.use('/*', requirePermission('users:write'));

users.get('/', async (c) => {
    const users = await AdminUserModel.find({}, { password_hash: 0 }).lean();
    return c.json({ items: users });
});

users.get('/:id', async (c) => {
    const id = c.req.param('id');
    const user = await AdminUserModel.findById(id, { password_hash: 0 }).lean();
    if (!user) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'User not found');
    return c.json(user);
});

users.post('/', async (c) => {
    const { name, email, password, role } = await c.req.json();
    const hash = await bcrypt.hash(password, 12);
    const user = await AdminUserModel.create({
        name, email, password_hash: hash, role, is_active: true,
    });
    const { password_hash, ...safe } = user.toObject();
    return c.json(safe, 201);
});

users.patch('/:id', async (c) => {
    const id = c.req.param('id');
    const data = await c.req.json();
    // Only allow updating role and is_active
    const update: any = {};
    if (data.role) update.role = data.role;
    if (data.is_active !== undefined) update.is_active = data.is_active;

    const user = await AdminUserModel.findByIdAndUpdate(id, update, { new: true, projection: { password_hash: 0 } });
    if (!user) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'User not found');
    return c.json(user);
});

users.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const user = await AdminUserModel.findByIdAndUpdate(id, { is_active: false }, { new: true, projection: { password_hash: 0 } });
    if (!user) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'User not found');
    return c.json(user);
});

export default users;

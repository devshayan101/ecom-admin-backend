import bcrypt from 'bcrypt';
import { RoleModel } from '../models/role';
import { AdminUserModel } from '../models/adminUser';
import { config } from './secrets';

const ROLE_DEFAULTS = [
    {
        name: 'superadmin',
        permissions: ['*'],
    },
    {
        name: 'manager',
        permissions: [
            'products:read', 'products:write',
            'categories:read', 'categories:write',
            'inventory:read', 'inventory:write',
            'orders:read', 'orders:write',
            'customers:read', 'customers:write',
            'dashboard:read',
            'reports:read',
            'audit_logs:read',
            'settings:read', 'settings:write',
            'reviews:read', 'reviews:write',
        ],
    },
    {
        name: 'viewer',
        permissions: [
            'products:read',
            'categories:read',
            'inventory:read',
            'orders:read',
            'customers:read',
            'dashboard:read',
            'reports:read',
            'audit_logs:read',
            'settings:read',
            'reviews:read',
        ],
    },
];

export async function seed(): Promise<void> {
    // Upsert roles (idempotent)
    for (const role of ROLE_DEFAULTS) {
        await RoleModel.updateOne(
            { name: role.name },
            { $set: { permissions: role.permissions }, $setOnInsert: { name: role.name } },
            { upsert: true }
        );
    }
    console.log('Roles seeded');

    // Upsert seed superadmin
    const exists = await AdminUserModel.findOne({ email: config.seedAdminEmail });
    if (!exists) {
        const hash = await bcrypt.hash(config.seedAdminPassword, 12);
        await AdminUserModel.create({
            name: 'Super Admin',
            email: config.seedAdminEmail,
            password_hash: hash,
            role: 'superadmin',
            is_active: true,
        });
        console.log('Seed superadmin created');
    }
}

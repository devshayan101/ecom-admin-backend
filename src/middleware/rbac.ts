import { Context, Next } from 'hono';
import { AppError, ErrorCodes } from '../utils/errors';
import { RoleModel } from '../models/role';

// In-memory cache of role permissions, loaded at startup
let rolePermissionsCache: Map<string, string[]> = new Map();

export async function loadRolePermissions(): Promise<void> {
    const roles = await RoleModel.find({}).lean();
    rolePermissionsCache = new Map();
    for (const role of roles) {
        rolePermissionsCache.set(role.name, role.permissions);
    }
}

export function requirePermission(permission: string) {
    return async (c: Context, next: Next) => {
        const auth = c.get('auth');
        if (!auth) {
            throw new AppError(ErrorCodes.UNAUTHORIZED.code, ErrorCodes.UNAUTHORIZED.statusCode, 'Authentication required');
        }

        const permissions = rolePermissionsCache.get(auth.role);
        if (!permissions) {
            throw new AppError(ErrorCodes.RBAC_DENIED.code, ErrorCodes.RBAC_DENIED.statusCode, 'Unknown role');
        }

        // Superadmin has wildcard access
        if (permissions.includes('*')) {
            await next();
            return;
        }

        if (!permissions.includes(permission)) {
            throw new AppError(ErrorCodes.RBAC_DENIED.code, ErrorCodes.RBAC_DENIED.statusCode, `Missing permission: ${permission}`);
        }

        await next();
    };
}

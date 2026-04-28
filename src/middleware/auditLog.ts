import { Context, Next } from 'hono';
import { AuditLogModel } from '../models/auditLog';

interface AuditLogOptions {
    action: string;
    entityType: string;
    getEntityId?: (c: Context) => string | null;
    getBefore?: (c: Context) => any;
    getAfter?: (c: Context) => any;
}

export function auditLog(options: AuditLogOptions) {
    return async (c: Context, next: Next) => {
        let result: 'success' | 'rejected' | 'failed' = 'success';
        let errorCode: string | null = null;
        let errorMessage: string | null = null;

        const before = options.getBefore ? options.getBefore(c) : null;

        try {
            await next();

            const status = c.res.status;
            if (status >= 400 && status < 500) {
                result = 'rejected';
            } else if (status >= 500) {
                result = 'failed';
            }
        } catch (err: any) {
            result = err.statusCode && err.statusCode < 500 ? 'rejected' : 'failed';
            errorCode = err.code || 'UNKNOWN';
            errorMessage = err.message || 'Unknown error';
            throw err;
        } finally {
            const auth = c.get('auth');
            const after = options.getAfter ? options.getAfter(c) : null;

            try {
                await AuditLogModel.create({
                    actor_type: auth ? 'admin' : 'system',
                    actor_id: auth?.userId || null,
                    action: options.action,
                    result,
                    entity_type: options.entityType,
                    entity_id: options.getEntityId ? options.getEntityId(c) : null,
                    changes: { before, after },
                    error_code: errorCode,
                    error_message: errorMessage,
                    ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || null,
                });
            } catch (logErr) {
                console.error('Failed to write audit log:', logErr);
            }
        }
    };
}

// Helper for workers to write system/webhook audit logs directly
export async function writeSystemAuditLog(params: {
    actorType: 'system' | 'webhook';
    action: string;
    result: 'success' | 'rejected' | 'failed';
    entityType: string;
    entityId?: string;
    changes?: { before?: any; after?: any };
    errorCode?: string;
    errorMessage?: string;
}) {
    await AuditLogModel.create({
        actor_type: params.actorType,
        actor_id: null,
        action: params.action,
        result: params.result,
        entity_type: params.entityType,
        entity_id: params.entityId || null,
        changes: params.changes || { before: null, after: null },
        error_code: params.errorCode || null,
        error_message: params.errorMessage || null,
        ip: null,
    });
}

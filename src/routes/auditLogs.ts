import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { AuditLogModel } from '../models/auditLog';
import { AppError, ErrorCodes } from '../utils/errors';
import { parsePaginationParams, buildCursorQuery, buildPaginationResult } from '../utils/pagination';

const auditLogs = new Hono();

auditLogs.use('/*', authMiddleware);

auditLogs.get('/', requirePermission('audit_logs:read'), async (c) => {
    const query = c.req.query();
    const { limit, cursor, sortField, sortOrder } = parsePaginationParams(query, ['created_at']);

    const filter: any = {};
    if (query.entity_type) filter.entity_type = query.entity_type;
    if (query.actor_type) filter.actor_type = query.actor_type;
    if (query.actor_id) filter.actor_id = query.actor_id;
    if (query.result) filter.result = query.result;
    if (query.start_date || query.end_date) {
        filter.created_at = {};
        if (query.start_date) filter.created_at.$gte = new Date(query.start_date);
        if (query.end_date) filter.created_at.$lt = new Date(query.end_date);
    }

    const cursorQuery = buildCursorQuery(cursor, sortField, sortOrder);
    const combinedFilter = { ...filter, ...cursorQuery };

    const items = await AuditLogModel.find(combinedFilter)
        .sort({ [sortField]: sortOrder, _id: sortOrder })
        .limit(limit + 1)
        .lean();

    return c.json(buildPaginationResult(items, limit, sortField));
});

auditLogs.get('/:id', requirePermission('audit_logs:read'), async (c) => {
    const id = c.req.param('id');
    const log = await AuditLogModel.findById(id).lean();
    if (!log) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Audit log not found');
    return c.json(log);
});

export default auditLogs;

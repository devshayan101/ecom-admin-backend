import { Types } from 'mongoose';

interface PaginationParams {
    limit?: number;
    cursor?: string;
    sort?: string;
}

export interface PaginationResult<T> {
    items: T[];
    next_cursor: string | null;
    has_more: boolean;
}

interface DecodedCursor {
    sortValue: any;
    id: string;
}

export function parsePaginationParams(query: Record<string, string | undefined>, allowedSorts: string[] = ['created_at']): {
    limit: number;
    cursor: DecodedCursor | null;
    sortField: string;
    sortOrder: 1 | -1;
} {
    const limit = Math.min(Math.max(parseInt(query.limit || '20', 10) || 20, 1), 100);

    let cursor: DecodedCursor | null = null;
    if (query.cursor) {
        try {
            const decoded = JSON.parse(Buffer.from(query.cursor, 'base64').toString('utf-8'));
            cursor = { sortValue: decoded.v, id: decoded.id };
        } catch {
            cursor = null;
        }
    }

    let sortField = 'created_at';
    let sortOrder: 1 | -1 = -1;
    if (query.sort) {
        const isDesc = query.sort.startsWith('-');
        const field = isDesc ? query.sort.slice(1) : query.sort;
        if (allowedSorts.includes(field)) {
            sortField = field;
            sortOrder = isDesc ? -1 : 1;
        }
    }

    return { limit, cursor, sortField, sortOrder };
}

export function buildCursorQuery(
    cursor: DecodedCursor | null,
    sortField: string,
    sortOrder: 1 | -1
): Record<string, any> {
    if (!cursor) return {};

    const op = sortOrder === -1 ? '$lt' : '$gt';
    return {
        $or: [
            { [sortField]: { [op]: cursor.sortValue } },
            { [sortField]: cursor.sortValue, _id: { [op]: new Types.ObjectId(cursor.id) } },
        ],
    };
}

export function buildPaginationResult<T extends { _id: any;[key: string]: any }>(
    items: T[],
    limit: number,
    sortField: string
): PaginationResult<T> {
    const has_more = items.length > limit;
    const sliced = has_more ? items.slice(0, limit) : items;

    let next_cursor: string | null = null;
    if (has_more && sliced.length > 0) {
        const last = sliced[sliced.length - 1];
        const cursorData = { v: last[sortField], id: last._id.toString() };
        next_cursor = Buffer.from(JSON.stringify(cursorData)).toString('base64');
    }

    return { items: sliced, next_cursor, has_more };
}

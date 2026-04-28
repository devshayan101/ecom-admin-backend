import { Context } from 'hono';
import { AppError } from '../utils/errors';
import { ZodError } from 'zod';

export function errorHandler(err: Error, c: Context) {
    if (err instanceof AppError) {
        return c.json({
            error: {
                code: err.code,
                message: err.message,
                ...(err.field ? { field: err.field } : {}),
            },
        }, err.statusCode as any);
    }

    if (err instanceof ZodError) {
        const first = err.errors[0];
        return c.json({
            error: {
                code: 'VALIDATION_ERROR',
                message: first.message,
                field: first.path.join('.'),
            },
        }, 422);
    }

    console.error('Unhandled error:', err);
    return c.json({
        error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
        },
    }, 500);
}

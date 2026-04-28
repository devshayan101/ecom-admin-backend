export class AppError extends Error {
    constructor(
        public readonly code: string,
        public readonly statusCode: number,
        message: string,
        public readonly field?: string
    ) {
        super(message);
        this.name = 'AppError';
    }
}

// Stable domain error codes (PRD §5.11)
export const ErrorCodes = {
    VALIDATION_ERROR: { code: 'VALIDATION_ERROR', statusCode: 422 },
    NOT_FOUND: { code: 'NOT_FOUND', statusCode: 404 },
    UNAUTHORIZED: { code: 'UNAUTHORIZED', statusCode: 401 },
    RBAC_DENIED: { code: 'RBAC_DENIED', statusCode: 403 },
    INSUFFICIENT_STOCK: { code: 'INSUFFICIENT_STOCK', statusCode: 409 },
    BREAKING_CATEGORY_SCHEMA_CHANGE: { code: 'BREAKING_CATEGORY_SCHEMA_CHANGE', statusCode: 409 },
    SOFT_DELETED_CUSTOMER_EXISTS: { code: 'SOFT_DELETED_CUSTOMER_EXISTS', statusCode: 409 },
    REFRESH_TOKEN_REUSED: { code: 'REFRESH_TOKEN_REUSED', statusCode: 401 },
    PAYMENT_INTENT_FAILED: { code: 'PAYMENT_INTENT_FAILED', statusCode: 502 },
    RATE_LIMITED: { code: 'RATE_LIMITED', statusCode: 429 },
    INVALID_TRANSITION: { code: 'INVALID_TRANSITION', statusCode: 400 },
    CONFLICT: { code: 'CONFLICT', statusCode: 409 },
} as const;

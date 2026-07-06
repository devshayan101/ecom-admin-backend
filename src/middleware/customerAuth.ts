import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { config } from '../config/secrets';
import { AppError, ErrorCodes } from '../utils/errors';

export interface CustomerAuthPayload {
    customerId: string;
    email: string;
}

export type CustomerEnv = {
    Variables: {
        customer?: CustomerAuthPayload;
    };
};

export async function customerAuthMiddleware(c: Context<CustomerEnv>, next: Next) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError(
            ErrorCodes.UNAUTHORIZED.code,
            ErrorCodes.UNAUTHORIZED.statusCode,
            'Missing or invalid Customer Authorization header'
        );
    }

    const token = authHeader.slice(7);
    let payload: CustomerAuthPayload;
    try {
        payload = jwt.verify(token, config.customerJwtSecret) as CustomerAuthPayload;
    } catch (err) {
        throw new AppError(
            ErrorCodes.UNAUTHORIZED.code,
            ErrorCodes.UNAUTHORIZED.statusCode,
            'Invalid or expired customer access token'
        );
    }

    c.set('customer', payload);
    await next();
}

/**
 * Optional Customer Auth middleware. If a token is provided and is valid, sets c.set('customer', payload).
 * If no token is provided, it does not throw an error and proceeds.
 */
export async function optionalCustomerAuthMiddleware(c: Context<CustomerEnv>, next: Next) {
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
            const payload = jwt.verify(token, config.customerJwtSecret) as CustomerAuthPayload;
            c.set('customer', payload);
        } catch (err) {
            // Ignore invalid token and proceed as guest
        }
    }
    await next();
}

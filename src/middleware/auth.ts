import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { config } from '../config/secrets';
import { getRedis } from '../utils/redisClient';
import { AppError, ErrorCodes } from '../utils/errors';

export interface AuthPayload {
    userId: string;
    role: string;
    jti: string;
}

export async function authMiddleware(c: Context, next: Next) {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError(ErrorCodes.UNAUTHORIZED.code, ErrorCodes.UNAUTHORIZED.statusCode, 'Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    let payload: AuthPayload;
    try {
        payload = jwt.verify(token, config.jwtPublicKey, { algorithms: ['RS256'] }) as AuthPayload;
    } catch {
        throw new AppError(ErrorCodes.UNAUTHORIZED.code, ErrorCodes.UNAUTHORIZED.statusCode, 'Invalid or expired access token');
    }

    // Check jti revocation set
    const revoked = await getRedis().get(`revoked_jti:${payload.jti}`);
    if (revoked) {
        throw new AppError(ErrorCodes.UNAUTHORIZED.code, ErrorCodes.UNAUTHORIZED.statusCode, 'Token has been revoked');
    }

    c.set('auth', payload);
    await next();
}

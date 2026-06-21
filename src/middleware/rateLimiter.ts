import { Context, Next } from 'hono';
import { getRedis } from '../utils/redisClient';
import { config } from '../config/secrets';
import { AppError, ErrorCodes } from '../utils/errors';

export async function rateLimiter(c: Context, next: Next) {
    if (c.req.method === 'OPTIONS') {
        await next();
        return;
    }

    const ip = c.req.header('x-forwarded-for') || 
               c.req.header('x-real-ip') || 
               c.env?.incoming?.socket?.remoteAddress || 
               '127.0.0.1';

    const key = `rate_limit:auth:${ip}`;
    const redis = getRedis();
    const windowSeconds = config.authRateLimitWindowSeconds;
    const maxAttempts = config.authRateLimitMax;

    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;

    // Sliding window using sorted set
    await redis.zremrangebyscore(key, '-inf', windowStart.toString());
    const count = await redis.zcard(key);

    if (count >= maxAttempts) {
        const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const retryAfter = oldestEntry.length >= 2
            ? Math.ceil((parseInt(oldestEntry[1], 10) + windowSeconds * 1000 - now) / 1000)
            : windowSeconds;

        c.header('Retry-After', retryAfter.toString());
        throw new AppError(ErrorCodes.RATE_LIMITED.code, ErrorCodes.RATE_LIMITED.statusCode, 'Too many authentication attempts. Please try again later.');
    }

    await redis.zadd(key, now.toString(), `${now}:${Math.random()}`);
    await redis.expire(key, windowSeconds);

    await next();
}

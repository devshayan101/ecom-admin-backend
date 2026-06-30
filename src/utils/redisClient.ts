import Redis, { RedisOptions } from 'ioredis';
import { config } from '../config/secrets';

let redis: Redis;

export function getRedisOptions(): RedisOptions {
    try {
        const parsed = new URL(config.redisUrl);
        return {
            host: parsed.hostname,
            port: parseInt(parsed.port || '6379', 10),
            username: parsed.username || undefined,
            password: parsed.password || undefined,
            db: parsed.pathname ? parseInt(parsed.pathname.substring(1) || '0', 10) : 0,
            tls: parsed.protocol === 'rediss:' ? {} : undefined,
            maxRetriesPerRequest: null,
        };
    } catch (e) {
        return {
            maxRetriesPerRequest: null,
        };
    }
}

export function getRedis(): Redis {
    if (!redis) {
        redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
    }
    return redis;
}

export function setRedisInstance(instance: Redis): void {
    redis = instance;
}

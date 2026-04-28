import Redis from 'ioredis';
import { config } from '../config/secrets';

let redis: Redis;

export function getRedis(): Redis {
    if (!redis) {
        redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
    }
    return redis;
}

export function setRedisInstance(instance: Redis): void {
    redis = instance;
}

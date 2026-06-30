import { Worker } from 'bullmq';
import { getRedisOptions } from '../utils/redisClient';
import { config } from '../config/secrets';
import { ProductModel } from '../models/product';
import { listS3Objects, deleteS3Object } from '../utils/s3Client';

const connection = getRedisOptions();

export function startOrphanImageCleanupWorker() {
    return new Worker('product-image-orphan-cleanup', async () => {
        const prefix = config.s3PublicPrefix;
        const objects = await listS3Objects(prefix);
        const now = Date.now();
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;

        for (const obj of objects) {
            if (!obj.Key || !obj.LastModified) continue;

            try {
                const age = now - new Date(obj.LastModified).getTime();
                if (age < ONE_DAY_MS) continue;

                // Check if any product references this URL
                const url = `${config.r2PublicUrl}/${obj.Key}`;
                const referenced = await ProductModel.exists({ images: url });
                if (referenced) continue;

                await deleteS3Object(obj.Key);
                console.log(`Cleaned up orphan image: ${obj.Key}`);
            } catch (err) {
                console.error(`Failed to check/cleanup ${obj.Key}:`, err);
            }
        }
    }, { connection });
}

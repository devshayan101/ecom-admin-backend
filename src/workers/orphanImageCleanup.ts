import { Worker } from 'bullmq';
import { config } from '../config/secrets';
import { ProductModel } from '../models/product';
import { listS3Objects, getObjectTags, deleteS3Object } from '../utils/s3Client';

const connection = { url: config.redisUrl };

export function startOrphanImageCleanupWorker() {
    return new Worker('product-image-orphan-cleanup', async () => {
        const prefix = config.s3PublicPrefix;
        const objects = await listS3Objects(prefix);
        const now = Date.now();
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;

        for (const obj of objects) {
            if (!obj.Key) continue;

            try {
                const tags = await getObjectTags(obj.Key);
                const sessionTag = tags.find(t => t.Key === 'upload_session_id');
                const createdAtTag = tags.find(t => t.Key === 'created_at');

                if (!sessionTag || !createdAtTag) continue;

                const age = now - new Date(createdAtTag.Value || '').getTime();
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

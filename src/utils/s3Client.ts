import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectTaggingCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/secrets';
import { AppError, ErrorCodes } from './errors';

let s3: S3Client;

function getS3(): S3Client {
    if (!s3) {
        s3 = new S3Client({
            region: 'auto',
            endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: config.r2AccessKeyId,
                secretAccessKey: config.r2SecretAccessKey,
            },
            forcePathStyle: true,
        });
    }
    return s3;
}

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

export async function getPresignedUploadUrl(
    key: string,
    contentType: string,
    uploadSessionId: string
): Promise<string> {
    if (!ALLOWED_MIMES.includes(contentType)) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, `Unsupported MIME type: ${contentType}`, 'content_type');
    }
    const command = new PutObjectCommand({
        Bucket: config.r2BucketName,
        Key: `${config.s3PublicPrefix}/${key}`,
        ContentType: contentType,
        Tagging: `upload_session_id=${uploadSessionId}&created_at=${new Date().toISOString()}`,
    });
    return getSignedUrl(getS3(), command, { expiresIn: 300 });
}

export async function deleteS3Object(key: string): Promise<void> {
    await getS3().send(new DeleteObjectCommand({
        Bucket: config.r2BucketName,
        Key: key,
    }));
}

export async function listS3Objects(prefix: string) {
    const result = await getS3().send(new ListObjectsV2Command({
        Bucket: config.r2BucketName,
        Prefix: prefix,
    }));
    return result.Contents || [];
}

export async function getObjectTags(key: string) {
    const result = await getS3().send(new GetObjectTaggingCommand({
        Bucket: config.r2BucketName,
        Key: key,
    }));
    return result.TagSet || [];
}

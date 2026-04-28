import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
}

export const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),

    // Database
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/ecom_admin',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

    // JWT
    jwtPrivateKey: process.env.JWT_PRIVATE_KEY || '',
    jwtPublicKey: process.env.JWT_PUBLIC_KEY || '',
    accessTokenExpirySeconds: 300, // 5 minutes
    refreshTokenExpirySeconds: 604800, // 7 days

    // Stripe
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',

    // Timezone
    businessTimezone: process.env.BUSINESS_TIMEZONE || 'UTC',

    // AWS
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    awsEndpointUrl: process.env.AWS_ENDPOINT_URL,

    // S3
    s3BucketName: process.env.S3_BUCKET_NAME || '',
    s3PublicPrefix: process.env.S3_PUBLIC_PREFIX || 'product-images',

    // SES
    sesFromAddress: process.env.SES_FROM_ADDRESS || '',
    adminEmailAlert: process.env.ADMIN_EMAIL_ALERT || '',

    // Seed
    seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'changeme123',

    // Rate limiting
    authRateLimitMax: 10,
    authRateLimitWindowSeconds: 900, // 15 minutes

    // Order
    paymentDeadlineMinutes: 30,
};

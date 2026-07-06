import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
    dotenv.config();
}

export const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3001', 10),
    frontendUrl: process.env.FRONTEND_URL || '',

    // Database
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/ecom_admin',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

    // JWT
    jwtPrivateKey: process.env.JWT_PRIVATE_KEY || '',
    jwtPublicKey: process.env.JWT_PUBLIC_KEY || '',
    accessTokenExpirySeconds: 300, // 5 minutes
    refreshTokenExpirySeconds: 604800, // 7 days
    customerJwtSecret: process.env.CUSTOMER_JWT_SECRET || 'fallback-customer-jwt-secret-key-123456789',
    storefrontApiSecret: process.env.STOREFRONT_API_SECRET || 'fallback-storefront-api-secret-key-123456789',

    // Stripe
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',

    // Timezone
    businessTimezone: process.env.BUSINESS_TIMEZONE || 'UTC',

    // Cloudflare R2
    r2AccountId: process.env.R2_ACCOUNT_ID || '',
    r2AccessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    r2BucketName: process.env.R2_BUCKET_NAME || '',
    r2PublicUrl: process.env.R2_PUBLIC_URL || 'http://localhost:3002/public',
    s3PublicPrefix: (process.env.R2_PUBLIC_PREFIX || 'product-images').replace(/\/$/, ''),

    // Resend
    resendApiKey: process.env.RESEND_API_KEY || '',
    resendFromAddress: process.env.RESEND_FROM_ADDRESS || '',
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

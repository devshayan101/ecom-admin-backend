import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { config } from './config/secrets';
import { connectMongo } from './utils/mongoClient';
import { seed } from './config/seed';
import { loadRolePermissions } from './middleware/rbac';
import { errorHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import roleRoutes from './routes/roles';
import categoryRoutes from './routes/categories';
import productRoutes from './routes/products';
import storefrontRoutes from './routes/storefront';
import inventoryRoutes from './routes/inventory';
import orderRoutes from './routes/orders';
import customerRoutes from './routes/customers';
import webhookRoutes from './routes/webhooks';
import dashboardRoutes from './routes/dashboard';
import reportRoutes from './routes/reports';
import auditLogRoutes from './routes/auditLogs';
import settingsRoutes from './routes/settings';
import reviewRoutes from './routes/reviews';

// Workers
import { startLowStockAlertWorker } from './workers/lowStockAlert';
import { startOrderNotificationWorker } from './workers/orderNotification';
import { startStripeProcessorWorker } from './workers/stripeProcessor';
import { startRazorpayProcessorWorker } from './workers/razorpayProcessor';
import { startDlqAlertWorker } from './workers/dlqAlert';
import { startDashboardCronWorker } from './workers/dashboardCron';
import { startPasswordResetEmailWorker } from './workers/passwordResetEmail';
import { startPaymentExpiryWorker } from './workers/paymentExpiry';
import { startOrphanImageCleanupWorker } from './workers/orphanImageCleanup';

import { cors } from 'hono/cors';

const app = new Hono();

app.use('*', logger());

// Enable CORS
const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];
if (config.frontendUrl) {
    allowedOrigins.push(...config.frontendUrl.split(',').map(url => url.trim()));
}

app.use('*', cors({
    origin: allowedOrigins,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
}));

// Mount routes
app.route('/auth', authRoutes);
app.route('/users', userRoutes);
app.route('/roles', roleRoutes);
app.route('/categories', categoryRoutes);
app.route('/products', productRoutes);
app.route('/storefront', storefrontRoutes);
app.route('/inventory', inventoryRoutes);
app.route('/orders', orderRoutes);
app.route('/customers', customerRoutes);
app.route('/webhooks', webhookRoutes);
app.route('/dashboard', dashboardRoutes);
app.route('/reports', reportRoutes);
app.route('/audit-logs', auditLogRoutes);
app.route('/settings', settingsRoutes);
app.route('/reviews', reviewRoutes);

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Global error handler
app.onError(errorHandler);

async function main() {
    // Connect MongoDB
    await connectMongo();
    console.log('MongoDB connected');

    // Seed roles and superadmin
    await seed();

    // Load role permissions into memory
    await loadRolePermissions();
    console.log('Role permissions loaded');

    // Start BullMQ workers
    startLowStockAlertWorker();
    startOrderNotificationWorker();
    startStripeProcessorWorker();
    startRazorpayProcessorWorker();
    startDlqAlertWorker();
    startDashboardCronWorker();
    startPasswordResetEmailWorker();
    startPaymentExpiryWorker();
    startOrphanImageCleanupWorker();
    console.log('BullMQ workers started');

    // Start server
    serve({
        fetch: app.fetch,
        port: config.port,
    }, (info) => {
        console.log(`Server running on http://localhost:${info.port}`);
    });
}

if (process.env.NODE_ENV !== 'test') {
    main().catch((err) => {
        console.error('Failed to start server:', err);
        process.exit(1);
    });
}

export { app };

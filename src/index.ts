import { Hono } from 'hono';
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
import inventoryRoutes from './routes/inventory';
import orderRoutes from './routes/orders';
import customerRoutes from './routes/customers';
import webhookRoutes from './routes/webhooks';
import dashboardRoutes from './routes/dashboard';
import reportRoutes from './routes/reports';
import auditLogRoutes from './routes/auditLogs';

// Workers
import { startLowStockAlertWorker } from './workers/lowStockAlert';
import { startOrderNotificationWorker } from './workers/orderNotification';
import { startStripeProcessorWorker } from './workers/stripeProcessor';
import { startDlqAlertWorker } from './workers/dlqAlert';
import { startDashboardCronWorker } from './workers/dashboardCron';
import { startPasswordResetEmailWorker } from './workers/passwordResetEmail';
import { startPaymentExpiryWorker } from './workers/paymentExpiry';
import { startOrphanImageCleanupWorker } from './workers/orphanImageCleanup';

const app = new Hono();

// Mount routes
app.route('/auth', authRoutes);
app.route('/users', userRoutes);
app.route('/roles', roleRoutes);
app.route('/categories', categoryRoutes);
app.route('/products', productRoutes);
app.route('/inventory', inventoryRoutes);
app.route('/orders', orderRoutes);
app.route('/customers', customerRoutes);
app.route('/webhooks', webhookRoutes);
app.route('/dashboard', dashboardRoutes);
app.route('/reports', reportRoutes);
app.route('/audit-logs', auditLogRoutes);

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

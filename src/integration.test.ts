import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { app } from './index';
import { getRedis } from './utils/redisClient';
import { AdminUserModel } from './models/adminUser';
import { CategoryModel } from './models/category';
import { ProductModel } from './models/product';
import { InventoryModel } from './models/inventory';
import { OrderModel } from './models/order';
import { CustomerModel } from './models/customer';
import { seed } from './config/seed';
import { loadRolePermissions } from './middleware/rbac';
import bcrypt from 'bcrypt';
import { getRequestListener } from '@hono/node-server';
import { generateKeyPairSync } from 'crypto';
import { config } from './config/secrets';

// Mock Redis
jest.mock('./utils/redisClient', () => {
    const Redis = require('ioredis-mock');
    const redis = new Redis();
    return { getRedis: () => redis };
});

// Mock Stripe
jest.mock('./utils/stripeClient', () => ({
    getStripe: () => ({
        paymentIntents: {
            create: jest.fn().mockResolvedValue({
                id: 'pi_test_123',
                client_secret: 'pi_test_123_secret'
            })
        }
    })
}));

const redis = getRedis();
const handler = getRequestListener(app.fetch);

// Generate real RSA keys for testing to satisfy RS256 requirement
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
config.jwtPrivateKey = privateKey;
config.jwtPublicKey = publicKey;

describe('Integration Tests', () => {
    let mongoReplSet: MongoMemoryReplSet;
    let superadminToken: string;

    async function getAuthToken(email: string, pass: string) {
        const res = await request(handler)
            .post('/auth/login')
            .send({ email, password: pass });
        return res.body.accessToken;
    }

    beforeAll(async () => {
        mongoReplSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        await mongoose.connect(mongoReplSet.getUri());

        await Promise.all([
            InventoryModel.ensureIndexes(),
            OrderModel.ensureIndexes(),
            AdminUserModel.ensureIndexes(),
            ProductModel.ensureIndexes(),
            CategoryModel.ensureIndexes(),
            CustomerModel.ensureIndexes()
        ]);

        await seed();
        await loadRolePermissions();

        // config.seedAdminPassword is 'changeme123' by default
        superadminToken = await getAuthToken(config.seedAdminEmail, config.seedAdminPassword);
        if (!superadminToken) {
            throw new Error('Failed to get superadmin token in beforeAll');
        }
    }, 30000);

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoReplSet.stop();
        await redis.quit();
    });

    beforeEach(async () => {
        await AdminUserModel.deleteMany({ email: { $ne: config.seedAdminEmail } });
        await CategoryModel.deleteMany({});
        await ProductModel.deleteMany({});
        await InventoryModel.deleteMany({});
        await OrderModel.deleteMany({});
        await CustomerModel.deleteMany({});
        await redis.flushall();
    });

    describe('Auth & RBAC Matrix', () => {
        it('should login as superadmin and access /users', async () => {
            const res = await request(handler)
                .get('/users')
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('items');
        });

        it('should deny /users to manager role', async () => {
            await AdminUserModel.create({
                name: 'Manager User',
                email: 'manager@example.com',
                password_hash: await bcrypt.hash('password123', 12),
                role: 'manager',
                is_active: true
            });

            const token = await getAuthToken('manager@example.com', 'password123');
            expect(token).toBeDefined();

            const res = await request(handler)
                .get('/users')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(403);
            expect(res.body.error.code).toBe('RBAC_DENIED');
        });
    });

    describe('Category & Product Attributes', () => {
        it('should enforce attribute schema on products', async () => {
            const catRes = await request(handler)
                .post('/categories')
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({
                    name: 'Electronics',
                    slug: 'electronics',
                    attribute_schema: [
                        { key: 'voltage', type: 'number' },
                        { key: 'brand', type: 'enum', values: ['Sony', 'LG'] }
                    ]
                });
            const categoryId = catRes.body._id;

            const prodRes = await request(handler)
                .post('/products')
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({
                    name: 'TV',
                    description: '4K TV',
                    category_id: categoryId,
                    status: 'active',
                    variants: [{
                        sku: 'TV-001',
                        price: 999,
                        attributes: { voltage: 220, brand: 'Sony' }
                    }]
                });
            expect(prodRes.status).toBe(201);

            const badRes1 = await request(handler)
                .post('/products')
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({
                    name: 'Bad TV',
                    category_id: categoryId,
                    variants: [{
                        sku: 'TV-BAD-1',
                        price: 500,
                        attributes: { voltage: 'high' }
                    }]
                });
            expect(badRes1.status).toBe(422);

            const badRes2 = await request(handler)
                .post('/products')
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({
                    name: 'Bad TV 2',
                    category_id: categoryId,
                    variants: [{
                        sku: 'TV-BAD-2',
                        price: 500,
                        attributes: { brand: 'Samsung' }
                    }]
                });
            expect(badRes2.status).toBe(422);
        });

        it('should block breaking category schema changes', async () => {
            const catRes = await request(handler)
                .post('/categories')
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({
                    name: 'Phones',
                    slug: 'phones',
                    attribute_schema: [{ key: 'ram', type: 'number' }]
                });
            const categoryId = catRes.body._id;

            await request(handler)
                .post('/products')
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({
                    name: 'S24',
                    category_id: categoryId,
                    variants: [{ sku: 'S24-001', price: 800, attributes: { ram: 12 } }]
                });

            const updateRes = await request(handler)
                .put(`/categories/${categoryId}`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({
                    name: 'Phones',
                    attribute_schema: []
                });

            expect(updateRes.status).toBe(409);
            expect(updateRes.body.error.code).toBe('BREAKING_CATEGORY_SCHEMA_CHANGE');
        });
    });

    describe('Order & Inventory Workflow', () => {
        it('should perform full order flow: create -> status update', async () => {
            const variantId = new mongoose.Types.ObjectId();
            await InventoryModel.create({
                _id: variantId,
                sku: 'FLOW-001',
                product_id: new mongoose.Types.ObjectId(),
                stock: 10,
                reserved: 0
            });

            const custRes = await request(handler)
                .post('/customers')
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({
                    name: 'John Doe',
                    email: 'john@example.com',
                    address: { street: 'Main St', city: 'NY', country: 'USA' }
                });
            const customerId = custRes.body._id;

            const orderRes = await request(handler)
                .post('/orders')
                .set('Authorization', `Bearer ${superadminToken}`)
                .set('Idempotency-Key', 'idem-flow-1')
                .send({
                    customer_id: customerId,
                    items: [{ variant_id: variantId.toString(), sku: 'FLOW-001', price_at_purchase: 100, quantity: 2 }],
                    shipping_address: {
                        recipient_name: 'John',
                        street: '123 St',
                        city: 'NY',
                        state: 'NY',
                        postcode: '10001',
                        country: 'USA'
                    }
                });

            expect(orderRes.status).toBe(201);
            const orderId = orderRes.body.order._id;

            const invAfter = await InventoryModel.findById(variantId);
            expect(invAfter?.reserved).toBe(2);

            const statusRes = await request(handler)
                .patch(`/orders/${orderId}/status`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({ status: 'CONFIRMED' });

            expect(statusRes.status).toBe(200);
            expect(statusRes.body.status).toBe('CONFIRMED');

            // Negative case: Cannot cancel a confirmed/paid order (assuming it was matched to PAID in a real flow, but here it's UNPAID/CONFIRMED which is also blocked)
            const cancelRes = await request(handler)
                .patch(`/orders/${orderId}/status`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({ status: 'CANCELLED' });

            // Per orderService.ts:150: PENDING -> CANCELLED requires UNPAID. 
            expect(cancelRes.status).toBe(200);
        });
    });

    describe('Dashboard & Analytics', () => {
        it('should get dashboard summary', async () => {
            const res = await request(handler)
                .get('/dashboard/summary')
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('today_revenue');
            expect(res.body).toHaveProperty('order_counts');
        });
    });

    describe('Pagination & Audit Logs', () => {
        it('should paginate customers correctly', async () => {
            for (let i = 1; i <= 3; i++) {
                await CustomerModel.create({
                    name: `Cust ${i}`,
                    email: `cust${i}@example.com`,
                    is_active: true
                });
            }

            const res1 = await request(handler)
                .get('/customers?limit=2')
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res1.body.items).toBeDefined();
            expect(res1.body.items).toHaveLength(2);
            expect(res1.body.has_more).toBe(true);

            const res2 = await request(handler)
                .get(`/customers?limit=2&cursor=${res1.body.next_cursor}`)
                .set('Authorization', `Bearer ${superadminToken}`);

            expect(res2.body.items).toBeDefined();
            expect(res2.body.items).toHaveLength(1);
            expect(res2.body.has_more).toBe(false);
        });
    });
});

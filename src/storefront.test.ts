import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { app } from './index';
import { getRedis } from './utils/redisClient';
import { CategoryModel } from './models/category';
import { ProductModel } from './models/product';
import { InventoryModel } from './models/inventory';
import { OrderModel } from './models/order';
import { CustomerModel } from './models/customer';
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
const mockStripeCreate = jest.fn().mockResolvedValue({
    id: 'pi_test_123',
    client_secret: 'pi_test_123_secret'
});

jest.mock('./utils/stripeClient', () => ({
    getStripe: () => ({
        paymentIntents: {
            create: mockStripeCreate
        }
    })
}));

const redis = getRedis();
const handler = getRequestListener(app.fetch);

// Generate keys for testing
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
config.jwtPrivateKey = privateKey;
config.jwtPublicKey = publicKey;

describe('Storefront Public Endpoints', () => {
    let mongoReplSet: MongoMemoryReplSet;
    let categoryId: string;
    let variantId: string;

    beforeAll(async () => {
        mongoReplSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        await mongoose.connect(mongoReplSet.getUri());

        await Promise.all([
            InventoryModel.ensureIndexes(),
            OrderModel.ensureIndexes(),
            ProductModel.ensureIndexes(),
            CategoryModel.ensureIndexes(),
            CustomerModel.ensureIndexes()
        ]);
    }, 30000);

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoReplSet.stop();
        await redis.quit();
    });

    beforeEach(async () => {
        await CategoryModel.deleteMany({});
        await ProductModel.deleteMany({});
        await InventoryModel.deleteMany({});
        await OrderModel.deleteMany({});
        await CustomerModel.deleteMany({});
        await redis.flushall();
        mockStripeCreate.mockClear();

        // Seed basic category & product
        const category = await CategoryModel.create({
            name: 'Skincare',
            slug: 'skincare',
            parent_id: null,
            attribute_schema: []
        });
        categoryId = category._id.toString();

        variantId = new mongoose.Types.ObjectId().toString();
        const product = await ProductModel.create({
            name: 'Brightening Serum',
            description: '20% Vitamin C',
            category_id: category._id,
            status: 'active',
            tags: ['sale', 'olinbuy'],
            images: [],
            variants: [{
                _id: new mongoose.Types.ObjectId(variantId),
                sku: 'OLIN-001',
                price: 549,
                attributes: {}
            }]
        });

        await InventoryModel.create({
            _id: new mongoose.Types.ObjectId(variantId),
            product_id: product._id,
            sku: 'OLIN-001',
            stock: 20,
            reserved: 0
        });
    });

    it('should list categories publicly', async () => {
        const res = await request(handler).get('/storefront/categories');
        expect(res.status).toBe(200);
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].slug).toBe('skincare');
    });

    it('should list active products publicly', async () => {
        const res = await request(handler).get('/storefront/products');
        expect(res.status).toBe(200);
        expect(res.body.items).toHaveLength(1);
        expect(res.body.items[0].name).toBe('Brightening Serum');
    });

    it('should retrieve a single product publicly by ID', async () => {
        const productsListRes = await ProductModel.findOne({ status: 'active' });
        const res = await request(handler).get(`/storefront/products/${productsListRes?._id}`);
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Brightening Serum');
    });

    it('should perform public guest checkout with COD, bypassing Stripe PaymentIntent creation', async () => {
        const res = await request(handler)
            .post('/storefront/checkout')
            .send({
                customer: {
                    name: 'Guest Customer',
                    email: 'guest@example.com',
                    phone: '9876543210',
                    address: {
                        street: '123 Main St',
                        city: 'Mohali',
                        state: 'Punjab',
                        postcode: '160071',
                        country: 'India'
                    }
                },
                items: [
                    {
                        variant_id: variantId,
                        sku: 'OLIN-001',
                        price_at_purchase: 549,
                        quantity: 1
                    }
                ],
                payment_method: 'COD'
            });

        expect(res.status).toBe(201);
        expect(res.body.message).toBe('Order created successfully');
        expect(res.body.order).toBeDefined();
        expect(res.body.order.payment_method).toBe('COD');
        expect(res.body.order.payment_deadline_at).toBeNull();
        expect(res.body.client_secret).toBeUndefined(); // Bypassed Stripe client secret

        // Verify Stripe PaymentIntent was NOT called
        expect(mockStripeCreate).not.toHaveBeenCalled();

        // Verify inventory is reserved
        const inv = await InventoryModel.findById(variantId);
        expect(inv?.reserved).toBe(1);

        // Verify customer was created
        const customer = await CustomerModel.findOne({ email: 'guest@example.com' });
        expect(customer).toBeDefined();
        expect(customer?.name).toBe('Guest Customer');
    });

    it('should perform public guest checkout with STRIPE, invoking Stripe PaymentIntent creation', async () => {
        const res = await request(handler)
            .post('/storefront/checkout')
            .send({
                customer: {
                    name: 'Stripe Customer',
                    email: 'stripe@example.com',
                    phone: '9876543210',
                    address: {
                        street: '123 Main St',
                        city: 'Mohali',
                        state: 'Punjab',
                        postcode: '160071',
                        country: 'India'
                    }
                },
                items: [
                    {
                        variant_id: variantId,
                        sku: 'OLIN-001',
                        price_at_purchase: 549,
                        quantity: 1
                    }
                ],
                payment_method: 'STRIPE'
            });

        expect(res.status).toBe(201);
        expect(res.body.message).toBe('Order created successfully');
        expect(res.body.order).toBeDefined();
        expect(res.body.order.payment_method).toBe('STRIPE');
        expect(res.body.order.payment_deadline_at).not.toBeNull();
        expect(res.body.client_secret).toBe('pi_test_123_secret'); // Stripe secret returned

        // Verify Stripe PaymentIntent WAS called
        expect(mockStripeCreate).toHaveBeenCalledTimes(1);
    });
});

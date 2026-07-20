import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// Mock Redis before importing app
jest.mock('./utils/redisClient', () => {
    const Redis = require('ioredis-mock');
    const redis = new Redis();
    return {
        getRedis: () => redis,
        getRedisOptions: () => ({ maxRetriesPerRequest: null })
    };
});

// Mock BullMQ to prevent live Redis connections during queue instantiation
jest.mock('bullmq', () => {
    return {
        Queue: jest.fn().mockImplementation(() => {
            return {
                add: jest.fn().mockResolvedValue({}),
                on: jest.fn(),
            };
        })
    };
});

import { app } from './index';
import { ProductModel } from './models/product';
import { CategoryModel } from './models/category';
import { CustomerModel } from './models/customer';
import { ReviewModel } from './models/review';
import { SettingsModel } from './models/settings';
import { SETTINGS_ID } from './services/settingsService';
import { getRequestListener } from '@hono/node-server';
import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'crypto';
import { config } from './config/secrets';
import { seed } from './config/seed';
import { loadRolePermissions } from './middleware/rbac';

const handler = getRequestListener(app.fetch);

describe('Reviews Flow Integration Tests', () => {
    let mongoReplSet: MongoMemoryReplSet;
    let productId: string;
    let customerId: string;
    let customerToken: string;
    let adminToken: string;
    let adminId: string;

    beforeAll(async () => {
        mongoReplSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        await mongoose.connect(mongoReplSet.getUri());

        await Promise.all([
            ProductModel.ensureIndexes(),
            CategoryModel.ensureIndexes(),
            CustomerModel.ensureIndexes(),
            ReviewModel.ensureIndexes(),
            SettingsModel.ensureIndexes()
        ]);

        const { privateKey, publicKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        config.jwtPrivateKey = privateKey;
        config.jwtPublicKey = publicKey;
        config.customerJwtSecret = 'cust_secret';

        // Seed roles & load them into permission cache
        await seed();
        await loadRolePermissions();
    }, 30000);

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoReplSet.stop();
    });

    beforeEach(async () => {
        await CategoryModel.deleteMany({});
        await ProductModel.deleteMany({});
        await CustomerModel.deleteMany({});
        await ReviewModel.deleteMany({});
        await SettingsModel.deleteMany({});

        // Seed basic category & product
        const category = await CategoryModel.create({
            name: 'Skincare',
            slug: 'skincare',
            parent_id: null,
            attribute_schema: []
        });

        const product = await ProductModel.create({
            name: 'Hydrating Cream',
            description: 'Intense moisture',
            category_id: category._id,
            status: 'active',
            tags: ['sale', 'olinbuy'],
            images: [],
            variants: [{
                sku: 'OLIN-002',
                price: 299,
                attributes: {}
            }]
        });
        productId = product._id.toString();

        // Create Customer
        const customer = await CustomerModel.create({
            name: 'Test Customer',
            email: 'test@example.com',
            phone: '9876543210',
            is_active: true
        });
        customerId = customer._id.toString();

        // Sign customer token
        customerToken = jwt.sign({ customerId, email: customer.email }, config.customerJwtSecret, { expiresIn: '7d' });

        // Sign admin token (role superadmin has wildcard permissions)
        adminId = new mongoose.Types.ObjectId().toString();
        adminToken = jwt.sign({ userId: adminId, role: 'superadmin' }, config.jwtPrivateKey, { algorithm: 'RS256', expiresIn: '7d' });
        
        // Seed default settings
        await SettingsModel.create({
            _id: SETTINGS_ID,
            general: { storeName: 'Test Store', storeEmail: 'test@store.com', storePhone: '000', currency: 'INR', timeZone: 'UTC', language: 'en' },
            taxes: { taxRules: [], gstVatSettings: { enabled: false, inclusive: false } },
            reviews: { auto_publish: false } // manual approval by default
        });
    });

    it('should submit a review and put it in pending status (manual approval)', async () => {
        const res = await request(handler)
            .post(`/storefront/products/${productId}/reviews`)
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                rating: 5,
                title: 'Amazing!',
                comment: 'This product works great.',
                images: ['http://example.com/img.jpg']
            });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('pending');
        expect(res.body.customer_name).toBe('Test Customer');
        expect(res.body.rating).toBe(5);

        // Public storefront get should be empty because it is pending
        const storefrontRes = await request(handler).get(`/storefront/products/${productId}/reviews`);
        expect(storefrontRes.status).toBe(200);
        expect(storefrontRes.body).toHaveLength(0);

        // Product aggregate rating should still be 0
        const prod = await ProductModel.findById(productId);
        expect(prod?.rating_average).toBe(0);
        expect(prod?.rating_count).toBe(0);
    });

    it('should submit a review and auto-publish it if setting is enabled', async () => {
        await SettingsModel.findOneAndUpdate({}, { 'reviews.auto_publish': true });

        const res = await request(handler)
            .post(`/storefront/products/${productId}/reviews`)
            .set('Authorization', `Bearer ${customerToken}`)
            .send({
                rating: 4,
                title: 'Good product',
                comment: 'Nice texture.'
            });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe('approved');

        // Public storefront get should list it
        const storefrontRes = await request(handler).get(`/storefront/products/${productId}/reviews`);
        expect(storefrontRes.status).toBe(200);
        expect(storefrontRes.body).toHaveLength(1);
        expect(storefrontRes.body[0].rating).toBe(4);

        // Product aggregate rating should be updated
        const prod = await ProductModel.findById(productId);
        expect(prod?.rating_average).toBe(4);
        expect(prod?.rating_count).toBe(1);
    });

    it('should allow admin to approve a pending review and update averages', async () => {
        // Submit review
        const review = await ReviewModel.create({
            product_id: new mongoose.Types.ObjectId(productId),
            customer_id: new mongoose.Types.ObjectId(customerId),
            customer_name: 'Test Customer',
            rating: 5,
            title: 'Fantastic',
            status: 'pending'
        });

        // Approve review
        const res = await request(handler)
            .patch(`/reviews/${review._id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'approved' });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('approved');

        // Verify product average
        const prod = await ProductModel.findById(productId);
        expect(prod?.rating_average).toBe(5);
        expect(prod?.rating_count).toBe(1);
    });

    it('should allow admin to reply to a review', async () => {
        const review = await ReviewModel.create({
            product_id: new mongoose.Types.ObjectId(productId),
            customer_id: new mongoose.Types.ObjectId(customerId),
            customer_name: 'Test Customer',
            rating: 4,
            title: 'Cool',
            status: 'approved'
        });

        const res = await request(handler)
            .post(`/reviews/${review._id}/reply`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ text: 'Thank you for your feedback!' });

        expect(res.status).toBe(200);
        expect(res.body.admin_reply.text).toBe('Thank you for your feedback!');
        expect(res.body.admin_reply.replied_by).toBe(adminId);
    });

    it('should allow admin to delete a review', async () => {
        const review = await ReviewModel.create({
            product_id: new mongoose.Types.ObjectId(productId),
            customer_id: new mongoose.Types.ObjectId(customerId),
            customer_name: 'Test Customer',
            rating: 3,
            title: 'Ok',
            status: 'approved'
        });
        await ProductModel.findByIdAndUpdate(productId, { rating_average: 3, rating_count: 1 });

        const res = await request(handler)
            .delete(`/reviews/${review._id}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);

        const count = await ReviewModel.countDocuments({ _id: review._id });
        expect(count).toBe(0);

        const prod = await ProductModel.findById(productId);
        expect(prod?.rating_average).toBe(0);
        expect(prod?.rating_count).toBe(0);
    });
});

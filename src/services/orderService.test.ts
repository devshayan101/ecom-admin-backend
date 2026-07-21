import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { config } from '../config/secrets';

// Mock Redis
const redisMock: any = {
    get: jest.fn(),
    set: jest.fn(),
};
jest.mock('../utils/redisClient', () => ({
    getRedis: () => redisMock,
    getRedisOptions: () => ({}),
}));

// Mock Stripe
const stripeMock: any = {
    paymentIntents: {
        create: jest.fn(),
    },
};
jest.mock('../utils/stripeClient', () => ({
    getStripe: () => stripeMock,
}));

// Mock BullMQ
jest.mock('../queues/queues', () => ({
    orderNotifyQueue: { add: jest.fn(() => Promise.resolve()) },
    paymentExpiryQueue: { add: jest.fn(() => Promise.resolve()) },
}));

// Mock Audit Log System
jest.mock('../middleware/auditLog', () => ({
    writeSystemAuditLog: jest.fn(),
}));

import { OrderModel } from '../models/order';
import { InventoryModel } from '../models/inventory';
import { ProductModel } from '../models/product';

let createOrder: any;
let updateOrderStatus: any;
let verifyRazorpayPayment: any;

let mongoReplSet: MongoMemoryReplSet;

beforeAll(async () => {
    mongoReplSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongoReplSet.getUri());
    await InventoryModel.ensureIndexes();
    await OrderModel.ensureIndexes();
    await ProductModel.ensureIndexes();

    const mod = await import('./orderService');
    createOrder = mod.createOrder;
    updateOrderStatus = mod.updateOrderStatus;
    verifyRazorpayPayment = mod.verifyRazorpayPayment;
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoReplSet.stop();
});

beforeEach(async () => {
    await OrderModel.deleteMany({});
    await InventoryModel.deleteMany({});
    await ProductModel.deleteMany({});
    jest.clearAllMocks();
});

describe('OrderService', () => {
    const variantId = new mongoose.Types.ObjectId().toString();
    const productId = new mongoose.Types.ObjectId().toString();

    beforeEach(async () => {
        await ProductModel.create({
            _id: productId,
            name: 'Test Product',
            category_id: new mongoose.Types.ObjectId(),
            status: 'active',
            variants: [{
                _id: variantId,
                sku: 'SKU-1',
                price: 100,
                attributes: {}
            }]
        });

        await InventoryModel.create({
            _id: variantId,
            product_id: productId,
            sku: 'SKU-1',
            stock: 10,
            reserved: 0,
            low_stock_threshold: 1,
        });
    });

    describe('createOrder', () => {
        it('should create an order and reserve inventory if enough stock exists', async () => {
            redisMock.get.mockResolvedValue(null); // No idempotency hit
            stripeMock.paymentIntents.create.mockResolvedValue({ id: 'pi_123', client_secret: 'cs_123' });

            const orderData = {
                customer_id: new mongoose.Types.ObjectId().toString(),
                items: [{ variant_id: variantId, sku: 'SKU-1', quantity: 2, price_at_purchase: 100 }],
                shipping_address: { recipient_name: 'John', street: '123 St', city: 'City', state: 'ST', postcode: '12345', country: 'US' },
                total_amount: 200,
                idempotency_key: 'idem-1',
            };

            const result = await createOrder(orderData);

            expect(result.order).toBeDefined();
            expect(result.client_secret).toBe('cs_123');

            const inv = await InventoryModel.findById(variantId);
            expect(inv?.reserved).toBe(2);

            const order = await OrderModel.findById(result.order._id);
            expect(order?.status).toBe('PENDING');
            expect(order?.stripe_payment_intent_id).toBe('pi_123');
        });

        it('should return cached response if idempotency key exists', async () => {
            const cachedResponse = { order: { _id: 'old' }, client_secret: 'old' };
            redisMock.get.mockResolvedValue(JSON.stringify(cachedResponse));

            const result = await createOrder({ idempotency_key: 'idem-1' } as any);

            expect(result).toEqual(cachedResponse);
            expect(stripeMock.paymentIntents.create).not.toHaveBeenCalled();
        });

        it('should rollback reservation if Stripe fails', async () => {
            redisMock.get.mockResolvedValue(null);
            stripeMock.paymentIntents.create.mockRejectedValue(new Error('Stripe Down'));

            const orderData = {
                customer_id: new mongoose.Types.ObjectId().toString(),
                items: [{ variant_id: variantId, sku: 'SKU-1', quantity: 2, price_at_purchase: 100 }],
                shipping_address: { recipient_name: 'John', street: '123 St', city: 'City', state: 'ST', postcode: '12345', country: 'US' },
                total_amount: 200,
                idempotency_key: 'idem-2',
            };

            let error: any;
            try {
                await createOrder(orderData);
            } catch (err) {
                error = err;
            }
            expect(error).toBeDefined();

            const inv = await InventoryModel.findById(variantId);
            expect(inv?.reserved).toBe(0); // Rollback happened

            const order = await OrderModel.findOne({ idempotency_key: 'idem-2' });
            expect(order?.status).toBe('CANCELLED');
            expect(order?.cancel_reason).toBe('PAYMENT_INTENT_FAILED');
        });
    });

    describe('updateOrderStatus', () => {
        it('should follow lifecycle transitions: PENDING -> CONFIRMED', async () => {
            const order = await OrderModel.create({
                customer_id: new mongoose.Types.ObjectId(),
                status: 'PENDING',
                payment_status: 'UNPAID',
                items: [{ variant_id: variantId, sku: 'SKU-1', quantity: 1, price_at_purchase: 100 }],
                total_amount: 100,
                idempotency_key: 'idem-lifecycle-1',
                shipping_address: { recipient_name: 'John', street: '123 St', city: 'City', state: 'ST', postcode: '12345', country: 'US' },
            });

            const updated = await updateOrderStatus(order._id.toString(), 'CONFIRMED');
            expect(updated.status).toBe('CONFIRMED');
        });

        it('should throw error on illegal transition: PENDING -> DELIVERED', async () => {
            const order = await OrderModel.create({
                customer_id: new mongoose.Types.ObjectId(),
                status: 'PENDING',
                payment_status: 'UNPAID',
                items: [{ variant_id: variantId, sku: 'SKU-1', quantity: 1, price_at_purchase: 100 }],
                total_amount: 100,
                idempotency_key: 'idem-lifecycle-2',
                shipping_address: { recipient_name: 'John', street: '123 St', city: 'City', state: 'ST', postcode: '12345', country: 'US' },
            });

            let error: any;
            try {
                await updateOrderStatus(order._id.toString(), 'DELIVERED');
            } catch (err) {
                error = err;
            }
            expect(error).toBeDefined();
        });
    });

    describe('verifyRazorpayPayment', () => {
        const razorpayOrderId = 'order_rzp_123';
        const razorpayPaymentId = 'pay_rzp_123';

        function computeSignature(orderId: string, payId: string) {
            return crypto
                .createHmac('sha256', config.razorpayKeySecret)
                .update(`${orderId}|${payId}`)
                .digest('hex');
        }

        it('should verify payment, convert reservation to sale, and mark order PAID', async () => {
            // Reserve inventory
            await InventoryModel.updateOne({ _id: variantId }, { $inc: { reserved: 2 } });

            const order = await OrderModel.create({
                customer_id: new mongoose.Types.ObjectId(),
                status: 'PENDING',
                payment_status: 'UNPAID',
                payment_method: 'RAZORPAY',
                items: [{ variant_id: variantId, sku: 'SKU-1', quantity: 2, price_at_purchase: 100 }],
                total_amount: 200,
                idempotency_key: 'idem-rzp-1',
                shipping_address: { recipient_name: 'John', street: '123 St', city: 'City', state: 'ST', postcode: '12345', country: 'IN' },
            });

            const validSig = computeSignature(razorpayOrderId, razorpayPaymentId);
            const updatedOrder = await verifyRazorpayPayment(
                order._id.toString(),
                razorpayPaymentId,
                razorpayOrderId,
                validSig
            );

            expect(updatedOrder.payment_status).toBe('PAID');
            expect(updatedOrder.status).toBe('CONFIRMED');

            // Verify inventory converted reservation to sale (stock: 10->8, reserved: 2->0)
            const inv = await InventoryModel.findById(variantId);
            expect(inv?.stock).toBe(8);
            expect(inv?.reserved).toBe(0);
        });

        it('should throw error for invalid HMAC signature', async () => {
            const order = await OrderModel.create({
                customer_id: new mongoose.Types.ObjectId(),
                status: 'PENDING',
                payment_status: 'UNPAID',
                items: [{ variant_id: variantId, sku: 'SKU-1', quantity: 1, price_at_purchase: 100 }],
                total_amount: 100,
                idempotency_key: 'idem-rzp-2',
                shipping_address: { recipient_name: 'John', street: '123 St', city: 'City', state: 'ST', postcode: '12345', country: 'IN' },
            });

            let error: any;
            try {
                await verifyRazorpayPayment(
                    order._id.toString(),
                    razorpayPaymentId,
                    razorpayOrderId,
                    'invalid_signature'
                );
            } catch (err) {
                error = err;
            }
            expect(error).toBeDefined();
            expect(error.message).toContain('Invalid Razorpay payment signature');
        });

        it('should reject invalid signature BEFORE checking cancelled order status', async () => {
            const cancelledOrder = await OrderModel.create({
                customer_id: new mongoose.Types.ObjectId(),
                status: 'CANCELLED',
                payment_status: 'UNPAID',
                items: [{ variant_id: variantId, sku: 'SKU-1', quantity: 1, price_at_purchase: 100 }],
                total_amount: 100,
                idempotency_key: 'idem-rzp-3',
                shipping_address: { recipient_name: 'John', street: '123 St', city: 'City', state: 'ST', postcode: '12345', country: 'IN' },
            });

            let error: any;
            try {
                await verifyRazorpayPayment(
                    cancelledOrder._id.toString(),
                    razorpayPaymentId,
                    razorpayOrderId,
                    'forged_signature'
                );
            } catch (err) {
                error = err;
            }
            expect(error).toBeDefined();
            expect(error.message).toContain('Invalid Razorpay payment signature');
        });
    });
});

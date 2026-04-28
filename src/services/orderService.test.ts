import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createOrder, updateOrderStatus } from './orderService';
import { OrderModel } from '../models/order';
import { InventoryModel } from '../models/inventory';

// Mock Redis
const redisMock: any = {
    get: jest.fn(),
    set: jest.fn(),
};
jest.mock('../utils/redisClient', () => ({
    getRedis: () => redisMock,
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
    orderNotifyQueue: { add: jest.fn() },
    paymentExpiryQueue: { add: jest.fn() },
}));

let mongoReplSet: MongoMemoryReplSet;

beforeAll(async () => {
    mongoReplSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongoReplSet.getUri());
    await InventoryModel.ensureIndexes();
    await OrderModel.ensureIndexes();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoReplSet.stop();
});

beforeEach(async () => {
    await OrderModel.deleteMany({});
    await InventoryModel.deleteMany({});
    jest.clearAllMocks();
});

describe('OrderService', () => {
    const variantId = new mongoose.Types.ObjectId().toString();

    beforeEach(async () => {
        await InventoryModel.create({
            _id: variantId,
            product_id: new mongoose.Types.ObjectId().toString(),
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

            await expect(createOrder(orderData)).rejects.toThrow();

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

            await expect(updateOrderStatus(order._id.toString(), 'DELIVERED')).rejects.toThrow();
        });
    });
});

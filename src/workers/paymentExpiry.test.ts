import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// Mock Redis
jest.mock('../utils/redisClient', () => ({
    getRedis: () => ({
        get: jest.fn(),
        set: jest.fn(),
    }),
    getRedisOptions: () => ({}),
}));

// Mock BullMQ
jest.mock('../queues/queues', () => ({
    paymentExpiryQueue: { add: jest.fn() },
}));

// Mock Audit Log System
jest.mock('../middleware/auditLog', () => ({
    writeSystemAuditLog: jest.fn(),
}));

import { OrderModel } from '../models/order';
import { InventoryModel } from '../models/inventory';

let mongoServer: MongoMemoryServer;
let processPaymentExpiry: any;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    const mod = await import('../workers/paymentExpiry');
    processPaymentExpiry = mod.processPaymentExpiry;
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await OrderModel.deleteMany({});
    await InventoryModel.deleteMany({});
    jest.clearAllMocks();
});

describe('PaymentExpiry Worker', () => {
    const variantId = new mongoose.Types.ObjectId().toString();

    beforeEach(async () => {
        await InventoryModel.create({
            _id: variantId,
            product_id: new mongoose.Types.ObjectId().toString(),
            sku: 'SKU-EXP',
            stock: 10,
            reserved: 5,
            low_stock_threshold: 1,
        });
    });

    it('should cancel expired orders and release inventory', async () => {
        const expiredOrder = await OrderModel.create({
            customer_id: new mongoose.Types.ObjectId(),
            status: 'PENDING',
            payment_status: 'UNPAID',
            items: [{ variant_id: variantId, sku: 'SKU-EXP', quantity: 5, price_at_purchase: 100 }],
            payment_deadline_at: new Date(Date.now() - 1000), // 1 second ago
            total_amount: 500,
            idempotency_key: 'idem-exp-worker-1',
            shipping_address: { recipient_name: 'John', street: '123 St', city: 'City', state: 'ST', postcode: '12345', country: 'US' },
        });

        const activeOrder = await OrderModel.create({
            customer_id: new mongoose.Types.ObjectId(),
            status: 'PENDING',
            payment_status: 'UNPAID',
            items: [{ variant_id: variantId, sku: 'SKU-EXP', quantity: 1, price_at_purchase: 100 }],
            payment_deadline_at: new Date(Date.now() + 100000), // Future
            total_amount: 100,
            idempotency_key: 'idem-exp-worker-2',
            shipping_address: { recipient_name: 'Jane', street: '456 St', city: 'City', state: 'ST', postcode: '12345', country: 'US' },
        });

        await processPaymentExpiry();

        const cancelled = await OrderModel.findById(expiredOrder._id);
        expect(cancelled?.status).toBe('CANCELLED');
        expect(cancelled?.cancel_reason).toBe('PAYMENT_TIMEOUT');

        const stillPending = await OrderModel.findById(activeOrder._id);
        expect(stillPending?.status).toBe('PENDING');

        // Inventory should be released (5 + initially 5 reserved = 10? No, let's check inventory)
        // In the test setup, reserved was 5. expiredOrder had 5 items. 
        // releaseReservation will decrement reserved by 5.
        const inv = await InventoryModel.findById(variantId);
        expect(inv?.reserved).toBe(0);
    });
});


import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { reserveItems, convertReservationToSale, releaseReservation } from './inventoryService';
import { InventoryModel } from '../models/inventory';

// Mock Redis
jest.mock('../utils/redisClient', () => ({
    getRedis: () => ({
        get: jest.fn(),
        set: jest.fn(),
    }),
}));

// Mock BullMQ
jest.mock('../queues/queues', () => ({
    lowStockQueue: { add: jest.fn() },
}));

let mongoReplSet: MongoMemoryReplSet;

beforeAll(async () => {
    mongoReplSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongoReplSet.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoReplSet.stop();
});

beforeEach(async () => {
    await InventoryModel.deleteMany({});
    jest.clearAllMocks();
});

describe('InventoryService', () => {
    const variantId = new mongoose.Types.ObjectId().toString();
    const productId = new mongoose.Types.ObjectId().toString();

    beforeEach(async () => {
        await InventoryModel.create({
            _id: variantId,
            product_id: productId,
            sku: 'TEST-SKU',
            stock: 10,
            reserved: 0,
            low_stock_threshold: 2,
            manual_adjustment_log: [],
        });
    });

    describe('reserveItems', () => {
        it('should reserve items if enough stock is available', async () => {
            const session = await mongoose.startSession();
            await session.withTransaction(async () => {
                await reserveItems(session, [{ variant_id: variantId, quantity: 5 }]);
            });
            await session.endSession();

            const inv = await InventoryModel.findById(variantId);
            expect(inv?.reserved).toBe(5);
        });

        it('should throw INSUFFICIENT_STOCK if stock - reserved < quantity', async () => {
            const session = await mongoose.startSession();
            await expect(session.withTransaction(async () => {
                await reserveItems(session, [{ variant_id: variantId, quantity: 11 }]);
            })).rejects.toThrow();
            await session.endSession();

            const inv = await InventoryModel.findById(variantId);
            expect(inv?.reserved).toBe(0);
        });
    });

    describe('convertReservationToSale', () => {
        it('should decrement stock and reserved count', async () => {
            // Setup reservation
            await InventoryModel.updateOne({ _id: variantId }, { $inc: { reserved: 5 } });

            await convertReservationToSale(variantId, 5);

            const inv = await InventoryModel.findById(variantId);
            expect(inv?.stock).toBe(5);
            expect(inv?.reserved).toBe(0);
        });
    });

    describe('releaseReservation', () => {
        it('should decrement reserved count', async () => {
            await InventoryModel.updateOne({ _id: variantId }, { $inc: { reserved: 5 } });

            await releaseReservation(variantId, 5);

            const inv = await InventoryModel.findById(variantId);
            expect(inv?.reserved).toBe(0);
            expect(inv?.stock).toBe(10);
        });
    });
});

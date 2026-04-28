import mongoose from 'mongoose';
import { InventoryModel } from '../models/inventory';
import { AppError, ErrorCodes } from '../utils/errors';
import { parsePaginationParams, buildCursorQuery, buildPaginationResult } from '../utils/pagination';

export async function listInventory(query: Record<string, string | undefined>) {
    const { limit, cursor, sortField, sortOrder } = parsePaginationParams(query, ['stock', 'updated_at']);
    const filter: any = {};

    if (query.low_stock === 'true') {
        filter.$expr = { $lte: [{ $subtract: ['$stock', '$reserved'] }, '$low_stock_threshold'] };
    }

    const cursorQuery = buildCursorQuery(cursor, sortField, sortOrder);
    const combinedFilter = { ...filter, ...cursorQuery };

    const items = await InventoryModel.find(combinedFilter)
        .sort({ [sortField]: sortOrder, _id: sortOrder })
        .limit(limit + 1)
        .lean();

    return buildPaginationResult(items, limit, sortField);
}

export async function getInventoryByVariantId(variantId: string) {
    const inv = await InventoryModel.findById(variantId).lean();
    if (!inv) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Inventory not found');
    return inv;
}

// Atomic cart reservation — all-or-nothing within a session
export async function reserveItems(
    session: mongoose.ClientSession,
    items: Array<{ variant_id: string; quantity: number }>
): Promise<void> {
    for (const item of items) {
        const result = await InventoryModel.findOneAndUpdate(
            {
                _id: new mongoose.Types.ObjectId(item.variant_id),
                $expr: { $gte: [{ $subtract: ['$stock', '$reserved'] }, item.quantity] },
            },
            { $inc: { reserved: item.quantity } },
            { session, new: true }
        );
        if (!result) {
            throw new AppError(
                ErrorCodes.INSUFFICIENT_STOCK.code,
                ErrorCodes.INSUFFICIENT_STOCK.statusCode,
                `Insufficient stock for variant ${item.variant_id}`
            );
        }
    }
}

// On payment success: decrement stock and reserved together (idempotent)
export async function convertReservationToSale(
    variantId: string,
    qty: number
): Promise<void> {
    await InventoryModel.updateOne(
        { _id: new mongoose.Types.ObjectId(variantId) },
        { $inc: { stock: -qty, reserved: -qty } }
    );
}

// On cancel/expiry: release reserved only
export async function releaseReservation(
    variantId: string,
    qty: number
): Promise<void> {
    await InventoryModel.updateOne(
        { _id: new mongoose.Types.ObjectId(variantId) },
        { $inc: { reserved: -qty } }
    );
}

// Manual admin adjustment
export async function adjustInventory(
    variantId: string,
    delta: number,
    reason: string,
    adminId: string
): Promise<any> {
    const inv = await InventoryModel.findById(variantId);
    if (!inv) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Inventory not found');

    inv.stock += delta;
    if (inv.stock < 0) inv.stock = 0;

    inv.manual_adjustment_log.push({
        delta,
        reason,
        admin_id: new mongoose.Types.ObjectId(adminId),
        timestamp: new Date(),
    });

    await inv.save();
    return inv;
}

// Check if low stock alert is needed
export function isLowStock(inv: { stock: number; reserved: number; low_stock_threshold: number }): boolean {
    return (inv.stock - inv.reserved) <= inv.low_stock_threshold;
}

import mongoose, { Schema, Document } from 'mongoose';

export interface IManualAdjustment {
    delta: number;
    reason: string;
    admin_id: mongoose.Types.ObjectId;
    timestamp: Date;
}

export interface IInventory extends Document {
    _id: mongoose.Types.ObjectId; // = variant_id
    product_id: mongoose.Types.ObjectId;
    sku: string;
    stock: number;
    reserved: number;
    low_stock_threshold: number;
    manual_adjustment_log: IManualAdjustment[];
    updated_at: Date;
}

const manualAdjustmentSchema = new Schema<IManualAdjustment>({
    delta: { type: Number, required: true },
    reason: { type: String, required: true },
    admin_id: { type: Schema.Types.ObjectId, required: true },
    timestamp: { type: Date, default: () => new Date() },
}, { _id: false });

const inventorySchema = new Schema<IInventory>({
    _id: { type: Schema.Types.ObjectId, required: true }, // variant_id
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: { type: String, required: true },
    stock: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
    low_stock_threshold: { type: Number, default: 10 },
    manual_adjustment_log: [manualAdjustmentSchema],
}, {
    timestamps: { createdAt: false, updatedAt: 'updated_at' },
});

inventorySchema.index({ stock: 1 });
inventorySchema.index({ product_id: 1 });

export const InventoryModel = mongoose.model<IInventory>('Inventory', inventorySchema);

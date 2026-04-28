import mongoose, { Schema, Document } from 'mongoose';

export interface IVariant {
    _id: mongoose.Types.ObjectId;
    sku: string;
    price: number;
    attributes: Record<string, any>;
}

export interface IProduct extends Document {
    name: string;
    description: string;
    category_id: mongoose.Types.ObjectId;
    tags: string[];
    images: string[];
    status: 'active' | 'draft' | 'archived';
    variants: IVariant[];
    created_at: Date;
    updated_at: Date;
}

const variantSchema = new Schema<IVariant>({
    sku: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    attributes: { type: Schema.Types.Mixed, default: {} },
}, { _id: true });

const productSchema = new Schema<IProduct>({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category_id: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    tags: [{ type: String }],
    images: [{ type: String }],
    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'draft' },
    variants: [variantSchema],
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

productSchema.index({ 'variants.sku': 1 }, { unique: true });
productSchema.index({ tags: 1 });
productSchema.index({ category_id: 1 });
productSchema.index({ status: 1 });

export const ProductModel = mongoose.model<IProduct>('Product', productSchema);

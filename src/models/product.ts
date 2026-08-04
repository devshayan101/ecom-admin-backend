import mongoose, { Schema, Document } from 'mongoose';

export interface IVariant {
    _id: mongoose.Types.ObjectId;
    sku: string;
    price: number;
    image?: string;
    attributes: Record<string, any>;
}

export interface ITaxSlab {
    region: string;
    rate: number;
}

export interface IProductKeyValue {
    key: string;
    value: string;
}

export interface IProductFaq {
    question: string;
    answer: string;
}

export interface IProductDisplayConfig {
    top_highlights?: boolean;
    about_this_item?: boolean;
    additional_information?: boolean;
    style_details?: boolean;
    features_specs?: boolean;
    faqs?: boolean;
}

export interface IProduct extends Document {
    name: string;
    description: string;
    category_id: mongoose.Types.ObjectId;
    tags: string[];
    images: string[];
    status: 'active' | 'draft' | 'archived';
    variants: IVariant[];
    tax_slabs?: ITaxSlab[];
    rating_average?: number;
    rating_count?: number;
    top_highlights?: IProductKeyValue[];
    about_this_item?: string[];
    additional_information?: IProductKeyValue[];
    style_details?: IProductKeyValue[];
    features_specs?: IProductKeyValue[];
    faqs?: IProductFaq[];
    display_configs?: IProductDisplayConfig;
    variation_categories?: string[];
    created_at: Date;
    updated_at: Date;
}

const variantSchema = new Schema<IVariant>({
    sku: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    image: { type: String },
    attributes: { type: Schema.Types.Mixed, default: {} },
}, { _id: true });

const keyValueSchema = new Schema<IProductKeyValue>({
    key: { type: String, required: true },
    value: { type: String, required: true }
}, { _id: false });

const faqSchema = new Schema<IProductFaq>({
    question: { type: String, required: true },
    answer: { type: String, required: true }
}, { _id: false });

const productSchema = new Schema<IProduct>({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category_id: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    tags: [{ type: String }],
    images: [{ type: String }],
    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'draft' },
    variants: [variantSchema],
    tax_slabs: [{
        region: { type: String, required: true },
        rate: { type: Number, required: true, min: 0, max: 100 }
    }],
    rating_average: { type: Number, default: 0 },
    rating_count: { type: Number, default: 0 },
    top_highlights: { type: [keyValueSchema], default: [] },
    about_this_item: { type: [String], default: [] },
    additional_information: { type: [keyValueSchema], default: [] },
    style_details: { type: [keyValueSchema], default: [] },
    features_specs: { type: [keyValueSchema], default: [] },
    faqs: { type: [faqSchema], default: [] },
    display_configs: {
        type: {
            top_highlights: { type: Boolean, default: true },
            about_this_item: { type: Boolean, default: true },
            additional_information: { type: Boolean, default: true },
            style_details: { type: Boolean, default: true },
            features_specs: { type: Boolean, default: true },
            faqs: { type: Boolean, default: true }
        },
        default: {
            top_highlights: true,
            about_this_item: true,
            additional_information: true,
            style_details: true,
            features_specs: true,
            faqs: true
        }
    },
    variation_categories: [{ type: String }]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

productSchema.index({ 'variants.sku': 1 }, { unique: true });
productSchema.index({ tags: 1 });
productSchema.index({ category_id: 1 });
productSchema.index({ status: 1 });

export const ProductModel = mongoose.model<IProduct>('Product', productSchema);

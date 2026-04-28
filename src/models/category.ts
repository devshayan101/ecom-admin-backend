import mongoose, { Schema, Document } from 'mongoose';

export interface IAttributeSchema {
    key: string;
    type: 'string' | 'number' | 'boolean' | 'enum';
    values?: string[];
}

export interface ICategory extends Document {
    name: string;
    slug: string;
    parent_id: mongoose.Types.ObjectId | null;
    attribute_schema: IAttributeSchema[];
    created_at: Date;
    updated_at: Date;
}

const attributeSchemaItem = new Schema<IAttributeSchema>({
    key: { type: String, required: true },
    type: { type: String, enum: ['string', 'number', 'boolean', 'enum'], required: true },
    values: [{ type: String }],
}, { _id: false });

const categorySchema = new Schema<ICategory>({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    parent_id: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    attribute_schema: [attributeSchemaItem],
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

categorySchema.index({ slug: 1 }, { unique: true });

export const CategoryModel = mongoose.model<ICategory>('Category', categorySchema);

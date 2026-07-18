import mongoose, { Schema, Document } from 'mongoose';

export interface IReview extends Document {
    product_id: mongoose.Types.ObjectId;
    customer_id: mongoose.Types.ObjectId;
    customer_name: string;
    rating: number;
    title: string;
    comment: string;
    images: string[];
    status: 'pending' | 'approved' | 'rejected';
    admin_reply?: {
        text: string;
        replied_at: Date;
        replied_by: mongoose.Types.ObjectId;
    };
    created_at: Date;
    updated_at: Date;
}

const reviewSchema = new Schema<IReview>({
    product_id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customer_name: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: '' },
    comment: { type: String, default: '' },
    images: [{ type: String }],
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    admin_reply: {
        text: { type: String },
        replied_at: { type: Date },
        replied_by: { type: Schema.Types.ObjectId, ref: 'AdminUser' }
    }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

reviewSchema.index({ product_id: 1, status: 1 });
reviewSchema.index({ created_at: -1 });

export const ReviewModel = mongoose.model<IReview>('Review', reviewSchema);

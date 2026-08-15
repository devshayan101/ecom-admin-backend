import mongoose, { Schema, Document } from 'mongoose';

export type DiscountType = 'PERCENTAGE' | 'FIXED';

export interface ICoupon extends Document {
    code: string;
    discount_type: DiscountType;
    discount_value: number;
    min_order_amount: number;
    max_discount_amount?: number | null;
    start_date?: Date | null;
    end_date?: Date | null;
    usage_limit?: number | null;
    used_count: number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

const couponSchema = new Schema<ICoupon>({
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discount_type: { type: String, enum: ['PERCENTAGE', 'FIXED'], required: true },
    discount_value: { type: Number, required: true, min: 0 },
    min_order_amount: { type: Number, default: 0, min: 0 },
    max_discount_amount: { type: Number, default: null },
    start_date: { type: Date, default: null },
    end_date: { type: Date, default: null },
    usage_limit: { type: Number, default: null },
    used_count: { type: Number, default: 0, min: 0 },
    is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ is_active: 1 });

export const CouponModel = mongoose.model<ICoupon>('Coupon', couponSchema);

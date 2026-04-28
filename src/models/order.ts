import mongoose, { Schema, Document } from 'mongoose';

export interface IOrderItem {
    variant_id: string;
    sku: string;
    price_at_purchase: number;
    quantity: number;
}

export interface IShippingAddress {
    recipient_name: string;
    street: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
}

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PAID';
export type CancelReason = 'PAYMENT_TIMEOUT' | 'ADMIN_CANCELLED' | 'MANUAL_REMEDIATION' | null;

export interface IOrder extends Document {
    customer_id: mongoose.Types.ObjectId;
    status: OrderStatus;
    payment_status: PaymentStatus;
    stripe_payment_intent_id: string;
    idempotency_key: string;
    payment_deadline_at: Date | null;
    paid_at: Date | null;
    cancel_reason: CancelReason;
    shipping_address: IShippingAddress;
    items: IOrderItem[];
    total_amount: number;
    created_at: Date;
    updated_at: Date;
}

const orderItemSchema = new Schema<IOrderItem>({
    variant_id: { type: String, required: true },
    sku: { type: String, required: true },
    price_at_purchase: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
}, { _id: false });

const shippingAddressSchema = new Schema<IShippingAddress>({
    recipient_name: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postcode: { type: String, required: true },
    country: { type: String, required: true },
}, { _id: false });

const orderSchema = new Schema<IOrder>({
    customer_id: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    status: { type: String, enum: ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'], default: 'PENDING' },
    payment_status: { type: String, enum: ['UNPAID', 'PAID'], default: 'UNPAID' },
    stripe_payment_intent_id: { type: String, default: '' },
    idempotency_key: { type: String, required: true, unique: true },
    payment_deadline_at: { type: Date, default: null },
    paid_at: { type: Date, default: null },
    cancel_reason: { type: String, enum: ['PAYMENT_TIMEOUT', 'ADMIN_CANCELLED', 'MANUAL_REMEDIATION', null], default: null },
    shipping_address: { type: shippingAddressSchema, required: true },
    items: [orderItemSchema],
    total_amount: { type: Number, required: true, min: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

orderSchema.index({ created_at: -1 });
orderSchema.index({ customer_id: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ payment_status: 1 });
// orderSchema.index({ idempotency_key: 1 }, { unique: true });

export const OrderModel = mongoose.model<IOrder>('Order', orderSchema);

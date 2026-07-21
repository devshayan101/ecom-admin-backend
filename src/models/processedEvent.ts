import mongoose, { Schema, Document } from 'mongoose';

export interface IProcessedEvent extends Document {
    _id: string; // Webhook event ID (Stripe or Razorpay)
    order_id: mongoose.Types.ObjectId;
    type: 'stripe' | 'razorpay';
    processed_at: Date;
    notification_sent: boolean;
    audit_logged: boolean;
}

const processedEventSchema = new Schema<IProcessedEvent>({
    _id: { type: String, required: true },
    order_id: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    type: { type: String, enum: ['stripe', 'razorpay'], required: true },
    processed_at: { type: Date, default: Date.now },
    notification_sent: { type: Boolean, default: false },
    audit_logged: { type: Boolean, default: false },
});

export const ProcessedEventModel = mongoose.model<IProcessedEvent>('ProcessedEvent', processedEventSchema);

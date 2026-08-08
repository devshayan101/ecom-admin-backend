import mongoose, { Schema, Document } from 'mongoose';

export interface IWishlist extends Document {
    customerId: mongoose.Types.ObjectId;
    productIds: string[];
    created_at: Date;
    updated_at: Date;
}

const wishlistSchema = new Schema<IWishlist>({
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, unique: true },
    productIds: [{ type: String, required: true }]
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const WishlistModel = mongoose.model<IWishlist>('Wishlist', wishlistSchema);

import mongoose, { Schema, Document } from 'mongoose';

export interface IAddress {
    street: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
}

export interface ICustomer extends Document {
    name: string;
    email: string;
    phone: string;
    is_active: boolean;
    address: IAddress;
    created_at: Date;
    updated_at: Date;
}

const addressSchema = new Schema<IAddress>({
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    postcode: { type: String, default: '' },
    country: { type: String, default: '' },
}, { _id: false });

const customerSchema = new Schema<ICustomer>({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, default: '' },
    is_active: { type: Boolean, default: true },
    address: { type: addressSchema, default: () => ({}) },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

customerSchema.index({ email: 1 }, { unique: true });
customerSchema.index({ created_at: -1 });

export const CustomerModel = mongoose.model<ICustomer>('Customer', customerSchema);

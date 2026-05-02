import mongoose, { Schema, Document } from 'mongoose';

export interface IAdminUser extends Document {
    name: string;
    email: string;
    password_hash: string;
    role: 'superadmin' | 'manager' | 'viewer';
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

const adminUserSchema = new Schema<IAdminUser>({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    role: { type: String, enum: ['superadmin', 'manager', 'viewer'], required: true },
    is_active: { type: Boolean, default: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });


export const AdminUserModel = mongoose.model<IAdminUser>('AdminUser', adminUserSchema);

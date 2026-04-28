import mongoose, { Schema, Document } from 'mongoose';

export interface IRole extends Document {
    name: string;
    permissions: string[];
    created_at: Date;
}

const roleSchema = new Schema<IRole>({
    name: { type: String, required: true, unique: true },
    permissions: [{ type: String }],
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

export const RoleModel = mongoose.model<IRole>('Role', roleSchema);

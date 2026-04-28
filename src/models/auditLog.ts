import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
    actor_type: 'admin' | 'system' | 'webhook';
    actor_id: mongoose.Types.ObjectId | null;
    action: string;
    result: 'success' | 'rejected' | 'failed';
    entity_type: string;
    entity_id: string | null;
    changes: { before: any | null; after: any | null };
    error_code: string | null;
    error_message: string | null;
    ip: string | null;
    created_at: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
    actor_type: { type: String, enum: ['admin', 'system', 'webhook'], required: true },
    actor_id: { type: Schema.Types.ObjectId, default: null },
    action: { type: String, required: true },
    result: { type: String, enum: ['success', 'rejected', 'failed'], required: true },
    entity_type: { type: String, required: true },
    entity_id: { type: String, default: null },
    changes: {
        before: { type: Schema.Types.Mixed, default: null },
        after: { type: Schema.Types.Mixed, default: null },
    },
    error_code: { type: String, default: null },
    error_message: { type: String, default: null },
    ip: { type: String, default: null },
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

auditLogSchema.index({ entity_type: 1, entity_id: 1 });
auditLogSchema.index({ actor_id: 1 });
auditLogSchema.index({ actor_type: 1, result: 1 });
auditLogSchema.index({ created_at: -1 });

export const AuditLogModel = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

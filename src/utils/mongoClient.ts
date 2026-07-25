import mongoose from 'mongoose';
import { config } from '../config/secrets';

let hasReplicaSet = false;

export async function connectMongo(): Promise<void> {
    await mongoose.connect(config.mongoUri);
    console.log('MongoDB connected');
    const db = mongoose.connection.db;
    if (db) {
        try {
            const adminDb = db.admin();
            const status = await adminDb.command({ isMaster: 1 });
            hasReplicaSet = !!status.setName;
            console.log(`MongoDB replica set support detected: ${hasReplicaSet}`);
        } catch (e) {
            console.warn('Failed to detect MongoDB topology, defaulting to standalone (no transactions):', e);
            hasReplicaSet = false;
        }
    } else {
        console.warn('MongoDB connection db object is undefined');
        hasReplicaSet = false;
    }
}

export async function disconnectMongo(): Promise<void> {
    await mongoose.disconnect();
}

export function supportsTransactions(): boolean {
    return hasReplicaSet;
}

export async function runInTransaction<T>(
    callback: (session?: mongoose.ClientSession) => Promise<T>
): Promise<T> {
    if (supportsTransactions()) {
        const session = await mongoose.startSession();
        try {
            session.startTransaction();
            const result = await callback(session);
            await session.commitTransaction();
            return result;
        } catch (err) {
            if (session.inTransaction()) {
                await session.abortTransaction();
            }
            throw err;
        } finally {
            await session.endSession();
        }
    } else {
        return callback();
    }
}

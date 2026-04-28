import mongoose from 'mongoose';
import { config } from '../config/secrets';

export async function connectMongo(): Promise<void> {
    await mongoose.connect(config.mongoUri);
    console.log('MongoDB connected');
}

export async function disconnectMongo(): Promise<void> {
    await mongoose.disconnect();
}

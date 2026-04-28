import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import Redis from 'ioredis-mock';
import jwt from 'jsonwebtoken';
import { login, refresh, logout } from './authService';
import { AdminUserModel } from '../models/adminUser';
import { RoleModel } from '../models/role';
import Bcrypt from 'bcrypt';
import { config } from '../config/secrets';

// Mock Redis
const redisMock = new Redis();
jest.mock('../utils/redisClient', () => ({
    getRedis: () => redisMock,
}));

// Mock JWT
jest.mock('jsonwebtoken', () => ({
    sign: jest.fn().mockReturnValue('mocked_token'),
    decode: jest.fn().mockReturnValue({ jti: 'mocked_jti' }),
}));

// Mock SES
jest.mock('../utils/sesClient', () => ({
    sendEmail: jest.fn(),
}));

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await AdminUserModel.deleteMany({});
    await RoleModel.deleteMany({});
    await redisMock.flushall();
    jest.clearAllMocks();
});

describe('AuthService', () => {
    const password = 'Password123!';

    beforeEach(async () => {
        // Seed a role and a user
        await RoleModel.create({ name: 'superadmin', permissions: ['*'] });
        const hashedPassword = await Bcrypt.hash(password, 12);
        await AdminUserModel.create({
            name: 'Admin',
            email: 'admin@example.com',
            password_hash: hashedPassword,
            role: 'superadmin',
            is_active: true,
        });
    });

    describe('login', () => {
        it('should return tokens and sessionId on successful login', async () => {
            const result = await login('admin@example.com', password);

            expect(result.accessToken).toBeDefined();
            expect(result.refreshToken).toBeDefined();
            expect(result.sessionId).toBeDefined();
            expect(result.user.email).toBe('admin@example.com');

            // Check if session is in Redis
            const session = await redisMock.get(`session:${result.sessionId}`);
            expect(session).toBeDefined();
            const sessionData = JSON.parse(session!);
            expect(sessionData.userId).toBeDefined();
        });

        it('should throw UNAUTHORIZED on wrong password', async () => {
            await expect(login('admin@example.com', 'wrongpassword')).rejects.toThrow();
        });
    });

    describe('refresh', () => {
        it('should rotate tokens if refresh token is valid', async () => {
            const { refreshToken: oldToken, sessionId } = await login('admin@example.com', password);

            const result = await refresh(sessionId, oldToken);

            expect(result.accessToken).toBeDefined();
            expect(result.refreshToken).not.toBe(oldToken);

            // Session in Redis should be updated, not deleted (session rotation logic)
            expect(await redisMock.get(`session:${sessionId}`)).toBeDefined();
        });

        it('should throw REFRESH_TOKEN_REUSED and clear session if token is reused', async () => {
            const { refreshToken, sessionId } = await login('admin@example.com', password);
            await refresh(sessionId, refreshToken); // First refresh works

            // Second refresh with same token (reuse)
            await expect(refresh(sessionId, refreshToken)).rejects.toThrow();

            // Session should be cleared from Redis
            expect(await redisMock.get(`session:${sessionId}`)).toBeNull();
        });
    });

    describe('logout', () => {
        it('should revoke access token and delete refresh token', async () => {
            const { accessToken, refreshToken, sessionId } = await login('admin@example.com', password);
            const decoded = jwt.decode(accessToken) as any;

            await logout(decoded.jti, sessionId);

            // JTI should be in revocation set
            expect(await redisMock.get(`revoked_jti:mocked_jti`)).toBe('1');
            // Refresh token session should be deleted
            expect(await redisMock.get(`session:${sessionId}`)).toBeNull();
        });
    });
});

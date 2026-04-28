import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { AdminUserModel } from '../models/adminUser';
import { config } from '../config/secrets';
import { getRedis } from '../utils/redisClient';
import { AppError, ErrorCodes } from '../utils/errors';

// --- Login ---
export async function login(email: string, password: string) {
    const user = await AdminUserModel.findOne({ email, is_active: true });
    if (!user) {
        throw new AppError(ErrorCodes.UNAUTHORIZED.code, ErrorCodes.UNAUTHORIZED.statusCode, 'Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        throw new AppError(ErrorCodes.UNAUTHORIZED.code, ErrorCodes.UNAUTHORIZED.statusCode, 'Invalid email or password');
    }

    const jti = uuidv4();
    const accessToken = jwt.sign(
        { userId: user._id.toString(), role: user.role, jti },
        config.jwtPrivateKey,
        { algorithm: 'RS256', expiresIn: config.accessTokenExpirySeconds }
    );

    // Create refresh session in Redis
    const sessionId = uuidv4();
    const refreshToken = uuidv4();
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await getRedis().set(
        `session:${sessionId}`,
        JSON.stringify({ userId: user._id.toString(), tokenHash: refreshTokenHash }),
        'EX',
        config.refreshTokenExpirySeconds
    );

    return { accessToken, refreshToken, sessionId, user };
}

// --- Refresh ---
export async function refresh(sessionId: string, refreshToken: string) {
    const redis = getRedis();
    const sessionData = await redis.get(`session:${sessionId}`);
    if (!sessionData) {
        throw new AppError(ErrorCodes.UNAUTHORIZED.code, ErrorCodes.UNAUTHORIZED.statusCode, 'Session expired');
    }

    const session = JSON.parse(sessionData);
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    if (session.tokenHash !== tokenHash) {
        // Reuse detected — revoke the entire session
        await redis.del(`session:${sessionId}`);
        throw new AppError(ErrorCodes.REFRESH_TOKEN_REUSED.code, ErrorCodes.REFRESH_TOKEN_REUSED.statusCode, 'Refresh token reuse detected. Session revoked.');
    }

    const user = await AdminUserModel.findById(session.userId);
    if (!user || !user.is_active) {
        await redis.del(`session:${sessionId}`);
        throw new AppError(ErrorCodes.UNAUTHORIZED.code, ErrorCodes.UNAUTHORIZED.statusCode, 'User not found or inactive');
    }

    // Rotate refresh token
    const newRefreshToken = uuidv4();
    const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    await redis.set(
        `session:${sessionId}`,
        JSON.stringify({ userId: session.userId, tokenHash: newTokenHash }),
        'EX',
        config.refreshTokenExpirySeconds
    );

    // Issue new access token
    const jti = uuidv4();
    const accessToken = jwt.sign(
        { userId: user._id.toString(), role: user.role, jti },
        config.jwtPrivateKey,
        { algorithm: 'RS256', expiresIn: config.accessTokenExpirySeconds }
    );

    return { accessToken, refreshToken: newRefreshToken };
}

// --- Logout ---
export async function logout(jti: string, sessionId: string) {
    const redis = getRedis();
    // Revoke access token jti for 5 minutes
    await redis.set(`revoked_jti:${jti}`, '1', 'EX', config.accessTokenExpirySeconds);
    // Delete refresh session
    await redis.del(`session:${sessionId}`);
}

// --- Forgot Password ---
export async function forgotPassword(email: string) {
    const user = await AdminUserModel.findOne({ email, is_active: true });
    if (!user) {
        // Don't reveal whether user exists
        return;
    }

    const timestamp = Date.now().toString();
    const data = `${email}:${timestamp}`;
    const token = crypto.createHmac('sha256', config.jwtPrivateKey).update(data).digest('hex');
    const resetKey = `reset:${token}`;

    await getRedis().set(resetKey, email, 'EX', 3600); // 1 hour TTL

    return { token, email: user.email };
}

// --- Reset Password ---
export async function resetPassword(token: string, newPassword: string) {
    const redis = getRedis();
    const resetKey = `reset:${token}`;
    const email = await redis.get(resetKey);

    if (!email) {
        throw new AppError(ErrorCodes.UNAUTHORIZED.code, ErrorCodes.UNAUTHORIZED.statusCode, 'Invalid or expired reset token');
    }

    // Single-use: delete immediately
    await redis.del(resetKey);

    const hash = await bcrypt.hash(newPassword, 12);
    const user = await AdminUserModel.findOneAndUpdate(
        { email, is_active: true },
        { password_hash: hash },
        { new: true }
    );

    if (!user) {
        throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'User not found');
    }
}

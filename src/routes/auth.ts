import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { rateLimiter } from '../middleware/rateLimiter';
import * as authService from '../services/authService';
import { config } from '../config/secrets';

const auth = new Hono();

// Rate limit all auth endpoints
auth.use('/*', rateLimiter);

auth.post('/login', async (c) => {
    const { email, password } = await c.req.json();
    const result = await authService.login(email, password);

    const isSecure = config.nodeEnv !== 'development';
    setCookie(c, 'refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'Strict',
        path: '/auth',
        maxAge: config.refreshTokenExpirySeconds,
    });
    setCookie(c, 'session_id', result.sessionId, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'Strict',
        path: '/auth',
        maxAge: config.refreshTokenExpirySeconds,
    });

    return c.json({ accessToken: result.accessToken });
});

auth.post('/refresh', async (c) => {
    const refreshToken = c.req.header('Cookie')?.match(/refresh_token=([^;]+)/)?.[1];
    const sessionId = c.req.header('Cookie')?.match(/session_id=([^;]+)/)?.[1];

    if (!refreshToken || !sessionId) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing refresh token' } }, 401);
    }

    const result = await authService.refresh(sessionId, refreshToken);

    const isSecure = config.nodeEnv !== 'development';
    setCookie(c, 'refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'Strict',
        path: '/auth',
        maxAge: config.refreshTokenExpirySeconds,
    });

    return c.json({ accessToken: result.accessToken });
});

auth.post('/logout', async (c) => {
    const sessionId = c.req.header('Cookie')?.match(/session_id=([^;]+)/)?.[1];
    const authHeader = c.req.header('Authorization');
    const token = authHeader?.slice(7);

    if (token && sessionId) {
        try {
            const jwt = require('jsonwebtoken');
            const decoded = jwt.verify(token, config.jwtPublicKey, { algorithms: ['RS256'] });
            await authService.logout(decoded.jti, sessionId);
        } catch { /* token may be expired, still clear cookies */ }
    }

    deleteCookie(c, 'refresh_token', { path: '/auth' });
    deleteCookie(c, 'session_id', { path: '/auth' });

    return c.json({ message: 'Logged out' });
});

auth.post('/forgot-password', async (c) => {
    const { email } = await c.req.json();
    const result = await authService.forgotPassword(email);

    // Don't reveal whether the email exists
    return c.json({ message: 'If that email exists, a reset link has been sent.' });
});

auth.post('/reset-password', async (c) => {
    const { token, password } = await c.req.json();
    await authService.resetPassword(token, password);
    return c.json({ message: 'Password has been reset.' });
});

export default auth;

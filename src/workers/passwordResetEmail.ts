import { Worker } from 'bullmq';
import { getRedisOptions } from '../utils/redisClient';
import { sendEmail } from '../utils/resendClient';

const connection = getRedisOptions();

export function startPasswordResetEmailWorker() {
    return new Worker('password-reset-email', async (job) => {
        const { email, token } = job.data;
        const resetUrl = `${config.nodeEnv === 'production' ? 'https' : 'http'}://localhost:3000/auth/reset-password?token=${token}`;

        await sendEmail(
            email,
            'Password Reset Request',
            `<p>You requested a password reset.</p>
       <p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>
       <p>If you did not request this, please ignore this email.</p>`
        );
    }, { connection });
}

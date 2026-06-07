import { Resend } from 'resend';
import { config } from '../config/secrets';

let resend: Resend;

function getResend(): Resend {
    if (!resend) {
        resend = new Resend(config.resendApiKey);
    }
    return resend;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
    const { error } = await getResend().emails.send({
        from: config.resendFromAddress || 'onboarding@resend.dev',
        to: [to],
        subject: subject,
        html: html,
    });

    if (error) {
        throw new Error(`Failed to send email via Resend: ${error.message}`);
    }
}

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { config } from '../config/secrets';

let ses: SESClient;

function getSES(): SESClient {
    if (!ses) {
        const opts: any = { region: config.awsRegion };
        if (config.awsEndpointUrl) {
            opts.endpoint = config.awsEndpointUrl;
        }
        ses = new SESClient(opts);
    }
    return ses;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
    await getSES().send(new SendEmailCommand({
        Source: config.sesFromAddress,
        Destination: { ToAddresses: [to] },
        Message: {
            Subject: { Data: subject },
            Body: { Html: { Data: html } },
        },
    }));
}

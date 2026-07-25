import Stripe from 'stripe';
import { config } from '../config/secrets';

let stripe: Stripe;

export function getStripe(apiKey?: string): Stripe {
    if (apiKey) {
        return new Stripe(apiKey);
    }
    if (!stripe) {
        stripe = new Stripe(config.stripeSecretKey);
    }
    return stripe;
}

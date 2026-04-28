import Stripe from 'stripe';
import { config } from '../config/secrets';

let stripe: Stripe;

export function getStripe(): Stripe {
    if (!stripe) {
        stripe = new Stripe(config.stripeSecretKey);
    }
    return stripe;
}

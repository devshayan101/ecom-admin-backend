import { Hono } from 'hono';
import { getStripe } from '../utils/stripeClient';
import { getRedis } from '../utils/redisClient';
import { config } from '../config/secrets';
import { stripeEventQueue } from '../queues/queues';

const webhooks = new Hono();

// POST /webhooks/stripe — raw body required for signature verification
webhooks.post('/stripe', async (c) => {
    const signature = c.req.header('Stripe-Signature');
    if (!signature) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing Stripe-Signature' } }, 400);
    }

    const rawBody = await c.req.text();
    const stripe = getStripe();
    let event;

    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
    } catch (err: any) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: `Webhook signature verification failed: ${err.message}` } }, 400);
    }

    // Dedupe by event.id at ingress
    const redis = getRedis();
    const dedupeKey = `stripe_event:${event.id}`;
    const alreadyProcessed = await redis.set(dedupeKey, '1', 'EX', 86400, 'NX'); // NX = set only if not exists
    if (!alreadyProcessed) {
        // Already processed, acknowledge as no-op
        return c.json({ received: true });
    }

    // Enqueue normalized payload for worker processing
    await stripeEventQueue.add('stripe-event', {
        eventId: event.id,
        type: event.type,
        paymentIntentId: (event.data.object as any).id,
        metadata: (event.data.object as any).metadata,
    });

    return c.json({ received: true });
});

export default webhooks;

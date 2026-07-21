import crypto from 'crypto';
import { Hono } from 'hono';
import { getStripe } from '../utils/stripeClient';
import { getRedis } from '../utils/redisClient';
import { config } from '../config/secrets';
import { stripeEventQueue, razorpayEventQueue } from '../queues/queues';

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
    }, {
        attempts: 3,
        backoff: {
            type: 'custom',
        },
    });

    return c.json({ received: true });
});

// POST /webhooks/razorpay — raw body HMAC signature verification
webhooks.post('/razorpay', async (c) => {
    const signature = c.req.header('x-razorpay-signature');
    if (!signature) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing x-razorpay-signature' } }, 400);
    }

    const rawBody = await c.req.text();
    if (!config.razorpayWebhookSecret) {
        return c.json({ error: { code: 'SERVER_ERROR', message: 'Razorpay webhook secret not configured' } }, 500);
    }
    const expectedSignature = crypto
        .createHmac('sha256', config.razorpayWebhookSecret)
        .update(rawBody)
        .digest('hex');
    const expected = Buffer.from(expectedSignature, 'hex');
    const provided = Buffer.from(signature, 'hex');
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
        return c.json({ error: { code: 'UNAUTHORIZED', message: 'Webhook signature verification failed' } }, 400);
    }
    let payload: any;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON payload' } }, 400);
    }

    const eventId = payload.event_id || c.req.header('x-razorpay-event-id') || `rzp_evt_${Date.now()}`;
    const redis = getRedis();
    const dedupeKey = `razorpay_ingress:${eventId}`;
    const isNew = await redis.set(dedupeKey, '1', 'EX', 86400, 'NX');
    if (!isNew) {
        return c.json({ received: true });
    }

    await razorpayEventQueue.add('razorpay-event', {
        eventId,
        event: payload.event,
        payload: payload.payload,
    }, {
        attempts: 3,
        backoff: {
            type: 'custom',
        },
    });

    return c.json({ received: true });
});

export default webhooks;

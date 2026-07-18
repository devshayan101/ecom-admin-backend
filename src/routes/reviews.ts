import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import * as reviewService from '../services/reviewService';

const reviews = new Hono();

reviews.use('/*', authMiddleware);

reviews.get('/', requirePermission('reviews:read'), async (c) => {
    const query = c.req.query();
    const result = await reviewService.listReviews(query);
    return c.json(result);
});

reviews.patch('/:id', requirePermission('reviews:write'), async (c) => {
    const id = c.req.param('id')!;
    const { status } = await c.req.json();
    if (!['approved', 'rejected', 'pending'].includes(status)) {
        return c.json({ error: 'Invalid status' }, 400);
    }
    const review = await reviewService.updateReviewStatus(id, status);
    return c.json(review);
});

reviews.post('/:id/reply', requirePermission('reviews:write'), async (c) => {
    const id = c.req.param('id')!;
    const { text } = await c.req.json();
    if (typeof text !== 'string') {
        return c.json({ error: 'Reply text must be a string' }, 400);
    }
    const auth = (c as any).get('auth');
    const review = await reviewService.replyToReview(id, text, auth.userId);
    return c.json(review);
});

reviews.delete('/:id', requirePermission('reviews:write'), async (c) => {
    const id = c.req.param('id')!;
    await reviewService.deleteReview(id);
    return c.json({ message: 'Review deleted successfully' });
});

export default reviews;

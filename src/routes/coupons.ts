import { Hono } from 'hono';
import { listCoupons, getCouponById, createCoupon, updateCoupon, deleteCoupon } from '../services/couponService';
import { authMiddleware } from '../middleware/auth';

const coupons = new Hono();

coupons.use('*', authMiddleware);

// GET /coupons -> List coupons
coupons.get('/', async (c) => {
    const query = c.req.query();
    const result = await listCoupons(query);
    return c.json(result);
});

// GET /coupons/:id -> Get coupon details
coupons.get('/:id', async (c) => {
    const id = c.req.param('id');
    const coupon = await getCouponById(id);
    return c.json(coupon);
});

// POST /coupons -> Create coupon
coupons.post('/', async (c) => {
    const body = await c.req.json();
    const coupon = await createCoupon(body);
    return c.json(coupon, 201);
});

// PUT /coupons/:id -> Update coupon
coupons.put('/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const coupon = await updateCoupon(id, body);
    return c.json(coupon);
});

// DELETE /coupons/:id -> Delete coupon
coupons.delete('/:id', async (c) => {
    const id = c.req.param('id');
    const result = await deleteCoupon(id);
    return c.json(result);
});

export default coupons;

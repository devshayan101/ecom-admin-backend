import { Hono } from 'hono';
import * as productService from '../services/productService';
import * as categoryService from '../services/categoryService';
import * as orderService from '../services/orderService';
import { CustomerModel } from '../models/customer';
import { AppError, ErrorCodes } from '../utils/errors';
import { v4 as uuidv4 } from 'uuid';

const storefront = new Hono();

// GET /storefront/categories -> List all categories
storefront.get('/categories', async (c) => {
    const list = await categoryService.listCategories();
    return c.json({ items: list });
});

// GET /storefront/products -> List active products with pagination/filtering
storefront.get('/products', async (c) => {
    const query = c.req.query();
    // Force active status for storefront visitors
    const result = await productService.listProducts({ ...query, status: 'active' });
    return c.json(result);
});

// GET /storefront/products/:id -> Detail of a single active product
storefront.get('/products/:id', async (c) => {
    const id = c.req.param('id')!;
    const product = await productService.getProductById(id);
    if (product.status !== 'active') {
        throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Product not found');
    }
    return c.json(product);
});

// POST /storefront/checkout -> E-commerce guest checkout
storefront.post('/checkout', async (c) => {
    const body = await c.req.json();
    const { customer: customerData, items, payment_method } = body;

    if (!customerData || !customerData.email || !customerData.name) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Customer name and email are required');
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Order items are required');
    }

    // Find or create customer
    let customer = await CustomerModel.findOne({ email: customerData.email.trim().toLowerCase() });
    if (!customer) {
        customer = await CustomerModel.create({
            name: customerData.name,
            email: customerData.email.trim().toLowerCase(),
            phone: customerData.phone || '',
            address: customerData.address || {},
            is_active: true
        });
    } else if (!customer.is_active) {
        customer.is_active = true;
        await customer.save();
    }

    // Generate a unique Idempotency-Key
    const idempotencyKey = uuidv4();

    // Call order service
    const result = await orderService.createOrder({
        customer_id: customer._id.toString(),
        items: items.map((i: any) => ({
            variant_id: i.variant_id,
            sku: i.sku,
            price_at_purchase: i.price_at_purchase,
            quantity: i.quantity
        })),
        shipping_address: {
            recipient_name: customerData.name,
            street: customerData.address?.street || 'N/A',
            city: customerData.address?.city || 'N/A',
            state: customerData.address?.state || 'N/A',
            postcode: customerData.address?.postcode || 'N/A',
            country: customerData.address?.country || 'India'
        },
        idempotency_key: idempotencyKey,
        payment_method: payment_method || 'STRIPE'
    });

    return c.json({
        message: 'Order created successfully',
        ...result
    }, 201);
});

export default storefront;

import { Hono } from 'hono';
import * as productService from '../services/productService';
import * as categoryService from '../services/categoryService';
import * as orderService from '../services/orderService';
import * as customerService from '../services/customerService';
import * as reviewService from '../services/reviewService';
import { CustomerModel } from '../models/customer';
import { AppError, ErrorCodes } from '../utils/errors';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { config } from '../config/secrets';
import { getRedis } from '../utils/redisClient';
import { passwordResetQueue } from '../queues/queues';
import { customerAuthMiddleware, optionalCustomerAuthMiddleware, CustomerEnv } from '../middleware/customerAuth';
import { SettingsModel } from '../models/settings';
import { getCarrierRates } from '../services/carrierService';

const storefront = new Hono<CustomerEnv>();

// Helper to generate customer JWT
function generateCustomerJwt(customerId: string, email: string) {
    return jwt.sign({ customerId, email }, config.customerJwtSecret, { expiresIn: '7d' });
}

// GET /storefront/categories -> List all categories
storefront.get('/categories', async (c) => {
    const list = await categoryService.listCategories();
    return c.json({ items: list });
});

// GET /storefront/settings -> Public settings (taxes config, currency)
storefront.get('/settings', async (c) => {
    const settings = await SettingsModel.findOne({}).lean();
    if (!settings) {
        return c.json({ taxes: { taxRules: [], gstVatSettings: { enabled: false, inclusive: false } } });
    }

    let countriesConfig = settings.taxes?.countriesConfig || [];
    let taxRules = settings.taxes?.taxRules || [];

    if (settings.shipping && settings.shipping.enabled) {
        const activeZones = (settings.shipping.zones || []).filter((z: any) => z.active);
        
        countriesConfig = countriesConfig.map((country: any) => {
            const isCountryInActiveZone = activeZones.some((zone: any) => 
                zone.countries.length === 0 || zone.countries.some((cName: string) => cName.toLowerCase() === country.name.toLowerCase())
            );

            if (!isCountryInActiveZone) {
                return null;
            }

            const countryStates = country.states || [];
            const filteredStates = countryStates.filter((state: any) => {
                const stateKey = `${country.code}:${state.code}`;
                return activeZones.some((zone: any) => {
                    const countryMatch = zone.countries.length === 0 || zone.countries.some((cName: string) => cName.toLowerCase() === country.name.toLowerCase());
                    if (!countryMatch) return false;
                    return zone.states.length === 0 || zone.states.some((sKey: string) => sKey.toLowerCase() === stateKey.toLowerCase() || sKey.toLowerCase() === state.name.toLowerCase() || sKey.toLowerCase() === state.code.toLowerCase());
                });
            });

            return {
                ...country,
                states: filteredStates
            };
        }).filter(Boolean) as any[];

        taxRules = taxRules.filter((rule: any) => {
            return activeZones.some((zone: any) => {
                const countryMatch = zone.countries.length === 0 || zone.countries.some((cName: string) => cName.toLowerCase() === rule.country.toLowerCase());
                if (!countryMatch) return false;
                
                const stateKey = `${rule.countryCode}:${rule.stateCode}`;
                return zone.states.length === 0 || zone.states.some((sKey: string) => sKey.toLowerCase() === stateKey.toLowerCase() || sKey.toLowerCase() === rule.state.toLowerCase() || sKey.toLowerCase() === rule.stateCode.toLowerCase());
            });
        });
    }

    return c.json({
        taxes: {
            ...settings.taxes,
            countriesConfig,
            taxRules
        },
        general: {
            currency: settings.general?.currency || 'INR',
        }
    });
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

// --- Customer Authentication Routes ---

// POST /storefront/auth/register -> Customer credentials signup
storefront.post('/auth/register', async (c) => {
    const { email, password, name, phone, address } = await c.req.json();

    if (!email || !password || !name) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Email, password, and name are required');
    }

    const emailClean = email.trim().toLowerCase();
    let customer = await CustomerModel.findOne({ email: emailClean });

    if (customer) {
        if (customer.password_hash) {
            throw new AppError(ErrorCodes.CONFLICT.code, ErrorCodes.CONFLICT.statusCode, 'Customer with this email already exists');
        }
        // Customer exists but has no password (e.g. from guest checkout or social auth). Add credentials.
        customer.password_hash = await bcrypt.hash(password, 12);
        customer.name = name;
        if (phone) customer.phone = phone;
        if (address) customer.address = { ...customer.address, ...address };
        customer.is_active = true;
        await customer.save();
    } else {
        // Create new customer
        const passwordHash = await bcrypt.hash(password, 12);
        customer = await CustomerModel.create({
            name,
            email: emailClean,
            phone: phone || '',
            address: address || {},
            password_hash: passwordHash,
            is_active: true
        });
    }

    const token = generateCustomerJwt(customer._id.toString(), customer.email);
    return c.json({
        token,
        customer: {
            id: customer._id.toString(),
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            address: customer.address
        }
    }, 201);
});

// POST /storefront/auth/login -> Customer credentials login
storefront.post('/auth/login', async (c) => {
    const { email, password } = await c.req.json();

    if (!email || !password) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Email and password are required');
    }

    const customer = await CustomerModel.findOne({ email: email.trim().toLowerCase(), is_active: true });
    if (!customer || !customer.password_hash) {
        throw new AppError(ErrorCodes.UNAUTHORIZED.code, ErrorCodes.UNAUTHORIZED.statusCode, 'Invalid email or password');
    }

    const valid = await bcrypt.compare(password, customer.password_hash);
    if (!valid) {
        throw new AppError(ErrorCodes.UNAUTHORIZED.code, ErrorCodes.UNAUTHORIZED.statusCode, 'Invalid email or password');
    }

    const token = generateCustomerJwt(customer._id.toString(), customer.email);
    return c.json({
        token,
        customer: {
            id: customer._id.toString(),
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            address: customer.address
        }
    });
});

// POST /storefront/auth/social -> NextAuth server social login sync
storefront.post('/auth/social', async (c) => {
    const apiSecret = c.req.header('X-Storefront-Secret');
    if (!apiSecret || apiSecret !== config.storefrontApiSecret) {
        throw new AppError(ErrorCodes.UNAUTHORIZED.code, ErrorCodes.UNAUTHORIZED.statusCode, 'Invalid storefront secret');
    }

    const { email, name, provider, providerId } = await c.req.json();

    if (!email || !name || !provider || !providerId) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Email, name, provider, and providerId are required');
    }

    const emailClean = email.trim().toLowerCase();
    let customer = await CustomerModel.findOne({ email: emailClean });

    if (!customer) {
        // Create new OAuth customer
        customer = await CustomerModel.create({
            name,
            email: emailClean,
            is_active: true,
            providers: [{ provider, providerId }]
        });
    } else {
        // Customer exists, link provider if not linked
        const providerExists = customer.providers?.some(p => p.provider === provider && p.providerId === providerId);
        if (!providerExists) {
            customer.providers = customer.providers || [];
            customer.providers.push({ provider, providerId });
        }
        if (!customer.is_active) {
            customer.is_active = true;
        }
        await customer.save();
    }

    const token = generateCustomerJwt(customer._id.toString(), customer.email);
    return c.json({
        token,
        customer: {
            id: customer._id.toString(),
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            address: customer.address
        }
    });
});

// POST /storefront/auth/forgot-password -> Request password reset
storefront.post('/auth/forgot-password', async (c) => {
    const { email, redirectUrl } = await c.req.json();

    if (!email) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Email is required');
    }

    const customer = await CustomerModel.findOne({ email: email.trim().toLowerCase(), is_active: true });
    if (customer) {
        const timestamp = Date.now().toString();
        const data = `${customer.email}:${timestamp}`;
        const token = crypto.createHmac('sha256', config.customerJwtSecret).update(data).digest('hex');
        const resetKey = `reset-customer:${token}`;

        await getRedis().set(resetKey, customer.email, 'EX', 3600); // 1 hour TTL

        // Queue password reset email
        await passwordResetQueue.add('send-email', {
            email: customer.email,
            token,
            redirectUrl: redirectUrl || 'http://localhost:3001/reset-password'
        });
    }

    return c.json({ message: 'If that email exists, a reset link has been sent.' });
});

// POST /storefront/auth/reset-password -> Complete password reset
storefront.post('/auth/reset-password', async (c) => {
    const { token, password } = await c.req.json();

    if (!token || !password) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Token and password are required');
    }

    const redis = getRedis();
    const resetKey = `reset-customer:${token}`;
    const email = await redis.get(resetKey);

    if (!email) {
        throw new AppError(ErrorCodes.UNAUTHORIZED.code, ErrorCodes.UNAUTHORIZED.statusCode, 'Invalid or expired reset token');
    }

    // Single-use token: delete immediately
    await redis.del(resetKey);

    const hash = await bcrypt.hash(password, 12);
    const customer = await CustomerModel.findOneAndUpdate(
        { email, is_active: true },
        { password_hash: hash },
        { new: true }
    );

    if (!customer) {
        throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Customer not found');
    }

    return c.json({ message: 'Password has been reset successfully.' });
});

// --- Customer Profile Routes (Authenticated) ---

// GET /storefront/profile -> Get customer profile
storefront.get('/profile', customerAuthMiddleware, async (c) => {
    const customerPayload = c.get('customer')!;
    const customer = await customerService.getCustomerById(customerPayload.customerId);
    return c.json({
        id: customer._id.toString(),
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address
    });
});

// PATCH /storefront/profile -> Update customer profile
storefront.patch('/profile', customerAuthMiddleware, async (c) => {
    const customerPayload = c.get('customer')!;
    const body = await c.req.json();

    const allowedUpdates = ['name', 'phone', 'address'];
    const updates: any = {};
    for (const key of allowedUpdates) {
        if (body[key] !== undefined) {
            updates[key] = body[key];
        }
    }

    const updated = await customerService.updateCustomer(customerPayload.customerId, updates);
    return c.json({
        id: updated._id.toString(),
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        address: updated.address
    });
});

// --- Customer Orders Routes (Authenticated) ---

// GET /storefront/orders -> Get customer order history
storefront.get('/orders', customerAuthMiddleware, async (c) => {
    const customerPayload = c.get('customer')!;
    const query = c.req.query();
    const result = await customerService.getCustomerOrders(customerPayload.customerId, query);
    return c.json(result);
});

// GET /storefront/orders/:id -> Get single customer order details
storefront.get('/orders/:id', customerAuthMiddleware, async (c) => {
    const customerPayload = c.get('customer')!;
    const id = c.req.param('id')!;
    const order = await orderService.getOrderById(id);

    if (order.customer_id.toString() !== customerPayload.customerId) {
        throw new AppError(ErrorCodes.RBAC_DENIED.code, ErrorCodes.RBAC_DENIED.statusCode, 'Access Denied: You do not own this order');
    }

    return c.json(order);
});

// --- Checkout Update (Supports Guest & Authenticated checkout) ---

// POST /storefront/checkout -> E-commerce checkout
storefront.post('/checkout', optionalCustomerAuthMiddleware, async (c) => {
    const body = await c.req.json();
    const { customer: customerData, items, payment_method } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Order items are required');
    }

    const customerPayload = c.get('customer');
    let customer: any;

    if (customerPayload) {
        // Authenticated checkout: retrieve customer and optionally update contact fields if blank
        customer = await CustomerModel.findById(customerPayload.customerId);
        if (!customer) {
            throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Authenticated customer not found');
        }

        let updated = false;
        if (customerData) {
            if (customerData.name && customer.name !== customerData.name) {
                customer.name = customerData.name;
                updated = true;
            }
            if (customerData.phone && customer.phone !== customerData.phone) {
                customer.phone = customerData.phone;
                updated = true;
            }
            if (customerData.address) {
                customer.address = { ...customer.address, ...customerData.address };
                updated = true;
            }
        }
        if (updated) {
            await customer.save();
        }
    } else {
        // Guest checkout
        if (!customerData || !customerData.email || !customerData.name) {
            throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Customer name and email are required');
        }

        customer = await CustomerModel.findOne({ email: customerData.email.trim().toLowerCase() });
        if (!customer) {
            customer = await CustomerModel.create({
                name: customerData.name,
                email: customerData.email.trim().toLowerCase(),
                phone: customerData.phone || '',
                address: customerData.address || {},
                is_active: true
            });
        } else {
            // Update fields if guest provides details
            customer.name = customerData.name;
            if (customerData.phone) customer.phone = customerData.phone;
            if (customerData.address) customer.address = { ...customer.address, ...customerData.address };
            if (!customer.is_active) customer.is_active = true;
            await customer.save();
        }
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
            recipient_name: customerData?.name || customer.name,
            street: customerData?.address?.street || customer.address?.street || 'N/A',
            city: customerData?.address?.city || customer.address?.city || 'N/A',
            state: customerData?.address?.state || customer.address?.state || 'N/A',
            postcode: customerData?.address?.postcode || customer.address?.postcode || 'N/A',
            country: customerData?.address?.country || customer.address?.country || 'India'
        },
        shipping_cost: body.shipping_cost || 0,
        shipping_rate_name: body.shipping_rate_name || '',
        idempotency_key: idempotencyKey,
        payment_method: payment_method || 'STRIPE'
    });

    return c.json({
        message: 'Order created successfully',
        ...result
    }, 201);
});

// --- Storefront Reviews Routes ---

// GET /storefront/products/:id/reviews -> Get approved reviews for a product
storefront.get('/products/:id/reviews', async (c) => {
    const id = c.req.param('id')!;
    const reviews = await reviewService.getProductReviews(id);
    return c.json(reviews);
});

// POST /storefront/products/:id/reviews -> Submit a new review (Authenticated)
storefront.post('/products/:id/reviews', customerAuthMiddleware, async (c) => {
    const id = c.req.param('id')!;
    const customerPayload = c.get('customer')!;
    const body = await c.req.json();

    if (!body.rating || body.rating < 1 || body.rating > 5) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Rating must be between 1 and 5');
    }

    const customer = await customerService.getCustomerById(customerPayload.customerId);
    const review = await reviewService.createReview(
        customerPayload.customerId,
        customer.name,
        id,
        body
    );

    return c.json(review, 201);
});

// POST /storefront/products/reviews/upload-url -> Presigned review image upload URL (Authenticated)
storefront.post('/products/reviews/upload-url', customerAuthMiddleware, async (c) => {
    const { content_type } = await c.req.json();
    if (!content_type) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Content type is required');
    }
    const result = await productService.generateUploadUrl(content_type);
    return c.json(result);
});

// POST /storefront/shipping/rates -> Get shipping rates based on destination address & cart details
storefront.post('/shipping/rates', async (c) => {
    const { destCountry, destState, destPostcode, totalWeight = 0, subtotal = 0 } = await c.req.json();
    
    if (!destCountry) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Destination country is required');
    }

    const settings = await SettingsModel.findOne({});
    if (!settings || !settings.shipping || !settings.shipping.enabled) {
        return c.json({ rates: [] });
    }

    // Resolve destination country code and state code for precise matching
    const destCountryLower = destCountry.toLowerCase();
    const destStateLower = (destState || '').toLowerCase();
    
    const countryConfig = settings.taxes.countriesConfig?.find((c: any) => 
        c.code.toLowerCase() === destCountryLower || c.name.toLowerCase() === destCountryLower
    );
    const countryCodeResolved = countryConfig ? countryConfig.code.toLowerCase() : destCountryLower;
    
    const matchedStateObj = countryConfig?.states?.find((s: any) => 
        s.name.toLowerCase() === destStateLower || s.code.toLowerCase() === destStateLower
    );
    const stateCodeResolved = matchedStateObj ? matchedStateObj.code.toLowerCase() : destStateLower;
    
    const compositeStateKeyResolved = `${countryCodeResolved}:${stateCodeResolved}`;

    // Match Zone (specific state/country matching first, then fallback)
    const matchedZone = settings.shipping.zones.find(zone => {
        if (!zone.active) return false;
        
        const countryMatch = zone.countries.length === 0 || zone.countries.some(c => 
            c.toLowerCase() === destCountry.toLowerCase()
        );
        const stateMatch = zone.states.length === 0 || zone.states.some(s => {
            const lowerS = s.toLowerCase();
            if (lowerS === 'all' || lowerS === 'all states') return true;
            
            if (lowerS.includes(':')) {
                return lowerS === compositeStateKeyResolved;
            }
            
            return lowerS === destStateLower || lowerS === stateCodeResolved;
        });
        
        return countryMatch && stateMatch;
    });

    const rates: any[] = [];

    if (matchedZone) {
        // 1. Process Custom Rates
        for (const rate of matchedZone.rates) {
            if (!rate.active) continue;

            const rateId = (rate as any)._id?.toString() || rate.name;

            if (rate.type === 'flat') {
                rates.push({
                    id: rateId,
                    name: rate.name,
                    price: rate.price,
                    type: 'custom_flat',
                    estimatedDays: 3,
                    deliveryTime: (rate as any).deliveryTime
                });
            } else if (rate.type === 'price_based') {
                const min = rate.minLimit || 0;
                const max = rate.maxLimit || Infinity;
                if (subtotal >= min && subtotal <= max) {
                    rates.push({
                        id: rateId,
                        name: rate.name,
                        price: rate.price,
                        type: 'custom_price',
                        estimatedDays: 3,
                        deliveryTime: (rate as any).deliveryTime
                    });
                }
            } else if (rate.type === 'weight_based') {
                const min = rate.minLimit || 0;
                const max = rate.maxLimit || Infinity;
                if (totalWeight >= min && totalWeight <= max) {
                    rates.push({
                        id: rateId,
                        name: rate.name,
                        price: rate.price,
                        type: 'custom_weight',
                        estimatedDays: 3,
                        deliveryTime: (rate as any).deliveryTime
                    });
                }
            }
        }
    }

    // 2. Query Carrier Rates (if enabled)
    const carriers = settings.shipping.carriers;
    if (carriers && (carriers.delhivery?.enabled || carriers.fedex?.enabled || carriers.dhl?.enabled)) {
        try {
            const carrierRates = await getCarrierRates({
                originPostcode: settings.general?.storePhone || '110001', // fallback origin postcode
                destPostcode: destPostcode || '',
                destCountry,
                destState: destState || '',
                totalWeight,
                subtotal
            }, {
                delhivery: carriers.delhivery,
                fedex: carriers.fedex,
                dhl: carriers.dhl
            });

            for (const cr of carrierRates) {
                rates.push({
                    id: `${cr.carrier}_${cr.name.replace(/\s+/g, '_').toLowerCase()}`,
                    name: cr.name,
                    price: cr.price,
                    type: 'carrier',
                    carrier: cr.carrier,
                    estimatedDays: cr.estimatedDays
                });
            }
        } catch (error) {
            console.error('Error fetching carrier shipping rates (falling back to custom rates):', error);
            // Fallback: Custom rates only, which are already calculated above.
        }
    }

    return c.json({ rates });
});

export default storefront;

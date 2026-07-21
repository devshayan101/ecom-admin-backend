import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import * as settingsService from '../services/settingsService';

const settings = new Hono();

const taxRuleSchema = z.object({
    country: z.string().min(1, 'Country name is required'),
    countryCode: z.string().min(1, 'Country code is required'),
    state: z.string().default(''),
    stateCode: z.string().default(''),
    rate: z.number().min(0, 'Tax rate must be at least 0').max(100, 'Tax rate cannot exceed 100'),
    name: z.string().min(1, 'Tax rule name is required'),
    active: z.boolean().default(true),
});

const gstVatSettingsSchema = z.object({
    enabled: z.boolean(),
    gstin: z.string().optional(),
    vatNumber: z.string().optional(),
    inclusive: z.boolean(),
});

const stateConfigSchema = z.object({
    name: z.string().min(1, 'State name is required'),
    code: z.string().min(1, 'State code is required'),
});

const countryConfigSchema = z.object({
    name: z.string().min(1, 'Country name is required'),
    code: z.string().min(1, 'Country code is required'),
    states: z.array(stateConfigSchema),
});

const updateTaxSettingsSchema = z.object({
    taxRules: z.array(taxRuleSchema).optional(),
    gstVatSettings: gstVatSettingsSchema.optional(),
    countriesConfig: z.array(countryConfigSchema).optional(),
});

const paymentGatewayConfigSchema = z.object({
    enabled: z.boolean(),
    sandbox: z.boolean(),
    keyId: z.string().default(''),
    secretKey: z.string().default(''),
    webhookSecret: z.string().default(''),
});

const codSettingsSchema = z.object({
    enabled: z.boolean(),
    minOrderAmount: z.number().default(0),
    maxOrderAmount: z.number().default(0),
    instructions: z.string().default(''),
});

const updatePaymentsSettingsSchema = z.object({
    razorpay: paymentGatewayConfigSchema.optional(),
    stripe: paymentGatewayConfigSchema.optional(),
    cod: codSettingsSchema.optional(),
});

settings.use('/*', authMiddleware);

function toPublicSettings(data: any) {
    if (!data) return data;
    // Handle mongoose document or plain object conversion
    const settings = typeof data.toObject === 'function' ? data.toObject() : JSON.parse(JSON.stringify(data));
    if (settings.payments) {
        if (settings.payments.razorpay) {
            if (settings.payments.razorpay.secretKey) {
                settings.payments.razorpay.secretKey = "••••••••••••••••";
            }
            if (settings.payments.razorpay.webhookSecret) {
                settings.payments.razorpay.webhookSecret = "••••••••••••••••";
            }
        }
        if (settings.payments.stripe) {
            if (settings.payments.stripe.secretKey) {
                settings.payments.stripe.secretKey = "••••••••••••••••";
            }
            if (settings.payments.stripe.webhookSecret) {
                settings.payments.stripe.webhookSecret = "••••••••••••••••";
            }
        }
    }
    return settings;
}

settings.get('/', requirePermission('settings:read'), async (c) => {
    const data = await settingsService.getSettings();
    return c.json(toPublicSettings(data));
});

settings.put('/general', requirePermission('settings:write'), async (c) => {
    const body = await c.req.json();
    const data = await settingsService.updateGeneralSettings(body);
    return c.json(data);
});

settings.put('/taxes', requirePermission('settings:write'), async (c) => {
    const body = await c.req.json();
    const validatedData = updateTaxSettingsSchema.parse(body);
    const data = await settingsService.updateTaxSettings(validatedData);
    return c.json(data);
});

settings.put('/shipping', requirePermission('settings:write'), async (c) => {
    const body = await c.req.json();
    const data = await settingsService.updateShippingSettings(body);
    return c.json(data);
});

settings.put('/payments', requirePermission('settings:write'), async (c) => {
    const body = await c.req.json();
    const validatedData = updatePaymentsSettingsSchema.parse(body);
    const data = await settingsService.updatePaymentSettings(validatedData);
    return c.json(toPublicSettings(data));
});

export default settings;

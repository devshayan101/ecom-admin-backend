import mongoose from 'mongoose';
import { SettingsModel, ISettings, ITaxRule, IGstVatSettings } from '../models/settings';
import { AppError, ErrorCodes } from '../utils/errors';

export const SETTINGS_ID = new mongoose.Types.ObjectId('000000000000000000000000');

export async function getSettings(): Promise<ISettings> {
    const settings = await SettingsModel.findOneAndUpdate(
        { _id: SETTINGS_ID },
        {
            $setOnInsert: {
                _id: SETTINGS_ID,
                general: {
                    storeName: 'My Store',
                    storeEmail: 'admin@store.com',
                    storePhone: '123-456-7890',
                    currency: 'USD',
                    timeZone: 'UTC',
                    language: 'en'
                },
                taxes: {
                    taxRules: [],
                    gstVatSettings: {
                        enabled: false,
                        inclusive: false
                    }
                },
                shipping: {
                    enabled: false,
                    zones: [],
                    carriers: {
                        delhivery: { enabled: false, sandbox: true, apiKey: "", apiSecret: "", accountId: "" },
                        fedex: { enabled: false, sandbox: true, apiKey: "", apiSecret: "", accountId: "" },
                        dhl: { enabled: false, sandbox: true, apiKey: "", apiSecret: "", accountId: "" }
                    }
                },
                payments: {
                    razorpay: { enabled: false, sandbox: true, keyId: "", secretKey: "", webhookSecret: "" },
                    stripe: { enabled: false, sandbox: true, keyId: "", secretKey: "", webhookSecret: "" },
                    cod: { enabled: false, minOrderAmount: 0, maxOrderAmount: 0, instructions: "" }
                }
            }
        },
        { new: true, upsert: true }
    );

    let needsSave = false;
    if (!settings.payments) {
        settings.payments = {
            razorpay: { enabled: false, sandbox: true, keyId: "", secretKey: "", webhookSecret: "" },
            stripe: { enabled: false, sandbox: true, keyId: "", secretKey: "", webhookSecret: "" },
            cod: { enabled: false, minOrderAmount: 0, maxOrderAmount: 0, instructions: "" }
        };
        needsSave = true;
    } else {
        if (!settings.payments.razorpay) {
            settings.payments.razorpay = { enabled: false, sandbox: true, keyId: "", secretKey: "", webhookSecret: "" };
            needsSave = true;
        }
        if (!settings.payments.stripe) {
            settings.payments.stripe = { enabled: false, sandbox: true, keyId: "", secretKey: "", webhookSecret: "" };
            needsSave = true;
        }
        if (!settings.payments.cod) {
            settings.payments.cod = { enabled: false, minOrderAmount: 0, maxOrderAmount: 0, instructions: "" };
            needsSave = true;
        }
    }

    if (needsSave) {
        await settings.save();
    }

    return settings;
}

export async function updateGeneralSettings(data: {
    storeName?: string;
    storeEmail?: string;
    storePhone?: string;
    logoUrl?: string;
    faviconUrl?: string;
    currency?: string;
    timeZone?: string;
    language?: string;
    reviews?: {
        auto_publish: boolean;
    };
    countriesConfig?: any[];
}): Promise<ISettings> {
    const settings = await getSettings();
    if (!settings.general) {
        settings.general = {
            storeName: '',
            storeEmail: '',
            storePhone: '',
            currency: 'USD',
            timeZone: 'UTC',
            language: 'en'
        };
    }
    const { reviews, countriesConfig, ...generalData } = data;
    Object.assign(settings.general, generalData);
    if (reviews !== undefined) {
        settings.reviews = reviews;
    }
    if (countriesConfig !== undefined) {
        settings.taxes.countriesConfig = countriesConfig;
    }
    await settings.save();
    return settings;
}

export async function updateTaxSettings(data: {
    taxRules?: ITaxRule[];
    gstVatSettings?: IGstVatSettings;
    countriesConfig?: any[];
}): Promise<ISettings> {
    const settings = await getSettings();
    if (data.taxRules !== undefined) {
        settings.taxes.taxRules = data.taxRules;
    }
    if (data.gstVatSettings !== undefined) {
        settings.taxes.gstVatSettings = data.gstVatSettings;
    }
    if (data.countriesConfig !== undefined) {
        settings.taxes.countriesConfig = data.countriesConfig;
    }
    await settings.save();
    return settings;
}

export async function updateShippingSettings(data: {
    enabled?: boolean;
    zones?: any[];
    carriers?: {
        delhivery?: any;
        fedex?: any;
        dhl?: any;
    };
}): Promise<ISettings> {
    const settings = await getSettings();
    if (!settings.shipping) {
        settings.shipping = {
            enabled: false,
            zones: [],
            carriers: {
                delhivery: { enabled: false, sandbox: true, apiKey: "", apiSecret: "", accountId: "" },
                fedex: { enabled: false, sandbox: true, apiKey: "", apiSecret: "", accountId: "" },
                dhl: { enabled: false, sandbox: true, apiKey: "", apiSecret: "", accountId: "" }
            }
        };
    }
    if (data.enabled !== undefined) {
        settings.shipping.enabled = data.enabled;
    }
    if (data.zones !== undefined) {
        settings.shipping.zones = data.zones;
    }
    if (data.carriers !== undefined) {
        if (data.carriers.delhivery !== undefined) {
            settings.shipping.carriers.delhivery = data.carriers.delhivery;
        }
        if (data.carriers.fedex !== undefined) {
            settings.shipping.carriers.fedex = data.carriers.fedex;
        }
        if (data.carriers.dhl !== undefined) {
            settings.shipping.carriers.dhl = data.carriers.dhl;
        }
    }
    await settings.save();
    return settings;
}

export async function updatePaymentSettings(data: {
    razorpay?: any;
    stripe?: any;
    cod?: any;
}): Promise<ISettings> {
    const settings = await getSettings();
    if (!settings.payments) {
        settings.payments = {
            razorpay: { enabled: false, sandbox: true, keyId: "", secretKey: "", webhookSecret: "" },
            stripe: { enabled: false, sandbox: true, keyId: "", secretKey: "", webhookSecret: "" },
            cod: { enabled: false, minOrderAmount: 0, maxOrderAmount: 0, instructions: "" }
        };
    }
    if (data.razorpay !== undefined) {
        if (data.razorpay.enabled !== undefined) settings.payments.razorpay.enabled = data.razorpay.enabled;
        if (data.razorpay.sandbox !== undefined) settings.payments.razorpay.sandbox = data.razorpay.sandbox;
        if (data.razorpay.keyId !== undefined) settings.payments.razorpay.keyId = data.razorpay.keyId;
        if (data.razorpay.secretKey !== undefined && data.razorpay.secretKey !== "••••••••••••••••") {
            settings.payments.razorpay.secretKey = data.razorpay.secretKey;
        }
        if (data.razorpay.webhookSecret !== undefined && data.razorpay.webhookSecret !== "••••••••••••••••") {
            settings.payments.razorpay.webhookSecret = data.razorpay.webhookSecret;
        }
    }
    if (data.stripe !== undefined) {
        if (data.stripe.enabled !== undefined) settings.payments.stripe.enabled = data.stripe.enabled;
        if (data.stripe.sandbox !== undefined) settings.payments.stripe.sandbox = data.stripe.sandbox;
        if (data.stripe.keyId !== undefined) settings.payments.stripe.keyId = data.stripe.keyId;
        if (data.stripe.secretKey !== undefined && data.stripe.secretKey !== "••••••••••••••••") {
            settings.payments.stripe.secretKey = data.stripe.secretKey;
        }
        if (data.stripe.webhookSecret !== undefined && data.stripe.webhookSecret !== "••••••••••••••••") {
            settings.payments.stripe.webhookSecret = data.stripe.webhookSecret;
        }
    }
    if (data.cod !== undefined) {
        if (data.cod.enabled !== undefined) settings.payments.cod.enabled = data.cod.enabled;
        if (data.cod.minOrderAmount !== undefined) settings.payments.cod.minOrderAmount = data.cod.minOrderAmount;
        if (data.cod.maxOrderAmount !== undefined) settings.payments.cod.maxOrderAmount = data.cod.maxOrderAmount;
        if (data.cod.instructions !== undefined) settings.payments.cod.instructions = data.cod.instructions;
    }
    await settings.save();
    return settings;
}

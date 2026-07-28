import mongoose from 'mongoose';
import { SettingsModel, ISettings, ITaxRule, IGstVatSettings } from '../models/settings';
import { AppError, ErrorCodes } from '../utils/errors';

export const SETTINGS_ID = new mongoose.Types.ObjectId('000000000000000000000000');

export const DEFAULT_HERO_SLIDES = [
    {
        id: 'hero-1',
        tag: '✦ New Arrivals 2026',
        title: 'Glowing Skin,',
        titleHighlight: 'Confident You',
        subtitle: 'Premium skincare — serums, moisturizers, SPF & more. Authentic products, pan-India delivery.',
        bg: 'linear-gradient(125deg, #0a1828 0%, #0f2444 50%, #1e3a6e 100%)',
        badge: '50%',
        badgeText: 'Upto Off',
        emoji: '✨',
        buttonText: 'Shop Skincare',
        category: 'skincare',
        active: true,
        sortOrder: 0
    },
    {
        id: 'hero-2',
        tag: '💄 Beauty Collection',
        title: 'Bold Looks,',
        titleHighlight: 'Real You',
        subtitle: 'Lipsticks, foundations, eyeshadows & more. Long-lasting formulas at unbeatable prices.',
        bg: 'linear-gradient(125deg, #1a0533 0%, #3d0d6e 50%, #6b21a8 100%)',
        badge: '42%',
        badgeText: 'Upto Off',
        emoji: '💄',
        buttonText: 'Shop Cosmetics',
        category: 'cosmetics',
        active: true,
        sortOrder: 1
    },
    {
        id: 'hero-3',
        tag: '👗 Fashion 2026',
        title: 'Dress to',
        titleHighlight: 'Impress',
        subtitle: "Men's & Women's fashion — kurtis, shirts, co-ord sets & more. Latest trends, best prices.",
        bg: 'linear-gradient(125deg, #0d2f0d 0%, #14532d 50%, #166534 100%)',
        badge: '39%',
        badgeText: 'Upto Off',
        emoji: '👗',
        buttonText: 'Shop Fashion',
        category: 'women',
        active: true,
        sortOrder: 2
    },
    {
        id: 'hero-4',
        tag: '📦 Wholesale Program',
        title: 'Grow Your',
        titleHighlight: 'Business',
        subtitle: 'Bulk orders at best rates. MOQ ₹2,000 se shuru. Retailers, resellers & boutique owners welcome.',
        bg: 'linear-gradient(125deg, #2d0a0a 0%, #7f1d1d 50%, #991b1b 100%)',
        badge: '30%',
        badgeText: 'Bulk Off',
        emoji: '📦',
        buttonText: 'Wholesale Inquiry',
        category: 'wholesale',
        active: true,
        sortOrder: 3
    }
];

export const DEFAULT_PROMOTION_CARDS = [
    {
        id: 'promo-1',
        tag: 'UP TO 50% OFF',
        title: 'Skincare & Beauty Deals',
        desc: 'Serums, moisturizers, SPF & more',
        btnText: 'Shop Skincare',
        category: 'skincare',
        bgClass: 'bg-gradient-to-br from-[#0c4a30] via-[#0f5c3c] to-[#062e1e]',
        btnClass: 'bg-white/10 hover:bg-white/20 border border-white/20 text-white',
        emoji: '🌿',
        active: true,
        sortOrder: 0
    },
    {
        id: 'promo-2',
        tag: 'NEW COLLECTION',
        title: "Women's Fashion",
        desc: 'Kurtis, dresses, co-ords & more',
        btnText: 'Shop Women',
        category: 'women',
        bgClass: 'bg-gradient-to-br from-[#881337] via-[#a21caf] to-[#4c0519]',
        btnClass: 'bg-white/10 hover:bg-white/20 border border-white/25 text-white',
        emoji: '👗',
        active: true,
        sortOrder: 1
    },
    {
        id: 'promo-3',
        tag: 'TRENDING NOW',
        title: "Men's Style Essentials",
        desc: 'Shirts, kurtas, trousers & more',
        btnText: 'Shop Men',
        category: 'men',
        bgClass: 'bg-gradient-to-br from-[#0369a1] via-[#0284c7] to-[#0c4a6e]',
        btnClass: 'bg-white/10 hover:bg-white/20 border border-white/25 text-white',
        emoji: '👔',
        active: true,
        sortOrder: 2
    },
    {
        id: 'promo-4',
        tag: 'BULK SAVINGS',
        title: 'Wholesale Program',
        desc: 'Upto 30% off on bulk orders',
        btnText: 'Shop Wholesale',
        category: 'wholesale',
        bgClass: 'bg-gradient-to-br from-[#78350f] via-[#b45309] to-[#451a03]',
        btnClass: 'bg-white/10 hover:bg-white/20 border border-white/25 text-white',
        emoji: '📦',
        active: true,
        sortOrder: 3
    }
];

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
                },
                content: {
                    heroSlides: DEFAULT_HERO_SLIDES,
                    promotionCards: DEFAULT_PROMOTION_CARDS
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

    if (!settings.content || !settings.content.heroSlides || settings.content.heroSlides.length === 0) {
        if (!settings.content) {
            settings.content = { heroSlides: DEFAULT_HERO_SLIDES as any, promotionCards: DEFAULT_PROMOTION_CARDS as any };
        } else {
            settings.content.heroSlides = DEFAULT_HERO_SLIDES as any;
        }
        needsSave = true;
    }
    if (!settings.content.promotionCards || settings.content.promotionCards.length === 0) {
        settings.content.promotionCards = DEFAULT_PROMOTION_CARDS as any;
        needsSave = true;
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
        const minOrderAmount =
            data.cod.minOrderAmount ?? settings.payments.cod.minOrderAmount;
        const maxOrderAmount =
            data.cod.maxOrderAmount ?? settings.payments.cod.maxOrderAmount;

        if (maxOrderAmount > 0 && minOrderAmount > maxOrderAmount) {
            throw new Error('Minimum order amount cannot exceed maximum order amount');
        }

        if (data.cod.enabled !== undefined) settings.payments.cod.enabled = data.cod.enabled;
        if (data.cod.minOrderAmount !== undefined) settings.payments.cod.minOrderAmount = data.cod.minOrderAmount;
        if (data.cod.maxOrderAmount !== undefined) settings.payments.cod.maxOrderAmount = data.cod.maxOrderAmount;
        if (data.cod.instructions !== undefined) settings.payments.cod.instructions = data.cod.instructions;
    }
    await settings.save();
    return settings;
}

export async function updateContentSettings(data: {
    heroSlides?: any[];
    promotionCards?: any[];
}): Promise<ISettings> {
    const settings = await getSettings();
    if (!settings.content) {
        settings.content = {
            heroSlides: DEFAULT_HERO_SLIDES as any,
            promotionCards: DEFAULT_PROMOTION_CARDS as any
        };
    }
    if (data.heroSlides !== undefined) {
        settings.content.heroSlides = data.heroSlides;
    }
    if (data.promotionCards !== undefined) {
        settings.content.promotionCards = data.promotionCards;
    }
    await settings.save();
    return settings;
}

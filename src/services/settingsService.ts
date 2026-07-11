import { SettingsModel, ISettings, ITaxRule, IGstVatSettings } from '../models/settings';
import { AppError, ErrorCodes } from '../utils/errors';

export async function getSettings(): Promise<ISettings> {
    const settings = await SettingsModel.findOneAndUpdate(
        {},
        {
            $setOnInsert: {
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
                }
            }
        },
        { new: true, upsert: true }
    );
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

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
    Object.assign(settings.general, data);
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

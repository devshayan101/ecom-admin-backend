import mongoose, { Schema, Document } from 'mongoose';

export interface ITaxRule {
    country: string;
    countryCode: string;
    state: string;
    stateCode: string;
    rate: number;
    name: string;
    active: boolean;
}

export interface IGstVatSettings {
    enabled: boolean;
    gstin?: string;
    vatNumber?: string;
    inclusive: boolean;
}

export interface IStateConfig {
    name: string;
    code: string;
}

export interface ICountryConfig {
    name: string;
    code: string;
    states: IStateConfig[];
}

export interface ISettings extends Document {
    general: {
        storeName: string;
        storeEmail: string;
        storePhone: string;
        logoUrl?: string;
        faviconUrl?: string;
        currency: string;
        timeZone: string;
        language: string;
    };
    taxes: {
        taxRules: ITaxRule[];
        gstVatSettings: IGstVatSettings;
        countriesConfig?: ICountryConfig[];
    };
    created_at: Date;
    updated_at: Date;
}

const taxRuleSchema = new Schema<ITaxRule>({
    country: { type: String, required: true },
    countryCode: { type: String, required: true },
    state: { type: String, default: "" },
    stateCode: { type: String, default: "" },
    rate: { type: Number, required: true, min: 0, max: 100 },
    name: { type: String, required: true },
    active: { type: Boolean, default: true },
});

const gstVatSettingsSchema = new Schema<IGstVatSettings>({
    enabled: { type: Boolean, default: false },
    gstin: { type: String },
    vatNumber: { type: String },
    inclusive: { type: Boolean, default: false },
}, { _id: false });

const stateConfigSchema = new Schema<IStateConfig>({
    name: { type: String, required: true },
    code: { type: String, required: true },
}, { _id: false });

const countryConfigSchema = new Schema<ICountryConfig>({
    name: { type: String, required: true },
    code: { type: String, required: true },
    states: [stateConfigSchema],
});

const settingsSchema = new Schema<ISettings>({
    general: {
        storeName: { type: String, default: 'My Store' },
        storeEmail: { type: String, default: 'admin@store.com' },
        storePhone: { type: String, default: '123-456-7890' },
        logoUrl: { type: String },
        faviconUrl: { type: String },
        currency: { type: String, default: 'USD' },
        timeZone: { type: String, default: 'UTC' },
        language: { type: String, default: 'en' },
    },
    taxes: {
        taxRules: [taxRuleSchema],
        gstVatSettings: { type: gstVatSettingsSchema, default: () => ({}) },
        countriesConfig: { type: [countryConfigSchema], default: [] },
    },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

export const SettingsModel = mongoose.model<ISettings>('Settings', settingsSchema);

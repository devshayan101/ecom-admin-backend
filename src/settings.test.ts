import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { getRequestListener } from '@hono/node-server';
import { app } from './index';
import { SettingsModel } from './models/settings';
import * as settingsService from './services/settingsService';
import { generateKeyPairSync } from 'crypto';
import { config } from './config/secrets';
import { seed } from './config/seed';
import { loadRolePermissions } from './middleware/rbac';
import jwt from 'jsonwebtoken';

jest.mock('./utils/redisClient', () => {
    const Redis = require('ioredis-mock');
    const redis = new Redis();
    return {
        getRedis: () => redis,
        getRedisOptions: () => ({ maxRetriesPerRequest: null })
    };
});

jest.mock('bullmq', () => {
    return {
        Queue: jest.fn().mockImplementation(() => {
            return {
                add: jest.fn().mockResolvedValue({}),
                on: jest.fn(),
            };
        })
    };
});

const handler = getRequestListener(app.fetch);

describe('Settings Flow Integration Tests', () => {
    let mongoReplSet: MongoMemoryReplSet;
    let adminToken: string;

    beforeAll(async () => {
        mongoReplSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
        await mongoose.connect(mongoReplSet.getUri());
        await SettingsModel.ensureIndexes();

        const { privateKey, publicKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        config.jwtPrivateKey = privateKey;
        config.jwtPublicKey = publicKey;

        await seed();
        await loadRolePermissions();

        adminToken = jwt.sign(
            { id: 'admin_id', email: 'admin@store.com', role: 'superadmin' },
            config.jwtPrivateKey,
            { algorithm: 'RS256', expiresIn: '1h' }
        );
    }, 30000);

    afterAll(async () => {
        await mongoose.disconnect();
        await mongoReplSet.stop();
    });

    beforeEach(async () => {
        await SettingsModel.deleteMany({});
    });

    it('should enforce singleton Settings document', async () => {
        const s1 = await settingsService.getSettings();
        const s2 = await settingsService.getSettings();
        
        expect(s1._id.toString()).toBe(s2._id.toString());
        expect(s1._id.toString()).toBe(settingsService.SETTINGS_ID.toString());

        const count = await SettingsModel.countDocuments();
        expect(count).toBe(1);
    });

    it('should accept valid tax settings updates', async () => {
        const payload = {
            taxRules: [
                {
                    country: 'United States',
                    countryCode: 'US',
                    state: 'California',
                    stateCode: 'CA',
                    rate: 8.25,
                    name: 'CA Tax',
                    active: true
                }
            ],
            gstVatSettings: {
                enabled: true,
                gstin: '12345',
                inclusive: false
            }
        };

        const res = await request(handler)
            .put('/settings/taxes')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payload);

        expect(res.status).toBe(200);
        expect(res.body.taxes.taxRules).toHaveLength(1);
        expect(res.body.taxes.taxRules[0].rate).toBe(8.25);
        expect(res.body.taxes.gstVatSettings.enabled).toBe(true);
    });

    it('should reject invalid tax settings updates (wrong types, missing required fields)', async () => {
        const payload = {
            taxRules: [
                {
                    // missing country & countryCode
                    state: 'California',
                    rate: 'invalid-rate', // wrong type
                    name: 'CA Tax'
                }
            ]
        };

        const res = await request(handler)
            .put('/settings/taxes')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payload);

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should filter storefront settings based on active shipping zones', async () => {
        // Setup countriesConfig and active/inactive shipping zones
        const settings = await settingsService.getSettings();
        settings.taxes.countriesConfig = [
            {
                name: 'United States',
                code: 'US',
                states: [
                    { name: 'California', code: 'CA' },
                    { name: 'New York', code: 'NY' }
                ]
            },
            {
                name: 'India',
                code: 'IN',
                states: [
                    { name: 'Punjab', code: 'PB' },
                    { name: 'Delhi', code: 'DL' }
                ]
            }
        ];
        settings.shipping = {
            enabled: true,
            zones: [
                {
                    name: 'US West',
                    countries: ['United States'],
                    states: ['US:CA'],
                    rates: [],
                    active: true
                },
                {
                    name: 'India Region',
                    countries: ['India'],
                    states: [], // Empty states => all states are allowed
                    rates: [],
                    active: false // Inactive zone, should filter out India
                }
            ],
            carriers: {
                delhivery: { enabled: false, sandbox: true, apiKey: "" },
                fedex: { enabled: false, sandbox: true, apiKey: "" },
                dhl: { enabled: false, sandbox: true, apiKey: "" }
            }
        };
        await settings.save();

        const res = await request(handler)
            .get('/storefront/settings');

        expect(res.status).toBe(200);
        const countries = res.body.taxes.countriesConfig;
        
        // India is inactive, United States is active
        expect(countries).toHaveLength(1);
        expect(countries[0].name).toBe('United States');
        
        // Only California is in the active zone
        expect(countries[0].states).toHaveLength(1);
        expect(countries[0].states[0].name).toBe('California');
    });

    it('should return deliveryTime for matched custom shipping rates', async () => {
        const settings = await settingsService.getSettings();
        settings.shipping = {
            enabled: true,
            zones: [
                {
                    name: 'Domestic',
                    countries: ['India'],
                    states: [],
                    rates: [
                        {
                            name: 'Express Shipping',
                            type: 'flat',
                            price: 150,
                            active: true,
                            deliveryTime: '1-2 business days'
                        }
                    ],
                    active: true
                }
            ],
            carriers: {
                delhivery: { enabled: false, sandbox: true, apiKey: "" },
                fedex: { enabled: false, sandbox: true, apiKey: "" },
                dhl: { enabled: false, sandbox: true, apiKey: "" }
            }
        };
        await settings.save();

        const res = await request(handler)
            .post('/storefront/shipping/rates')
            .send({
                destCountry: 'India',
                destState: 'Punjab',
                destPostcode: '141001',
                subtotal: 1000,
                totalWeight: 500
            });

        expect(res.status).toBe(200);
        expect(res.body.rates).toHaveLength(1);
        expect(res.body.rates[0].name).toBe('Express Shipping');
        expect(res.body.rates[0].deliveryTime).toBe('1-2 business days');
    });
});

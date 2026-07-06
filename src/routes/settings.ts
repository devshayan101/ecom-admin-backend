import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import * as settingsService from '../services/settingsService';

const settings = new Hono();

settings.use('/*', authMiddleware);

settings.get('/', requirePermission('settings:read'), async (c) => {
    const data = await settingsService.getSettings();
    return c.json(data);
});

settings.put('/general', requirePermission('settings:write'), async (c) => {
    const body = await c.req.json();
    const data = await settingsService.updateGeneralSettings(body);
    return c.json(data);
});

settings.put('/taxes', requirePermission('settings:write'), async (c) => {
    const body = await c.req.json();
    const data = await settingsService.updateTaxSettings(body);
    return c.json(data);
});

export default settings;

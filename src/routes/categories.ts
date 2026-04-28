import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import * as categoryService from '../services/categoryService';

const categories = new Hono();

categories.use('/*', authMiddleware);

categories.get('/', requirePermission('categories:read'), async (c) => {
    const cats = await categoryService.listCategories();
    return c.json({ items: cats });
});

categories.post('/', requirePermission('categories:write'), async (c) => {
    const body = await c.req.json();
    const cat = await categoryService.createCategory(body);
    return c.json(cat, 201);
});

categories.put('/:id', requirePermission('categories:write'), async (c) => {
    const id = c.req.param('id')!;
    const body = await c.req.json();
    const cat = await categoryService.updateCategory(id, body);
    return c.json(cat);
});

categories.delete('/:id', requirePermission('categories:write'), async (c) => {
    const id = c.req.param('id')!;
    await categoryService.deleteCategory(id);
    return c.json({ message: 'Category deleted' });
});

export default categories;

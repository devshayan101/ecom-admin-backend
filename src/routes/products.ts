import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import * as productService from '../services/productService';

const products = new Hono();

products.use('/*', authMiddleware);

products.get('/', requirePermission('products:read'), async (c) => {
    const query = c.req.query();
    const result = await productService.listProducts(query);
    return c.json(result);
});

products.post('/', requirePermission('products:write'), async (c) => {
    const body = await c.req.json();
    const product = await productService.createProduct(body);
    return c.json(product, 201);
});

products.get('/:id', requirePermission('products:read'), async (c) => {
    const id = c.req.param('id')!;
    const product = await productService.getProductById(id);
    return c.json(product);
});

products.put('/:id', requirePermission('products:write'), async (c) => {
    const id = c.req.param('id')!;
    const body = await c.req.json();
    const product = await productService.updateProduct(id, body);
    return c.json(product);
});

products.delete('/:id', requirePermission('products:write'), async (c) => {
    const id = c.req.param('id')!;
    const auth = (c as any).get('auth');
    const force = c.req.query('force') === 'true';
    await productService.deleteProduct(id, force, auth.role);
    return c.json({ message: force ? 'Product hard-deleted' : 'Product archived' });
});

products.post('/upload-url', requirePermission('products:write'), async (c) => {
    const { content_type } = await c.req.json();
    const result = await productService.generateUploadUrl(content_type);
    return c.json(result);
});

export default products;

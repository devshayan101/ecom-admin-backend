import mongoose from 'mongoose';
import { config } from './secrets';
import { faker } from '@faker-js/faker';
import { CategoryModel, type ICategory } from '../models/category';
import { ProductModel, type IProduct, type IVariant } from '../models/product';
import { CustomerModel } from '../models/customer';
import { OrderModel, type IOrder, type OrderStatus, type PaymentStatus } from '../models/order';
import { InventoryModel } from '../models/inventory';
import { AuditLogModel } from '../models/auditLog';
import { AdminUserModel } from '../models/adminUser';
import bcrypt from 'bcrypt';

faker.seed(12345);

const args = process.argv.slice(2);
const shouldClean = args.includes('--clean');

async function connectDB() {
    await mongoose.connect(config.mongoUri);
    console.log('MongoDB connected for mock seeding');
}

async function disconnectDB() {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
}

async function clearMockData() {
    if (!shouldClean) return;

    console.log('Cleaning existing mock data...');
    const ops = [
        CategoryModel.collection.drop(),
        ProductModel.collection.drop(),
        InventoryModel.collection.drop(),
        CustomerModel.collection.drop(),
        OrderModel.collection.drop(),
        AuditLogModel.collection.drop(),
    ];
    try {
        await Promise.allSettled(ops);
        console.log('Cleaned existing mock data');
    } catch (err: any) {
        if (!err.message?.includes('ns not found')) {
            console.warn('Warning during clean:', err.message);
        }
    }
}

async function seedCategories(): Promise<ICategory[]> {
    console.log('Seeding categories...');
    const categories: ICategory[] = [];

    const topLevel = [
        { name: 'Electronics', slug: 'electronics', attr: [
            { key: 'brand', type: 'string' as const },
            { key: 'color', type: 'enum' as const, values: ['Black','White','Silver','Gold'] },
            { key: 'warranty_months', type: 'number' as const },
        ]},
        { name: 'Clothing', slug: 'clothing', attr: [
            { key: 'size', type: 'enum' as const, values: ['S','M','L','XL','XXL'] },
            { key: 'color', type: 'enum' as const, values: ['Red','Blue','Green','Black','White'] },
            { key: 'material', type: 'string' as const },
        ]},
        { name: 'Home & Kitchen', slug: 'home-kitchen', attr: [
            { key: 'material', type: 'string' as const },
            { key: 'dishwasher_safe', type: 'boolean' as const },
        ]},
        { name: 'Books', slug: 'books', attr: [
            { key: 'author', type: 'string' as const },
            { key: 'format', type: 'enum' as const, values: ['Paperback','Hardcover','E-book'] },
            { key: 'pages', type: 'number' as const },
        ]},
        { name: 'Sports & Outdoors', slug: 'sports-outdoors', attr: [
            { key: 'brand', type: 'string' as const },
            { key: 'weight_kg', type: 'number' as const },
        ]},
    ];

    for (const cat of topLevel) {
        const doc = await CategoryModel.findOneAndUpdate(
            { slug: cat.slug },
            { name: cat.name, slug: cat.slug, parent_id: null, attribute_schema: cat.attr },
            { upsert: true, new: true }
        );
        categories.push(doc);
    }

    const subs = [
        { name: 'Smartphones', slug: 'smartphones', parent: 'electronics', attr: [
            { key: 'screen_size_inch', type: 'number' as const },
            { key: 'ram_gb', type: 'number' as const },
            { key: 'storage_gb', type: 'number' as const },
        ]},
        { name: 'Laptops', slug: 'laptops', parent: 'electronics', attr: [
            { key: 'screen_size_inch', type: 'number' as const },
            { key: 'cpu', type: 'string' as const },
            { key: 'ram_gb', type: 'number' as const },
        ]},
        { name: 'Audio', slug: 'audio', parent: 'electronics', attr: [
            { key: 'type', type: 'enum' as const, values: ['Headphones','Earbuds','Speaker'] },
            { key: 'wireless', type: 'boolean' as const },
        ]},
        { name: "Men's Clothing", slug: 'mens-clothing', parent: 'clothing', attr: [
            { key: 'gender', type: 'enum' as const, values: ['Men'] },
        ]},
        { name: "Women's Clothing", slug: 'womens-clothing', parent: 'clothing', attr: [
            { key: 'gender', type: 'enum' as const, values: ['Women'] },
        ]},
        { name: 'Kitchen Appliances', slug: 'kitchen-appliances', parent: 'home-kitchen', attr: [
            { key: 'power_watt', type: 'number' as const },
        ]},
        { name: 'Cookware', slug: 'cookware', parent: 'home-kitchen', attr: [
            { key: 'diameter_cm', type: 'number' as const },
        ]},
        { name: 'Fiction', slug: 'fiction', parent: 'books', attr: [] },
        { name: 'Non-Fiction', slug: 'non-fiction', parent: 'books', attr: [] },
        { name: 'Fitness', slug: 'fitness', parent: 'sports-outdoors', attr: [
            { key: 'fitness_type', type: 'enum' as const, values: ['Cardio','Strength','Flexibility'] },
        ]},
    ];

    for (const sub of subs) {
        const parent = categories.find(c => c.slug === sub.parent);
        if (!parent) continue;
        const doc = await CategoryModel.findOneAndUpdate(
            { slug: sub.slug },
            { name: sub.name, slug: sub.slug, parent_id: parent._id, attribute_schema: sub.attr },
            { upsert: true, new: true }
        );
        categories.push(doc);
    }

    console.log(`Seeded ${categories.length} categories`);
    return categories;
}

async function seedProducts(categories: ICategory[]): Promise<IProduct[]> {
    console.log('Seeding products...');
    const products: IProduct[] = [];

    const templates = [
        { name: 'ProPhone X', desc: 'Flagship smartphone with pro camera', cat: 'smartphones', price: [699,1299], attrs: { brand:'TechBrand',color:'Black',warranty_months:24,screen_size_inch:6.7,ram_gb:12,storage_gb:256 }},
        { name: 'SmartPhone Lite', desc: 'Budget-friendly smartphone', cat: 'smartphones', price: [199,399], attrs: { brand:'TechBrand',color:'White',warranty_months:12,screen_size_inch:6.1,ram_gb:6,storage_gb:128 }},
        { name: 'UltraBook Pro', desc: 'Thin and light productivity laptop', cat: 'laptops', price: [999,2499], attrs: { brand:'CompTech',color:'Silver',warranty_months:36,screen_size_inch:14,cpu:'Intel i7',ram_gb:16 }},
        { name: 'Gaming Laptop', desc: 'High-performance gaming laptop', cat: 'laptops', price: [1499,3299], attrs: { brand:'GameTech',color:'Black',warranty_months:24,screen_size_inch:15.6,cpu:'AMD Ryzen 9',ram_gb:32 }},
        { name: 'Wireless Earbuds', desc: 'True wireless earbuds with noise cancellation', cat: 'audio', price: [79,249], attrs: { brand:'SoundCo',type:'Earbuds',wireless:true }},
        { name: 'Over-Ear Headphones', desc: 'Studio-quality over-ear headphones', cat: 'audio', price: [149,399], attrs: { brand:'SoundCo',type:'Headphones',wireless:true }},
        { name: 'Classic T-Shirt', desc: 'Comfortable cotton t-shirt', cat: 'mens-clothing', price: [15,30], attrs: { gender:'Men',material:'Cotton',size:'M',color:'Blue' }},
        { name: 'Slim Fit Jeans', desc: 'Modern slim fit denim jeans', cat: 'mens-clothing', price: [40,80], attrs: { gender:'Men',material:'Denim',size:'L',color:'Blue' }},
        { name: 'Summer Dress', desc: 'Lightweight summer dress', cat: 'womens-clothing', price: [35,75], attrs: { gender:'Women',material:'Polyester',size:'S',color:'Red' }},
        { name: 'Yoga Pants', desc: 'Stretchable yoga pants for workouts', cat: 'womens-clothing', price: [25,55], attrs: { gender:'Women',material:'Spandex',size:'M',color:'Black' }},
        { name: 'Non-Stick Pan', desc: '10-inch non-stick frying pan', cat: 'cookware', price: [20,45], attrs: { material:'Aluminum',diameter_cm:25,dishwasher_safe:true }},
        { name: 'Blender Pro', desc: 'High-speed countertop blender', cat: 'kitchen-appliances', price: [60,120], attrs: { brand:'HomeAppliances',material:'Plastic',power_watt:1000 }},
        { name: 'The Last Adventure', desc: 'A thrilling adventure novel', cat: 'fiction', price: [10,25], attrs: { author:'Jane Doe',format:'Paperback',pages:320 }},
        { name: 'Coding for Beginners', desc: 'Learn programming from scratch', cat: 'non-fiction', price: [25,50], attrs: { author:'John Smith',format:'Paperback',pages:450 }},
        { name: 'Adjustable Dumbbells', desc: 'Pair of adjustable dumbbells 5-50lbs', cat: 'fitness', price: [80,150], attrs: { brand:'FitGear',fitness_type:'Strength',weight_kg:22.7 }},
        { name: 'Yoga Mat', desc: 'Non-slip premium yoga mat', cat: 'fitness', price: [20,45], attrs: { brand:'FitGear',fitness_type:'Flexibility',weight_kg:1.2 }},
    ];

    for (const t of templates) {
        const category = categories.find(c => c.slug === t.cat);
        if (!category) continue;

        const variantCount = faker.number.int({ min: 1, max: 3 });
        const variants: IVariant[] = [];
        for (let i = 0; i < variantCount; i++) {
            const attrs = { ...t.attrs };
            if (attrs.size) attrs.size = faker.helpers.arrayElement(['S','M','L','XL']);
            if (attrs.color) attrs.color = faker.helpers.arrayElement(['Black','White','Red','Blue','Green']);
            variants.push({
                _id: new mongoose.Types.ObjectId(),
                sku: `SKU-${faker.string.alphanumeric(8).toUpperCase()}`,
                price: faker.number.float({ min: t.price[0], max: t.price[1], fractionDigits: 2 }),
                attributes: attrs,
            } as IVariant);
        }

        const status = faker.helpers.weightedArrayElement([
            { weight: 7, value: 'active' as const },
            { weight: 2, value: 'draft' as const },
            { weight: 1, value: 'archived' as const },
        ]);

        const product = await ProductModel.create({
            name: `${t.name} ${faker.commerce.productAdjective()}`,
            description: t.desc,
            category_id: category._id,
            tags: faker.helpers.arrayElements(['new-arrival','best-seller','on-sale','limited-edition','exclusive'], { min: 0, max: 3 }),
	            images: Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => faker.image.urlPicsumPhotos()),
            status,
            variants,
            created_at: faker.date.past({ years: 1 }),
            updated_at: faker.date.recent({ days: 30 }),
        });
        products.push(product);
    }

    // Extra random products
    for (let i = 0; i < 10; i++) {
        const category = faker.helpers.arrayElement(categories);
        const variant: IVariant = {
            _id: new mongoose.Types.ObjectId(),
            sku: `SKU-${faker.string.alphanumeric(8).toUpperCase()}`,
            price: faker.number.float({ min: 10, max: 500, fractionDigits: 2 }),
            attributes: {},
        } as IVariant;

        const product = await ProductModel.create({
            name: faker.commerce.productName(),
            description: faker.commerce.productDescription(),
            category_id: category._id,
            tags: faker.helpers.arrayElements(['new-arrival','best-seller','on-sale'], { min: 0, max: 2 }),
	            images: [faker.image.urlPicsumPhotos()],
            status: 'active',
            variants: [variant],
            created_at: faker.date.past({ years: 1 }),
            updated_at: faker.date.recent({ days: 30 }),
        });
        products.push(product);
    }

    console.log(`Seeded ${products.length} products`);
    return products;
}

async function seedInventory(products: IProduct[]) {
    console.log('Seeding inventory...');
    const docs = [];
    for (const product of products) {
        for (const variant of product.variants) {
            docs.push({
                _id: variant._id,
                product_id: product._id,
                sku: variant.sku,
                stock: faker.number.int({ min: 0, max: 500 }),
                reserved: 0,
                low_stock_threshold: faker.number.int({ min: 5, max: 50 }),
                manual_adjustment_log: [],
                updated_at: new Date(),
            });
        }
    }
    await InventoryModel.collection.insertMany(docs);
    console.log(`Seeded ${docs.length} inventory entries`);
}

async function seedCustomers(): Promise<any[]> {
    console.log('Seeding customers...');
    const customers = [];
    for (let i = 0; i < 30; i++) {
        const customer = await CustomerModel.create({
            name: faker.person.fullName(),
	            email: faker.internet.email().toLowerCase(),
            phone: faker.phone.number({ style: 'international' }),
            is_active: faker.datatype.boolean({ probability: 0.9 }),
            address: {
                street: faker.location.streetAddress(),
                city: faker.location.city(),
                state: faker.location.state(),
                postcode: faker.location.zipCode(),
                country: faker.location.country(),
            },
            created_at: faker.date.past({ years: 2 }),
            updated_at: faker.date.recent({ days: 60 }),
        });
        customers.push(customer);
    }
    console.log(`Seeded ${customers.length} customers`);
    return customers;
}

async function seedOrders(customers: any[], products: IProduct[]) {
    console.log('Seeding orders...');
    const allVariants: { variant: IVariant; product: IProduct }[] = [];
    for (const product of products) {
        for (const variant of product.variants) {
            allVariants.push({ variant, product });
        }
    }

    const orders = [];
    for (let i = 0; i < 50; i++) {
        const customer = faker.helpers.arrayElement(customers);
        const itemCount = faker.number.int({ min: 1, max: 5 });
        const selected = faker.helpers.arrayElements(allVariants, itemCount);

        const items = selected.map(({ variant, product }) => ({
            variant_id: variant._id.toString(),
            sku: variant.sku,
            price_at_purchase: variant.price,
            quantity: faker.number.int({ min: 1, max: 3 }),
        }));

        const total = items.reduce((sum, item) => sum + item.price_at_purchase * item.quantity, 0);

        const status = faker.helpers.weightedArrayElement([
            { weight: 5, value: 'DELIVERED' as OrderStatus },
            { weight: 3, value: 'SHIPPED' as OrderStatus },
            { weight: 2, value: 'CONFIRMED' as OrderStatus },
            { weight: 1, value: 'PENDING' as OrderStatus },
            { weight: 1, value: 'CANCELLED' as OrderStatus },
        ]);

        const payment_status = status === 'CANCELLED'
            ? 'UNPAID'
            : faker.helpers.weightedArrayElement([
                { weight: 9, value: 'PAID' as PaymentStatus },
                { weight: 1, value: 'UNPAID' as PaymentStatus },
            ]);

        const order = await OrderModel.create({
            customer_id: customer._id,
            status,
            payment_status,
            stripe_payment_intent_id: payment_status === 'PAID' ? `pi_${faker.string.alphanumeric(24)}` : '',
            idempotency_key: faker.string.uuid(),
            payment_deadline_at: status === 'PENDING' ? faker.date.soon({ days: 1 }) : null,
            paid_at: payment_status === 'PAID' ? faker.date.recent({ days: 30 }) : null,
            cancel_reason: status === 'CANCELLED' ? faker.helpers.arrayElement(['PAYMENT_TIMEOUT','ADMIN_CANCELLED','MANUAL_REMEDIATION']) : null,
            shipping_address: {
                recipient_name: customer.name,
                street: customer.address.street,
                city: customer.address.city,
                state: customer.address.state,
                postcode: customer.address.postcode,
                country: customer.address.country,
            },
            items,
            total_amount: parseFloat(total.toFixed(2)),
            created_at: faker.date.past({ years: 1 }),
            updated_at: faker.date.recent({ days: 14 }),
        });
        orders.push(order);
    }
    console.log(`Seeded ${orders.length} orders`);
    return orders;
}

async function seedAuditLogs(adminUsers: any[], products: IProduct[], orders: any[]) {
    console.log('Seeding audit logs...');
    const actions = [
        'product:create','product:update','product:archive',
        'order:update_status','order:cancel',
        'customer:create','customer:update',
        'inventory:adjust',
        'user:create','user:update',
    ];
    let count = 0;
    for (let i = 0; i < 100; i++) {
        const actor = faker.helpers.arrayElement(adminUsers);
        const action = faker.helpers.arrayElement(actions);
        const entityType = faker.helpers.arrayElement(['Product','Order','Customer','Inventory','AdminUser']);
        let entityId: string | null = null;
        if (entityType === 'Product' && products.length > 0) {
            entityId = faker.helpers.arrayElement(products)._id.toString();
        } else if (entityType === 'Order' && orders.length > 0) {
            entityId = faker.helpers.arrayElement(orders)._id.toString();
        } else {
            entityId = new mongoose.Types.ObjectId().toString();
        }
        await AuditLogModel.create({
            actor_type: 'admin',
            actor_id: actor._id,
            action,
            result: faker.helpers.weightedArrayElement([
                { weight: 8, value: 'success' as const },
                { weight: 1, value: 'rejected' as const },
                { weight: 1, value: 'failed' as const },
            ]),
            entity_type: entityType,
            entity_id: entityId,
            changes: {
                before: faker.datatype.boolean() ? { status: 'draft' } : null,
                after: { status: 'active' },
            },
            error_code: null,
            error_message: null,
            ip: faker.internet.ipv4(),
            created_at: faker.date.past({ years: 1 }),
        });
        count++;
    }
    console.log(`Seeded ${count} audit logs`);
}

async function seedAdminUsers() {
    console.log('Seeding additional admin users...');
    const users = [];
    const extras = [
        { name: 'Alice Manager', email: 'manager1@example.com', role: 'manager' as const },
        { name: 'Bob Manager', email: 'manager2@example.com', role: 'manager' as const },
        { name: 'Charlie Viewer', email: 'viewer1@example.com', role: 'viewer' as const },
        { name: 'Diana Viewer', email: 'viewer2@example.com', role: 'viewer' as const },
        { name: 'Eve Viewer', email: 'viewer3@example.com', role: 'viewer' as const },
    ];
    for (const u of extras) {
        const exists = await AdminUserModel.findOne({ email: u.email });
        if (exists) { users.push(exists); continue; }
        const hash = await bcrypt.hash('password123', 12);
        const user = await AdminUserModel.create({
            name: u.name, email: u.email, password_hash: hash, role: u.role, is_active: true,
            created_at: faker.date.past({ years: 1 }), updated_at: new Date(),
        });
        users.push(user);
    }
    console.log(`Seeded ${users.length} additional admin users`);
    return users.concat(await AdminUserModel.find({}));
}

async function mockSeed() {
    try {
        await connectDB();
        await clearMockData();

        const categories = await seedCategories();
        const products = await seedProducts(categories);
        await seedInventory(products);
        const customers = await seedCustomers();
        const orders = await seedOrders(customers, products);
        const adminUsers = await seedAdminUsers();
        await seedAuditLogs(adminUsers, products, orders);

        console.log('\nMock data seeding completed!');
        console.log('Summary:');
        console.log(`- Categories: ${categories.length}`);
        console.log(`- Products: ${products.length}`);
        console.log(`- Inventory entries: ${products.reduce((s, p) => s + p.variants.length, 0)}`);
        console.log(`- Customers: ${customers.length}`);
        console.log(`- Orders: ${orders.length}`);
        console.log(`- Audit Logs: 100`);
        console.log(`- Admin Users: ${adminUsers.length}`);
    } catch (err) {
        console.error('Mock seeding failed:', err);
        process.exit(1);
    } finally {
        await disconnectDB();
    }
}

if (require.main === module) {
    mockSeed();
}

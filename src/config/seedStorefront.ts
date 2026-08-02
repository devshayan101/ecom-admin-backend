import mongoose from 'mongoose';
import { config } from './secrets';
import { CategoryModel } from '../models/category';
import { ProductModel } from '../models/product';
import { InventoryModel } from '../models/inventory';
import * as productService from '../services/productService';

const CATEGORY_ATTRS = [
    { key: 'mrp', type: 'number' as const },
    { key: 'variant_name', type: 'string' as const }
];

const CATEGORIES = [
    { name: 'Skincare', slug: 'skincare' },
    { name: 'Cosmetics', slug: 'cosmetics' },
    { name: 'Women\'s Fashion', slug: 'women' },
    { name: 'Men\'s Fashion', slug: 'men' },
    { name: 'Wholesale', slug: 'wholesale' },
    { name: 'Fragrance', slug: 'fragrance' },
    { name: 'Hair Care', slug: 'haircare' }
];

const PRODUCTS = [
    { id: 1, name: 'Vitamin C Brightening Face Serum', cat: 'skincare', price: 549, original: 999, badge: 'sale', emoji: '🌟', rating: 4.6, reviews: 243, desc: '20% Vitamin C, Glow formula' },
    { id: 2, name: 'SPF 50 Sunscreen Matte Gel', cat: 'skincare', price: 399, original: 699, badge: 'hot', emoji: '☀️', rating: 4.5, reviews: 187, desc: 'PA+++ broad spectrum' },
    { id: 3, name: 'Niacinamide 10% + Zinc Toner', cat: 'skincare', price: 449, original: 749, badge: 'new', emoji: '💧', rating: 4.7, reviews: 312, desc: 'Pore minimizing formula' },
    { id: 4, name: 'Hyaluronic Acid Moisturizer', cat: 'skincare', price: 649, original: 1199, badge: 'hot', emoji: '🫧', rating: 4.8, reviews: 421, desc: 'Deep 24hr hydration' },
    { id: 5, name: 'Retinol Night Repair Cream', cat: 'skincare', price: 799, original: 1499, badge: 'new', emoji: '🌙', rating: 4.6, reviews: 156, desc: 'Anti-aging, brightening' },
    { id: 6, name: 'Face Wash Foam Cleanser', cat: 'skincare', price: 299, original: 499, badge: 'sale', emoji: '🧴', rating: 4.4, reviews: 289, desc: 'Gentle daily cleanser' },
    { id: 7, name: 'Rose Gold Matte Lipstick Set', cat: 'cosmetics', price: 349, original: 599, badge: 'hot', emoji: '💄', rating: 4.7, reviews: 534, desc: '6 shades combo pack' },
    { id: 8, name: 'HD Foundation + Concealer Kit', cat: 'cosmetics', price: 899, original: 1599, badge: 'new', emoji: '🎨', rating: 4.5, reviews: 198, desc: 'Matte finish, 8 shades' },
    { id: 9, name: '18-Color Eye Shadow Palette', cat: 'cosmetics', price: 549, original: 899, badge: 'trending', emoji: '👁️', rating: 4.6, reviews: 367, desc: 'Highly pigmented' },
    { id: 10, name: 'Waterproof Kajal + Eyeliner', cat: 'cosmetics', price: 199, original: 349, badge: 'hot', emoji: '✏️', rating: 4.8, reviews: 612, desc: '24hr stay formula' },
    { id: 11, name: 'Setting Spray & Primer Kit', cat: 'cosmetics', price: 699, original: 1199, badge: 'new', emoji: '✨', rating: 4.4, reviews: 145, desc: 'All-day makeup lock' },
    { id: 12, name: 'Women\'s Floral Print Kurti', cat: 'women', price: 749, original: 1299, badge: 'new', emoji: '👘', rating: 4.6, reviews: 234, desc: 'Premium cotton, S–XXL' },
    { id: 13, name: 'Co-ord Set — Palazzo + Top', cat: 'women', price: 1099, original: 1899, badge: 'trending', emoji: '👗', rating: 4.7, reviews: 189, desc: 'Palazzo + Top, cotton' },
    { id: 14, name: 'Embroidered Party Wear Kurti', cat: 'women', price: 1299, original: 2199, badge: 'new', emoji: '🎀', rating: 4.8, reviews: 97, desc: 'Festive collection 2025' },
    { id: 15, name: 'Women\'s Casual T-Shirt Pack (3)', cat: 'women', price: 599, original: 999, badge: 'sale', emoji: '👚', rating: 4.5, reviews: 276, desc: 'Cotton, 5 color options' },
    { id: 16, name: 'Women\'s Leggings + Dupatta Set', cat: 'women', price: 799, original: 1399, badge: 'hot', emoji: '🌺', rating: 4.4, reviews: 311, desc: 'Breathable fabric' },
    { id: 17, name: 'Men\'s Slim Fit Formal Shirt', cat: 'men', price: 649, original: 1099, badge: 'new', emoji: '👔', rating: 4.6, reviews: 342, desc: 'All sizes S–XXL' },
    { id: 18, name: 'Men\'s Ethnic Kurta Pajama', cat: 'men', price: 999, original: 1699, badge: 'hot', emoji: '🧥', rating: 4.7, reviews: 178, desc: 'Festive & casual wear' },
    { id: 19, name: 'Men\'s Joggers + T-Shirt Set', cat: 'men', price: 799, original: 1299, badge: 'trending', emoji: '🩳', rating: 4.5, reviews: 223, desc: 'Premium cotton blend' },
    { id: 20, name: 'Men\'s Casual Chinos', cat: 'men', price: 899, original: 1499, badge: 'sale', emoji: '👖', rating: 4.6, reviews: 198, desc: 'Stretch fit, 4 colors' },
    { id: 21, name: 'Wholesale Skincare Bundle (24 pcs)', cat: 'wholesale', price: 2999, original: 5999, badge: 'wholesale', emoji: '📦', rating: 4.9, reviews: 87, desc: 'MOQ: 1 bundle = 24 pcs' },
    { id: 22, name: 'Wholesale Cosmetics Combo Pack', cat: 'wholesale', price: 3999, original: 7999, badge: 'wholesale', emoji: '🗃️', rating: 4.8, reviews: 64, desc: 'Lips, eyes & base set' },
    { id: 23, name: 'Wholesale Women\'s Kurti (12 pcs)', cat: 'wholesale', price: 4499, original: 8999, badge: 'wholesale', emoji: '🏷️', rating: 4.7, reviews: 43, desc: 'Assorted sizes & colors' },
    { id: 24, name: 'Wholesale Men\'s Shirt (10 pcs)', cat: 'wholesale', price: 3499, original: 6999, badge: 'wholesale', emoji: '📫', rating: 4.8, reviews: 55, desc: 'Mixed sizes, formal range' }
];

async function seed() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongoUri);
    console.log('Connected.');

    // Clear existing products and categories to prevent unique/duplicate key conflicts
    console.log('Clearing existing product, category, and inventory tables...');
    await ProductModel.deleteMany({});
    await CategoryModel.deleteMany({});
    await InventoryModel.deleteMany({});
    console.log('Cleared.');

    // Seed Categories
    console.log('Seeding categories...');
    const categoryMap: Record<string, string> = {};
    for (const cat of CATEGORIES) {
        const doc = await CategoryModel.create({
            name: cat.name,
            slug: cat.slug,
            parent_id: null,
            attribute_schema: CATEGORY_ATTRS
        });
        categoryMap[cat.slug] = doc._id.toString();
        console.log(`Created Category: ${doc.name} (${doc.slug})`);
    }

    // Seed Products
    console.log('Seeding products...');
    for (const p of PRODUCTS) {
        const categoryId = categoryMap[p.cat];
        if (!categoryId) {
            console.warn(`Category mapping not found for slug: ${p.cat}`);
            continue;
        }

        // Define category-specific specs and details
        let top_highlights: any[] = [];
        let about_this_item: string[] = [];
        let additional_information: any[] = [];
        let style_details: any[] = [];
        let features_specs: any[] = [];
        let faqs: any[] = [];

        if (p.cat === 'women' || p.cat === 'men') {
            top_highlights = [
                { key: 'Material composition', value: 'Cotton Blend' },
                { key: 'Fit type', value: p.cat === 'men' ? 'Slim Fit' : 'Regular Fit' },
                { key: 'Style', value: 'Western / Ethnic' },
                { key: 'Country of Origin', value: 'India' }
            ];
            about_this_item = [
                '【Premium Material】 Crafted from a breathable and soft cotton blend, ensuring all-day comfort.',
                '【Stylish Design】 Perfect for both casual wear and festive occasions with elegant stitch details.',
                '【Garment Care】 Machine washable. Hang dry or tumble dry low.'
            ];
            additional_information = [
                { key: 'Manufacturer', value: 'Nakalank Fashion' },
                { key: 'Net Quantity', value: '1 Count' },
                { key: 'Item Weight', value: '240 g' },
                { key: 'Generic Name', value: 'Apparel' }
            ];
            style_details = [
                { key: 'Colour', value: 'Assorted Colors' },
                { key: 'Apparel Occasion', value: 'Casual, Festive' }
            ];
            features_specs = [
                { key: 'Stitch Pattern', value: 'High-density double stitch' },
                { key: 'Color Fastness', value: 'Guaranteed up to 50 washes' }
            ];
            faqs = [
                { question: 'Is this garment true to size?', answer: 'Yes, our apparel fits true to standard size charts. If you prefer a loose fit, we recommend sizing up.' },
                { question: 'What is the recommended washing instruction?', answer: 'Machine wash cold with like colors. Avoid bleaching and dry in shade.' }
            ];
        } else if (p.cat === 'skincare' || p.cat === 'cosmetics') {
            top_highlights = [
                { key: 'Skin Type', value: 'All Skin Types' },
                { key: 'Primary Solution', value: 'Brightening / Protection' },
                { key: 'Form', value: 'Serum / Gel / Cream' },
                { key: 'Country of Origin', value: 'India' }
            ];
            about_this_item = [
                '【Active Formula】 Enriched with active ingredients for immediate absorption and glow.',
                '【Safe and Clean】 Paraben-free, sulfate-free, and dermatologically tested.',
                '【How to Use】 Apply 3-5 drops on clean skin every morning or night.'
            ];
            additional_information = [
                { key: 'Manufacturer', value: 'OlinBuy Cosmetics Ltd.' },
                { key: 'Net Quantity', value: '50 ml / 100g' },
                { key: 'Generic Name', value: 'Beauty Care' }
            ];
            style_details = [
                { key: 'Texture', value: 'Light Gel / Smooth Finish' },
                { key: 'Scent', value: 'Unscented / Lavender' }
            ];
            features_specs = [
                { key: 'pH Level', value: '5.5 (Skin Balanced)' },
                { key: 'Cruelty Free', value: 'Yes (Certified)' }
            ];
            faqs = [
                { question: 'Is this suitable for sensitive skin?', answer: 'Yes, our formula is dermatologically tested, non-comedogenic, and safe for sensitive skin types.' },
                { question: 'When should I apply this in my daily routine?', answer: 'Apply after cleansing and toning, right before applying moisturizer.' }
            ];
        } else if (p.cat === 'wholesale') {
            top_highlights = [
                { key: 'Minimum Order Qty', value: '1 bundle (10-24 pcs)' },
                { key: 'Case Pack Count', value: '12 pcs / 24 pcs' },
                { key: 'Unit Pricing', value: 'Bulk Rate Applied' },
                { key: 'Country of Origin', value: 'India' }
            ];
            about_this_item = [
                '【Bulk Pricing】 Exclusive wholesale rates for verified merchants.',
                '【Assorted Pack】 Includes a variety of colors and standard sizes.',
                '【Fast Fulfillment】 Shipped in heavy-duty cardboard case packaging.'
            ];
            additional_information = [
                { key: 'Packer', value: 'OlinBuy Wholesale Hub' },
                { key: 'Package Weight', value: '4.5 kg' },
                { key: 'Package Dimensions', value: '35 x 24 x 10 cm' }
            ];
            style_details = [
                { key: 'Bundle Type', value: 'Mixed Pack' },
                { key: 'MOQ', value: '1 Box' }
            ];
            features_specs = [
                { key: 'Export Quality', value: 'Yes' },
                { key: 'HSN Code', value: '6206.90' }
            ];
            faqs = [
                { question: 'What is the Minimum Order Quantity (MOQ)?', answer: 'The MOQ for this item is 1 master box (contains 12 to 24 units).' },
                { question: 'Do you offer GST invoices for business tax credit?', answer: 'Yes, all wholesale orders come with B2B GST tax invoices.' }
            ];
        }

        const sku = `OLIN-${String(p.id).padStart(3, '0')}`;

        // Create product via productService to ensure inventory creation
        await productService.createProduct({
            name: p.name,
            description: p.desc,
            category_id: new mongoose.Types.ObjectId(categoryId),
            tags: [p.badge, 'olinbuy'],
            images: [], // Emoji will be parsed in UI, or we can add it as a custom attribute or tag
            status: 'active',
            variants: [
                {
                    sku,
                    price: p.price,
                    image: '',
                    attributes: {
                        mrp: p.original,
                        variant_name: 'Standard'
                    },
                    stock: 100, // Seed 100 in stock
                    low_stock_threshold: 10
                }
            ],
            top_highlights,
            about_this_item,
            additional_information,
            style_details,
            features_specs,
            faqs,
            display_configs: {
                top_highlights: true,
                about_this_item: true,
                additional_information: true,
                style_details: true,
                features_specs: true,
                faqs: true
            }
        });
        console.log(`Created Product: ${p.name}`);
    }

    console.log('Storefront seeding completed successfully!');
}

seed()
    .catch((err) => {
        console.error('Seeding failed:', err);
        process.exit(1);
    })
    .finally(async () => {
        await mongoose.disconnect();
        console.log('Database disconnected.');
    });

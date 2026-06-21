import mongoose from 'mongoose';
import { ProductModel, IProduct } from '../models/product';
import { CategoryModel } from '../models/category';
import { OrderModel } from '../models/order';
import { InventoryModel } from '../models/inventory';
import { AppError, ErrorCodes } from '../utils/errors';
import { getPresignedUploadUrl, deleteS3Object } from '../utils/s3Client';
import { config } from '../config/secrets';
import { v4 as uuidv4 } from 'uuid';
import { parsePaginationParams, buildCursorQuery, buildPaginationResult } from '../utils/pagination';

export async function listProducts(query: Record<string, string | undefined>) {
    const { limit, cursor, sortField, sortOrder } = parsePaginationParams(query, ['created_at', 'name']);
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.category_id) filter.category_id = query.category_id;
    if (query.tag) filter.tags = query.tag;

    const cursorQuery = buildCursorQuery(cursor, sortField, sortOrder);
    const combinedFilter = { ...filter, ...cursorQuery };

    const items = await ProductModel.find(combinedFilter)
        .sort({ [sortField]: sortOrder, _id: sortOrder })
        .limit(limit + 1)
        .lean();

    return buildPaginationResult(items, limit, sortField);
}

export async function getProductById(id: string) {
    const product = await ProductModel.findById(id).lean();
    if (!product) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Product not found');
    return product;
}

export async function createProduct(data: any) {
    await validateAttributes(data.category_id, data.variants || []);

    const product = await ProductModel.create(data);

    // Create inventory records for each variant
    for (const variant of product.variants) {
        await InventoryModel.updateOne(
            { _id: variant._id },
            {
                $setOnInsert: {
                    _id: variant._id,
                    product_id: product._id,
                    sku: variant.sku,
                    stock: 0,
                    reserved: 0,
                    low_stock_threshold: 10,
                    manual_adjustment_log: [],
                },
            },
            { upsert: true }
        );
    }

    return product;
}

export async function updateProduct(id: string, data: any) {
    const existing = await ProductModel.findById(id);
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Product not found');
    if (existing.status === 'archived') throw new AppError(ErrorCodes.CONFLICT.code, ErrorCodes.CONFLICT.statusCode, 'Cannot update an archived product');

    const categoryId = data.category_id || existing.category_id.toString();
    if (data.variants) {
        await validateAttributes(categoryId, data.variants);
    }

    Object.assign(existing, data);
    await existing.save();
    return existing;
}

export async function deleteProduct(id: string, force: boolean, userRole: string) {
    const product = await ProductModel.findById(id);
    if (!product) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Product not found');

    if (force) {
        if (userRole !== 'superadmin') {
            throw new AppError(ErrorCodes.RBAC_DENIED.code, ErrorCodes.RBAC_DENIED.statusCode, 'Only superadmin can force-delete products');
        }
        // Check for order references
        const variantIds = product.variants.map(v => v._id.toString());
        const orderCount = await OrderModel.countDocuments({ 'items.variant_id': { $in: variantIds } });
        if (orderCount > 0) {
            throw new AppError(ErrorCodes.CONFLICT.code, ErrorCodes.CONFLICT.statusCode, 'Cannot hard-delete product with existing order references');
        }
        // Delete S3 images
        for (const imageUrl of product.images) {
            try {
                const url = new URL(imageUrl);
                await deleteS3Object(url.pathname.slice(1)); // remove leading /
            } catch { /* ignore S3 errors */ }
        }
        // Delete inventory records
        for (const variant of product.variants) {
            await InventoryModel.deleteOne({ _id: variant._id });
        }
        await ProductModel.findByIdAndDelete(id);
    } else {
        // Soft-delete
        product.status = 'archived';
        await product.save();
    }
}

export async function generateUploadUrl(contentType: string) {
    const key = `${uuidv4()}.${contentType.split('/')[1]}`;
    const url = await getPresignedUploadUrl(key, contentType);
    const objectUrl = `${config.r2PublicUrl}/${config.s3PublicPrefix}/${key}`;
    return { uploadUrl: url, objectUrl };
}

async function validateAttributes(categoryId: string, variants: any[]) {
    const category = await CategoryModel.findById(categoryId).lean();
    if (!category) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Category not found');

    const schemaMap = new Map(category.attribute_schema.map(s => [s.key, s]));

    for (const variant of variants) {
        if (!variant.attributes) continue;

        for (const [key, value] of Object.entries(variant.attributes)) {
            const schemaDef = schemaMap.get(key);
            if (!schemaDef) {
                throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, `Attribute '${key}' is not allowed for this category`, `attributes.${key}`);
            }

            if (schemaDef.type === 'number' && typeof value !== 'number') {
                throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, `Attribute '${key}' must be a number`, `attributes.${key}`);
            }
            if (schemaDef.type === 'string' && typeof value !== 'string') {
                throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, `Attribute '${key}' must be a string`, `attributes.${key}`);
            }
            if (schemaDef.type === 'boolean' && typeof value !== 'boolean') {
                throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, `Attribute '${key}' must be a boolean`, `attributes.${key}`);
            }

            if (schemaDef.type === 'enum' && schemaDef.values && !schemaDef.values.includes(value as string)) {
                throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, `Invalid value for enum attribute '${key}': ${value}`, `attributes.${key}`);
            }
        }
    }
}

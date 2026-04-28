import mongoose from 'mongoose';
import { CategoryModel, ICategory, IAttributeSchema } from '../models/category';
import { ProductModel } from '../models/product';
import { AppError, ErrorCodes } from '../utils/errors';

export async function listCategories() {
    return CategoryModel.find({}).lean();
}

export async function getCategoryById(id: string) {
    const cat = await CategoryModel.findById(id).lean();
    if (!cat) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Category not found');
    return cat;
}

export async function createCategory(data: { name: string; slug: string; parent_id?: string; attribute_schema?: IAttributeSchema[] }) {
    return CategoryModel.create({
        name: data.name,
        slug: data.slug,
        parent_id: data.parent_id ? new mongoose.Types.ObjectId(data.parent_id) : null,
        attribute_schema: data.attribute_schema || [],
    });
}

export async function updateCategory(id: string, data: { name?: string; slug?: string; parent_id?: string | null; attribute_schema?: IAttributeSchema[] }) {
    const existing = await CategoryModel.findById(id);
    if (!existing) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Category not found');

    // Check for re-parenting cycle
    if (data.parent_id !== undefined) {
        if (data.parent_id === id) {
            throw new AppError(ErrorCodes.CONFLICT.code, ErrorCodes.CONFLICT.statusCode, 'Category cannot be its own parent');
        }
        if (data.parent_id) {
            await detectCycle(id, data.parent_id);
        }
    }

    // Check for breaking schema changes while products still use affected attributes
    if (data.attribute_schema) {
        await checkBreakingSchemaChange(existing.attribute_schema, data.attribute_schema, id);
    }

    Object.assign(existing, data);
    if (data.parent_id !== undefined) {
        existing.parent_id = data.parent_id ? new mongoose.Types.ObjectId(data.parent_id) : null;
    }
    await existing.save();
    return existing;
}

export async function deleteCategory(id: string) {
    // Check for child categories
    const childCount = await CategoryModel.countDocuments({ parent_id: id });
    if (childCount > 0) {
        throw new AppError(ErrorCodes.CONFLICT.code, ErrorCodes.CONFLICT.statusCode, 'Cannot delete category with child categories');
    }

    // Check for products referencing this category
    const productCount = await ProductModel.countDocuments({ category_id: id });
    if (productCount > 0) {
        throw new AppError(ErrorCodes.CONFLICT.code, ErrorCodes.CONFLICT.statusCode, 'Cannot delete category with linked products');
    }

    const result = await CategoryModel.findByIdAndDelete(id);
    if (!result) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Category not found');
}

async function detectCycle(categoryId: string, newParentId: string): Promise<void> {
    let current: string | null = newParentId;
    const visited = new Set<string>([categoryId]);

    while (current) {
        if (visited.has(current)) {
            throw new AppError(ErrorCodes.CONFLICT.code, ErrorCodes.CONFLICT.statusCode, 'Re-parenting would create a cycle');
        }
        visited.add(current);
        const parentDoc: { parent_id?: any } | null = await CategoryModel.findById(current, { parent_id: 1 }).lean();
        current = parentDoc?.parent_id?.toString() || null;
    }
}

async function checkBreakingSchemaChange(oldSchema: IAttributeSchema[], newSchema: IAttributeSchema[], categoryId: string) {
    const oldMap = new Map(oldSchema.map(s => [s.key, s]));
    const newMap = new Map(newSchema.map(s => [s.key, s]));

    const breakingKeys: string[] = [];

    for (const [key, oldAttr] of oldMap) {
        const newAttr = newMap.get(key);
        if (!newAttr) {
            // Key removed
            breakingKeys.push(key);
        } else if (oldAttr.type !== newAttr.type) {
            // Type changed
            breakingKeys.push(key);
        } else if (oldAttr.type === 'enum' && newAttr.type === 'enum') {
            // Check for narrowed enum values
            const oldValues = new Set(oldAttr.values || []);
            const newValues = new Set(newAttr.values || []);
            for (const v of oldValues) {
                if (!newValues.has(v)) {
                    breakingKeys.push(key);
                    break;
                }
            }
        }
    }

    if (breakingKeys.length === 0) return;

    // Check if any products still use the affected attributes
    const productCount = await ProductModel.countDocuments({
        category_id: categoryId,
        status: { $ne: 'archived' },
    });

    if (productCount > 0) {
        throw new AppError(
            ErrorCodes.BREAKING_CATEGORY_SCHEMA_CHANGE.code,
            ErrorCodes.BREAKING_CATEGORY_SCHEMA_CHANGE.statusCode,
            `Cannot modify schema keys [${breakingKeys.join(', ')}] while products still reference this category`
        );
    }
}

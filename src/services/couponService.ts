import { CouponModel, ICoupon } from '../models/coupon';
import { AppError, ErrorCodes } from '../utils/errors';
import { parsePaginationParams, buildCursorQuery, buildPaginationResult } from '../utils/pagination';

export async function listCoupons(query: Record<string, string | undefined>) {
    const { limit, cursor, sortField, sortOrder } = parsePaginationParams(query, ['created_at', 'code']);
    const filter: any = {};
    if (query.is_active !== undefined) {
        filter.is_active = query.is_active === 'true';
    }
    if (query.search) {
        filter.code = { $regex: query.search.trim(), $options: 'i' };
    }

    const cursorQuery = buildCursorQuery(cursor, sortField, sortOrder);
    const combinedFilter = { ...filter, ...cursorQuery };

    const items = await CouponModel.find(combinedFilter)
        .sort({ [sortField]: sortOrder, _id: sortOrder })
        .limit(limit + 1)
        .lean();

    return buildPaginationResult(items, limit, sortField);
}

export async function getCouponById(id: string) {
    const coupon = await CouponModel.findById(id).lean();
    if (!coupon) {
        throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Coupon not found');
    }
    return coupon;
}

export async function createCoupon(data: Partial<ICoupon>) {
    if (!data.code || !data.discount_type || data.discount_value === undefined) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Code, discount type, and discount value are required');
    }

    const cleanCode = data.code.trim().toUpperCase();
    const existing = await CouponModel.findOne({ code: cleanCode });
    if (existing) {
        throw new AppError(ErrorCodes.CONFLICT.code, ErrorCodes.CONFLICT.statusCode, 'Coupon code already exists');
    }

    const coupon = await CouponModel.create({
        ...data,
        code: cleanCode,
    });
    return coupon;
}

export async function updateCoupon(id: string, data: Partial<ICoupon>) {
    const coupon = await CouponModel.findById(id);
    if (!coupon) {
        throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Coupon not found');
    }

    if (data.code && data.code.trim().toUpperCase() !== coupon.code) {
        const cleanCode = data.code.trim().toUpperCase();
        const existing = await CouponModel.findOne({ code: cleanCode });
        if (existing) {
            throw new AppError(ErrorCodes.CONFLICT.code, ErrorCodes.CONFLICT.statusCode, 'Coupon code already exists');
        }
        coupon.code = cleanCode;
    }

    if (data.discount_type !== undefined) coupon.discount_type = data.discount_type;
    if (data.discount_value !== undefined) coupon.discount_value = data.discount_value;
    if (data.min_order_amount !== undefined) coupon.min_order_amount = data.min_order_amount;
    if (data.max_discount_amount !== undefined) coupon.max_discount_amount = data.max_discount_amount;
    if (data.start_date !== undefined) coupon.start_date = data.start_date ? new Date(data.start_date) : null;
    if (data.end_date !== undefined) coupon.end_date = data.end_date ? new Date(data.end_date) : null;
    if (data.usage_limit !== undefined) coupon.usage_limit = data.usage_limit;
    if (data.is_active !== undefined) coupon.is_active = data.is_active;

    await coupon.save();
    return coupon;
}

export async function deleteCoupon(id: string) {
    const coupon = await CouponModel.findByIdAndDelete(id);
    if (!coupon) {
        throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Coupon not found');
    }
    return { success: true };
}

export async function validateCoupon(code: string, subtotal: number) {
    if (!code || !code.trim()) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, ErrorCodes.VALIDATION_ERROR.statusCode, 'Coupon code is required');
    }

    const cleanCode = code.trim().toUpperCase();
    const coupon = await CouponModel.findOne({ code: cleanCode });

    if (!coupon || !coupon.is_active) {
        throw new AppError(ErrorCodes.NOT_FOUND.code, 400, 'Invalid or expired coupon code');
    }

    const now = new Date();
    if (coupon.start_date && now < new Date(coupon.start_date)) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, 400, 'This coupon promotion has not started yet');
    }

    if (coupon.end_date && now > new Date(coupon.end_date)) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, 400, 'This coupon code has expired');
    }

    if (coupon.usage_limit !== null && coupon.usage_limit !== undefined && coupon.used_count >= coupon.usage_limit) {
        throw new AppError(ErrorCodes.VALIDATION_ERROR.code, 400, 'Coupon usage limit reached');
    }

    if (subtotal < coupon.min_order_amount) {
        throw new AppError(
            ErrorCodes.VALIDATION_ERROR.code,
            400,
            `Minimum order amount for code ${coupon.code} is $${coupon.min_order_amount.toFixed(2)}`
        );
    }

    let discountAmount = 0;
    if (coupon.discount_type === 'PERCENTAGE') {
        discountAmount = (subtotal * coupon.discount_value) / 100;
        if (coupon.max_discount_amount && coupon.max_discount_amount > 0) {
            discountAmount = Math.min(discountAmount, coupon.max_discount_amount);
        }
    } else {
        discountAmount = Math.min(coupon.discount_value, subtotal);
    }

    return {
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
        discount_amount: Math.round(discountAmount * 100) / 100,
        min_order_amount: coupon.min_order_amount,
    };
}

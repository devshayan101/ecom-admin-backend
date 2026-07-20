import mongoose from 'mongoose';
import { ReviewModel, IReview } from '../models/review';
import { ProductModel } from '../models/product';
import { SettingsModel } from '../models/settings';
import { SETTINGS_ID } from './settingsService';
import { AppError, ErrorCodes } from '../utils/errors';
import { parsePaginationParams, buildCursorQuery, buildPaginationResult } from '../utils/pagination';

export async function listReviews(query: Record<string, string | undefined>) {
    const { limit, cursor, sortField, sortOrder } = parsePaginationParams(query, ['created_at', 'rating']);
    const filter: any = {};
    if (query.status) filter.status = query.status;
    if (query.product_id) filter.product_id = query.product_id;
    if (query.rating) filter.rating = parseInt(query.rating, 10);

    const cursorQuery = buildCursorQuery(cursor, sortField, sortOrder);
    const combinedFilter = { ...filter, ...cursorQuery };

    const items = await ReviewModel.find(combinedFilter)
        .populate('product_id', 'name')
        .sort({ [sortField]: sortOrder, _id: sortOrder })
        .limit(limit + 1)
        .lean();

    return buildPaginationResult(items, limit, sortField);
}

export async function getProductReviews(productId: string) {
    return ReviewModel.find({ product_id: productId, status: 'approved' })
        .sort({ created_at: -1 })
        .lean();
}

export async function createReview(
    customerId: string,
    customerName: string,
    productId: string,
    data: { rating: number; title?: string; comment?: string; images?: string[] }
) {
    const product = await ProductModel.findById(productId);
    if (!product) {
        throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Product not found');
    }

    // Get settings to check moderation policy
    const settings = await SettingsModel.findOne({ _id: SETTINGS_ID }).lean();
    const autoPublish = settings?.reviews?.auto_publish ?? false;
    const status = autoPublish ? 'approved' : 'pending';

    const review = await ReviewModel.create({
        product_id: new mongoose.Types.ObjectId(productId),
        customer_id: new mongoose.Types.ObjectId(customerId),
        customer_name: customerName,
        rating: data.rating,
        title: data.title || '',
        comment: data.comment || '',
        images: data.images || [],
        status
    });

    if (status === 'approved') {
        await recalculateProductRating(productId);
    }

    return review;
}

export async function updateReviewStatus(reviewId: string, status: 'approved' | 'rejected' | 'pending') {
    const review = await ReviewModel.findById(reviewId);
    if (!review) {
        throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Review not found');
    }

    const oldStatus = review.status;
    review.status = status;
    await review.save();

    if (status === 'approved' || oldStatus === 'approved') {
        await recalculateProductRating(review.product_id.toString());
    }

    return review;
}

export async function replyToReview(reviewId: string, text: string, adminUserId: string) {
    const review = await ReviewModel.findById(reviewId);
    if (!review) {
        throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Review not found');
    }

    review.admin_reply = {
        text,
        replied_at: new Date(),
        replied_by: new mongoose.Types.ObjectId(adminUserId)
    };

    await review.save();
    return review;
}

export async function deleteReview(reviewId: string) {
    const review = await ReviewModel.findById(reviewId);
    if (!review) {
        throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Review not found');
    }

    const productId = review.product_id.toString();
    const wasApproved = review.status === 'approved';

    await ReviewModel.findByIdAndDelete(reviewId);

    if (wasApproved) {
        await recalculateProductRating(productId);
    }
}

export async function recalculateProductRating(productId: string) {
    const stats = await ReviewModel.aggregate([
        { $match: { product_id: new mongoose.Types.ObjectId(productId), status: 'approved' } },
        {
            $group: {
                _id: '$product_id',
                rating_average: { $avg: '$rating' },
                rating_count: { $sum: 1 }
            }
        }
    ]);

    const rating_average = stats.length > 0 ? Math.round(stats[0].rating_average * 10) / 10 : 0;
    const rating_count = stats.length > 0 ? stats[0].rating_count : 0;

    await ProductModel.findByIdAndUpdate(productId, {
        rating_average,
        rating_count
    });
}

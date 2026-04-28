import { CustomerModel } from '../models/customer';
import { OrderModel } from '../models/order';
import { AppError, ErrorCodes } from '../utils/errors';
import { parsePaginationParams, buildCursorQuery, buildPaginationResult } from '../utils/pagination';

export async function listCustomers(query: Record<string, string | undefined>) {
    const { limit, cursor, sortField, sortOrder } = parsePaginationParams(query, ['created_at', 'name']);
    const filter: any = {};
    const cursorQuery = buildCursorQuery(cursor, sortField, sortOrder);
    const combinedFilter = { ...filter, ...cursorQuery };

    const items = await CustomerModel.find(combinedFilter)
        .sort({ [sortField]: sortOrder, _id: sortOrder })
        .limit(limit + 1)
        .lean();

    return buildPaginationResult(items, limit, sortField);
}

export async function getCustomerById(id: string) {
    const customer = await CustomerModel.findById(id).lean();
    if (!customer) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Customer not found');
    return customer;
}

export async function createCustomer(data: any) {
    // Check if email belongs to a soft-deleted record
    const existing = await CustomerModel.findOne({ email: data.email });
    if (existing && !existing.is_active) {
        throw new AppError(
            ErrorCodes.SOFT_DELETED_CUSTOMER_EXISTS.code,
            ErrorCodes.SOFT_DELETED_CUSTOMER_EXISTS.statusCode,
            'A soft-deleted customer with this email exists. Use restore instead.'
        );
    }

    return CustomerModel.create(data);
}

export async function updateCustomer(id: string, data: any) {
    const customer = await CustomerModel.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    if (!customer) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Customer not found');
    return customer;
}

export async function deleteCustomer(id: string) {
    const customer = await CustomerModel.findById(id);
    if (!customer) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Customer not found');

    const orderCount = await OrderModel.countDocuments({ customer_id: id });
    if (orderCount > 0) {
        // Soft-delete
        customer.is_active = false;
        await customer.save();
    } else {
        // Hard-delete
        await CustomerModel.findByIdAndDelete(id);
    }
}

export async function restoreCustomer(id: string) {
    const customer = await CustomerModel.findById(id);
    if (!customer) throw new AppError(ErrorCodes.NOT_FOUND.code, ErrorCodes.NOT_FOUND.statusCode, 'Customer not found');
    if (customer.is_active) throw new AppError(ErrorCodes.CONFLICT.code, ErrorCodes.CONFLICT.statusCode, 'Customer is already active');

    customer.is_active = true;
    await customer.save();
    return customer;
}

export async function getCustomerOrders(customerId: string, query: Record<string, string | undefined>) {
    const { limit, cursor, sortField, sortOrder } = parsePaginationParams(query, ['created_at']);
    const cursorQuery = buildCursorQuery(cursor, sortField, sortOrder);
    const filter = { customer_id: customerId, ...cursorQuery };

    const items = await OrderModel.find(filter)
        .sort({ [sortField]: sortOrder, _id: sortOrder })
        .limit(limit + 1)
        .lean();

    return buildPaginationResult(items, limit, sortField);
}

# API Documentation

The backend API is built using Hono and follows RESTful principles where applicable.

---

## Authentication
Authentication is handled via JWT (RS256). Short-lived access tokens are returned in the response body, while long-lived refresh tokens are stored in HTTP-only cookies.
All authentication endpoints are subject to rate limiting.

#### `POST /auth/login`
Authenticates a user and starts a session.
- **Request Body**:
  ```json
  { "email": "admin@example.com", "password": "..." }
  ```
- **Response**: `200 OK` with `{ "accessToken": "..." }`. Sets `refresh_token` and `session_id` cookies.

#### `POST /auth/refresh`
Refreshes the access token using the refresh token cookie.
- **Response**: `200 OK` with `{ "accessToken": "..." }`. Sets/rotates the `refresh_token` cookie.
- **Errors**: `401 Unauthorized` if refresh token or session id cookie is missing.

#### `POST /auth/logout`
Invalidates the session and clears cookies.
- **Headers**: `Authorization: Bearer <token>`
- **Response**: `200 OK` with `{ "message": "Logged out" }`. Clears `refresh_token` and `session_id` cookies.

#### `POST /auth/forgot-password`
Initiates a password reset flow.
- **Request Body**:
  ```json
  { "email": "user@example.com" }
  ```
- **Response**: `200 OK` with `{ "message": "If that email exists, a reset link has been sent." }`.

#### `POST /auth/reset-password`
Resets the password using a valid reset token.
- **Request Body**:
  ```json
  { "token": "...", "password": "new_password" }
  ```
- **Response**: `200 OK` with `{ "message": "Password has been reset." }`.

---

## Users
Endpoints for managing admin users. Requires `users:write` permission and authentication (Superadmin only).

#### `GET /users`
List all users (excluding password hashes).
- **Response**: `200 OK` with `{ "items": [...] }`.

#### `GET /users/:id`
Get details of a specific user.
- **Response**: `200 OK` with user details (excluding password hash).
- **Errors**: `404 Not Found` if user does not exist.

#### `POST /users`
Create a new admin user.
- **Request Body**:
  ```json
  { "name": "...", "email": "...", "password": "...", "role": "..." }
  ```
- **Response**: `201 Created` with created user details.

#### `PATCH /users/:id`
Update an admin user's role or status. Only updates `role` and `is_active`.
- **Request Body**:
  ```json
  { "role": "editor", "is_active": false }
  ```
- **Response**: `200 OK` with updated user details.

#### `DELETE /users/:id`
Deactivates an admin user (soft-delete, sets `is_active: false`).
- **Response**: `200 OK` with updated user details.

---

## Roles
RBAC role and permission management. Requires `users:write` permission and authentication.

#### `GET /roles`
List all available roles and their permission mappings.
- **Response**: `200 OK` with `{ "items": [...] }`.

---

## Categories
Manage product categories. Requires authentication.

#### `GET /categories`
List all product categories.
- **Permissions**: `categories:read`
- **Response**: `200 OK` with `{ "items": [...] }`.

#### `POST /categories`
Create a new category.
- **Permissions**: `categories:write`
- **Request Body**:
  ```json
  { "name": "...", "slug": "...", "description": "..." }
  ```
- **Response**: `201 Created` with the new category.

#### `PUT /categories/:id`
Update an existing category.
- **Permissions**: `categories:write`
- **Request Body**:
  ```json
  { "name": "...", "slug": "...", "description": "..." }
  ```
- **Response**: `200 OK` with the updated category.

#### `DELETE /categories/:id`
Delete a category.
- **Permissions**: `categories:write`
- **Response**: `200 OK` with `{ "message": "Category deleted" }`.

---

## Products
Endpoints for managing the product catalog. Requires authentication.

#### `GET /products`
List all products with filtering and pagination.
- **Permissions**: `products:read`
- **Query Params**: `limit`, `cursor`, `category`, `status`, etc.
- **Response**: `200 OK` with items and pagination metadata.

#### `POST /products`
Create a new product.
- **Permissions**: `products:write`
- **Request Body**: Product details (name, description, variants, attributes, etc.).
- **Response**: `201 Created`.

#### `GET /products/:id`
Get details of a specific product.
- **Permissions**: `products:read`
- **Response**: `200 OK`.

#### `PUT /products/:id`
Update a product.
- **Permissions**: `products:write`
- **Request Body**: Updated product details.
- **Response**: `200 OK`.

#### `DELETE /products/:id`
Archive or hard-delete a product.
- **Permissions**: `products:write`
- **Query Param**: `force=true` for hard-delete; otherwise, the product is archived.
- **Response**: `200 OK` with `{ "message": "Product hard-deleted" }` or `{ "message": "Product archived" }`.

#### `POST /products/upload-url`
Generate a presigned URL to upload product assets (images).
- **Permissions**: `products:write`
- **Request Body**:
  ```json
  { "content_type": "image/jpeg" }
  ```
- **Response**: `200 OK` with `{ "uploadUrl": "...", "key": "..." }`.

---

## Inventory
Stock level tracking and adjustments. Requires authentication.

#### `GET /inventory`
List all inventory items.
- **Permissions**: `inventory:read`
- **Query Params**: Filter parameters.
- **Response**: `200 OK`.

#### `GET /inventory/:variantId`
Get inventory details for a specific product variant.
- **Permissions**: `inventory:read`
- **Response**: `200 OK`.

#### `PATCH /inventory/:variantId/adjust`
Adjust stock levels for a product variant.
- **Permissions**: `inventory:write`
- **Request Body**:
  ```json
  { "delta": 10, "reason": "Restock" }
  ```
- **Response**: `200 OK` with the adjusted inventory item.

---

## Orders
Order management and lifecycle. Requires authentication.

#### `GET /orders`
List all orders with filtering and pagination.
- **Permissions**: `orders:read`
- **Query Params**: Filter parameters.
- **Response**: `200 OK`.

#### `POST /orders`
Create a new order. Requires an `Idempotency-Key` header.
- **Permissions**: `orders:write`
- **Headers**: `Idempotency-Key: <unique-uuid>`
- **Request Body**: Order details (items, shipping, billing, payment_method, etc.).
- **Response**: `201 Created`.

#### `GET /orders/:id`
Get details of a specific order.
- **Permissions**: `orders:read`
- **Response**: `200 OK`.

#### `PATCH /orders/:id/status`
Update the status of an order (e.g., `shipped`, `cancelled`).
- **Permissions**: `orders:write`
- **Request Body**:
  ```json
  { "status": "cancelled", "cancel_reason": "Customer request" }
  ```
- **Response**: `200 OK`.

---

## Customers
Customer profiles and history. Requires authentication.

#### `GET /customers`
List customers with filters.
- **Permissions**: `customers:read`
- **Response**: `200 OK`.

#### `POST /customers`
Create a new customer profile.
- **Permissions**: `customers:write`
- **Request Body**: Customer contact/profile info.
- **Response**: `201 Created`.

#### `GET /customers/:id`
Get details of a specific customer.
- **Permissions**: `customers:read`
- **Response**: `200 OK`.

#### `PATCH /customers/:id`
Update a customer profile.
- **Permissions**: `customers:write`
- **Response**: `200 OK`.

#### `DELETE /customers/:id`
Delete a customer profile.
- **Permissions**: `customers:write`
- **Response**: `200 OK` with `{ "message": "Customer deleted" }`.

#### `PATCH /customers/:id/restore`
Restore a soft-deleted customer profile.
- **Permissions**: `customers:write`
- **Response**: `200 OK`.

#### `GET /customers/:id/orders`
Get order history for a specific customer.
- **Permissions**: `orders:read`
- **Response**: `200 OK`.

---

## Webhooks
Integration routes for third-party services.

#### `POST /webhooks/stripe`
Stripe webhook endpoint. Processes incoming payment, shipping, and dispute events.
- **Headers**: `Stripe-Signature: <sig>`
- **Request Body**: Raw Stripe event payload.
- **Response**: `200 OK` with `{ "received": true }`.
- **Notes**: Incoming events are de-duplicated using Redis and processed asynchronously via BullMQ.

---

## Dashboard
Metrics and summary statistics. Requires authentication.

#### `GET /dashboard/summary`
Get aggregated dashboard statistics (sales, orders count, low stock alert metrics, etc.).
- **Permissions**: `dashboard:read`
- **Response**: `200 OK`.

#### `GET /dashboard/top-products`
Get a list of top selling products.
- **Permissions**: `dashboard:read`
- **Response**: `200 OK` with `{ "items": [...] }`.

---

## Reports
Exportable business reports. Requires authentication.

#### `GET /reports/sales`
Get sales performance reports for a specific range.
- **Permissions**: `reports:read`
- **Query Params**: `start_date`, `end_date` (required)
- **Response**: `200 OK`.
- **Errors**: `422 Unprocessable Entity` if query params are missing.

#### `GET /reports/inventory`
Get inventory health and stock status reports.
- **Permissions**: `reports:read`
- **Response**: `200 OK` with `{ "items": [...] }`.

---

## Audit Logs
System audit trail. Requires authentication.

#### `GET /audit-logs`
List system audit logs with cursor-based pagination and filtering.
- **Permissions**: `audit_logs:read`
- **Query Params**: `limit`, `cursor`, `entity_type`, `actor_type`, `actor_id`, `result`, `start_date`, `end_date`.
- **Response**: `200 OK` with paginated audit logs.

#### `GET /audit-logs/:id`
Get a specific audit log detail.
- **Permissions**: `audit_logs:read`
- **Response**: `200 OK`.

---

## Reviews
Endpoints for managing customer reviews. Requires authentication.

#### `GET /reviews`
List all customer reviews with pagination and status/rating filters.
- **Permissions**: `reviews:read`
- **Query Params**: `limit`, `cursor`, `status` (`pending`, `approved`, `rejected`), `rating` (`1` to `5`).
- **Response**: `200 OK` with paginated reviews items.

#### `PATCH /reviews/:id`
Approve, reject, or reset a review's moderation status.
- **Permissions**: `reviews:write`
- **Request Body**:
  ```json
  { "status": "approved" }
  ```
- **Response**: `200 OK` with the updated review. Recalculates product rating aggregates if status transitions to or from approved.

#### `POST /reviews/:id/reply`
Post or edit an administrative reply response to a customer review.
- **Permissions**: `reviews:write`
- **Request Body**:
  ```json
  { "text": "Thank you for the review!" }
  ```
- **Response**: `200 OK` with the updated review including `admin_reply` block.

#### `DELETE /reviews/:id`
Delete a review from the database.
- **Permissions**: `reviews:write`
- **Response**: `200 OK` with `{ "message": "Review deleted" }`. Recalculates product rating aggregates.

---

## Storefront Reviews
Storefront customer facing endpoints. Requires authentication for submission actions.

#### `GET /storefront/products/:productId/reviews`
List approved reviews for a specific product.
- **Response**: `200 OK` with `{ "items": [...], "next_cursor": "...", "has_more": false }`.

#### `POST /storefront/products/:productId/reviews`
Submit a new product review. Subject to eligibility and settings (e.g. auto-publish vs. pending moderation).
- **Authentication**: Storefront customer login token required.
- **Request Body**:
  ```json
  { "rating": 5, "title": "Great Product", "comment": "Highly recommended", "images": ["https://..."] }
  ```
- **Response**: `201 Created` with the new review.

#### `POST /storefront/reviews/upload-url`
Request a presigned image upload URL for review attachments.
- **Authentication**: Storefront customer login token required.
- **Request Body**:
  ```json
  { "contentType": "image/jpeg" }
  ```
- **Response**: `200 OK` with `{ "uploadUrl": "...", "key": "..." }`.

---

## Settings
System-wide configuration management (singleton document). Requires `settings:read` / `settings:write` permissions.

#### `GET /settings`
Get full store settings (general, taxes, reviews, shipping).
- **Permissions**: `settings:read`
- **Response**: `200 OK` with settings document.

#### `PUT /settings/general`
Update general store configuration and country/state definitions.
- **Permissions**: `settings:write`
- **Request Body**: `{ "storeName": "...", "storeEmail": "...", "currency": "...", "countriesConfig": [...] }`
- **Response**: `200 OK`.

#### `PUT /settings/taxes`
Update tax rules and GST/VAT settings. Validated via route-level Zod schemas.
- **Permissions**: `settings:write`
- **Request Body**:
  ```json
  {
    "taxRules": [
      {
        "country": "United States",
        "countryCode": "US",
        "state": "California",
        "stateCode": "CA",
        "rate": 8.25,
        "name": "CA Tax",
        "active": true
      }
    ],
    "gstVatSettings": { "enabled": true, "gstin": "...", "inclusive": false },
    "countriesConfig": [...]
  }
  ```
- **Response**: `200 OK`.
- **Errors**: `422 Unprocessable Entity` on validation failure.

#### `PUT /settings/shipping`
Update global shipping status, shipping zones, custom rate rules (including `deliveryTime`), and carrier integrations.
- **Permissions**: `settings:write`
- **Request Body**:
  ```json
  {
    "enabled": true,
    "zones": [
      {
        "name": "Domestic",
        "countries": ["India"],
        "states": ["IN:PB"],
        "rates": [
          {
            "name": "Express",
            "type": "flat",
            "price": 100,
            "deliveryTime": "1-2 business days",
            "active": true
          }
        ],
        "active": true
      }
    ],
    "carriers": { ... }
  }
  ```
- **Response**: `200 OK`.

---

## Storefront Public & Shipping
Public endpoints used by the storefront for configuration and shipping calculations.

#### `GET /storefront/settings`
Fetch public storefront configuration (tax rules, country/state lists, currency).
- **Behavior**: When shipping is enabled globally, `countriesConfig` and `taxRules` are dynamically filtered to return only countries and states covered by active shipping zones.
- **Response**: `200 OK` with `{ "taxes": { ... }, "general": { "currency": "INR" } }`.

#### `POST /storefront/shipping/rates`
Calculate available shipping rates based on destination address, cart weight, and subtotal.
- **Request Body**:
  ```json
  {
    "destCountry": "India",
    "destState": "Punjab",
    "destPostcode": "141001",
    "totalWeight": 500,
    "subtotal": 1000
  }
  ```
- **Response**: `200 OK` with `{ "rates": [ { "id": "...", "name": "Express", "price": 100, "type": "custom_flat", "deliveryTime": "1-2 business days" } ] }`.

---

## Error Handling
The API uses standard HTTP status codes:
- `400 Bad Request`: Validation or signature verification errors.
- `401 Unauthorized`: Missing or invalid authentication.
- `403 Forbidden`: Insufficient permissions (RBAC).
- `404 Not Found`: Resource not found.
- `422 Unprocessable Entity`: Validation or missing query parameter errors.
- `500 Internal Server Error`: Unexpected system errors.

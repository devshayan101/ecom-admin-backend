# API Documentation

The backend API is built using Hono and follows RESTful principles where applicable.

## Authentication
Authentication is handled via JWT (RS256). Short-lived access tokens are returned in the response body, while long-lived refresh tokens are stored in HTTP-only cookies.

### Endpoints

#### `POST /auth/login`
Authenticates a user and starts a session.
- **Request Body**:
  ```json
  { "email": "admin@example.com", "password": "..." }
  ```
- **Response**: `200 OK` with `{ "accessToken": "..." }`. Sets `refresh_token` and `session_id` cookies.

#### `POST /auth/refresh`
Refreshes the access token using the refresh token cookie.
- **Response**: `200 OK` with `{ "accessToken": "..." }`.

#### `POST /auth/logout`
Invalidates the session and clears cookies.

---

## Products
Endpoints for managing the product catalog. Requires `products:read` or `products:write` permissions.

#### `GET /products`
List all products with filtering and pagination.
- **Permissions**: `products:read`

#### `POST /products`
Create a new product.
- **Permissions**: `products:write`
- **Request Body**: Product details (name, description, price, category, etc.).

#### `GET /products/:id`
Get details of a specific product.

#### `PUT /products/:id`
Update a product.

#### `DELETE /products/:id`
Archive or hard-delete a product.
- **Query Param**: `force=true` for hard-delete.

---

## Orders
Order management and lifecycle.

#### `GET /orders`
List all orders.
- **Permissions**: `orders:read`

#### `POST /orders`
Create a new order. Requires an `Idempotency-Key` header.
- **Permissions**: `orders:write`

#### `PATCH /orders/:id/status`
Update the status of an order (e.g., `shipped`, `cancelled`).

---

## Other Routes
- `/users`: Admin user management.
- `/roles`: RBAC role and permission management.
- `/categories`: Product category management.
- `/inventory`: Stock level tracking and adjustments.
- `/customers`: Customer profiles and history.
- `/webhooks`: Stripe webhook integration.
- `/dashboard`: Metrics and summary statistics.
- `/reports`: Exportable business reports.
- `/audit-logs`: System audit trail.

## Error Handling
The API uses standard HTTP status codes:
- `400 Bad Request`: Validation errors.
- `401 Unauthorized`: Missing or invalid authentication.
- `403 Forbidden`: Insufficient permissions (RBAC).
- `404 Not Found`: Resource not found.
- `500 Internal Server Error`: Unexpected system errors.

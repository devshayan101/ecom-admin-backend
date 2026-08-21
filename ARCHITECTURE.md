# Architecture Overview

This document describes the architectural patterns and system design of the ecom-admin-backend.

## System Design
The backend follows a layered architecture to separate concerns and ensure maintainability.

### 1. Route Layer (`src/routes/`)
Handles HTTP requests, parses parameters, and enforces authentication and RBAC. It delegates business logic to the Service Layer.

### 2. Service Layer (`src/services/`)
Contains the core business logic. It interacts with multiple models, external APIs (Stripe, AWS), and background queues. This layer is designed to be framework-agnostic.

### 3. Data Layer (`src/models/`)
Defines the structure of the data using Mongoose schemas for MongoDB. It ensures data integrity and provides helper methods for common queries.

### 4. Worker Layer (`src/workers/`)
Processes asynchronous background jobs using BullMQ. Key tasks include:
- Generating low-stock alerts.
- Sending transactional emails via Resend.
- Processing Stripe and Razorpay payment confirmations using `ProcessedEventModel` database logging to ensure durable, retryable side effects.
- Periodic dashboard metric calculations.
- Handling payment deadline cancellations via cron-driven timeout workers.

## Core Patterns

### Authentication & RBAC
- **JWT**: Uses RS256 asymmetric signatures.
- **Session Management**: Session state is persisted in MongoDB to allow for easy revocation.
- **RBAC**: Permissions are loaded into memory at startup and checked via a middleware that maps roles to specific resource actions (e.g., `products:write`).

### Background Processing
BullMQ manages job scheduling and execution via Redis. Each worker is dedicated to a specific queue (e.g., `notifications`, `payments`) to allow for independent scaling.

### Review Moderation & Rating Aggregation
- **Caching Aggregates**: To optimize storefront page-load speeds, aggregate ratings (`rating_average` and `rating_count`) are cached directly on the `Product` document.
- **On-Demand Recalculation**: Averages are computed using MongoDB aggregation pipelines only when reviews transition status (e.g., approved, rejected, deleted), bypassing the need to run costly count/average operations on every storefront product details hit.
- **Moderation Workflow**: Review status defaults to `pending` unless the settings dashboard toggle for `reviews.auto_publish` is turned on.

### Singleton Settings & Validation
- **Known ObjectId Singleton**: Settings stored in MongoDB enforce a strict singleton pattern using a constant ObjectId (`SETTINGS_ID = '000000000000000000000000'`). Upsert operations in `settingsService` and strict `_id` query selectors across storefront, order, and review services eliminate concurrent creation race conditions and guarantee immediate synchronization across services.
- **Route Boundary Validation**: Input mutations for critical configuration (such as tax rules and rate configurations) are validated at the route boundary via Zod schemas before being passed to service layer persistence handlers. COD settings enforce non-negative amount ranges and require `maxOrderAmount >= minOrderAmount` (with 0 representing unlimited).
- **Shipping Zone Checkout Filtering**: When global shipping is enabled, public settings endpoints dynamically compute and return only the subset of countries and states covered by active shipping zones (`zone.active === true`), preventing customers from selecting unserviced destinations during checkout.
- **Homepage Content Management**: Hero Carousel slides, Promotion Grid cards, and Trending Product Video Shorts are stored in the singleton `content` document schema. The backend initializes default seed content on startup/query, validates mutations via Zod schemas at `PUT /settings/content`, and serves active items (`active !== false`) ordered by `sortOrder` on `GET /storefront/settings`. Video shorts and thumbnail poster images leverage CloudFront / S3 presigned URL endpoints (`/settings/content/upload-url`) for low-latency media delivery.
- **Secrets Redaction & Partial Merging**: Payment gateway keys and secrets are redacted as `"••••••••••••••••"` in all API settings responses. Updates use partial input validation, merging only non-undefined fields, while preserving pre-existing database credentials if they match the redaction mask.

### Dynamic Specifications, Variations & FAQs
- **Dynamic Content Sub-types**: Supports storing and managing specifications partitioned into highlights, bullets, styles, technical details, and additional info. Layout rules dynamically render Highlights and About This Item above-the-fold, and group Style, Specs, and Info under vertically collapsed accordions with alternating row background shading and touch-accessible targets.
- **Product Variation Categories**: Allows creating custom, product-level variant categories (e.g. Color, Size) on the fly, storing options within each variant's attributes dictionary, and rendering them as grouped selectors on the storefront (including circular color swatches and text chips) with combination unavailability verification.
- **Product FAQ Fallback**: FAQ rendering supports product-specific Q&A lists. If display config toggles are disabled or no custom FAQs are defined, the FAQ block is completely omitted (returns `null` in the React tree) on the storefront.

### Coupon Code & Discount Engine
- **Promotional Rule Verification**: Supports both percentage-based (`PERCENTAGE`) and fixed amount (`FIXED`) discount rules. Validation checks active toggle status, minimum subtotal requirements (`min_order_amount`), start and end date validity windows (`start_date`, `end_date`), and maximum total redemptions (`usage_limit`).
- **Percentage Discount Capping**: For percentage discounts, `max_discount_amount` caps the maximum discount applied to high-value orders.
- **Atomic Checkout Redemption**: When placing an order, `orderService.createOrder` re-verifies coupon constraints within a database transaction, records `coupon_code` and `discount_amount` directly on the order document, and atomically increments the coupon's `used_count`.

### Execution Runtime & Deployment
- **Bun Runtime**: The application is optimized to run natively under the **Bun** execution runtime (leveraging high-performance HTTP serving and Bun native APIs), falling back to standard Hono Node servers where necessary.
- **Dockerization**: The production multi-stage `Dockerfile` installs dependencies and builds the bundle using `oven/bun:1-alpine`.

### Integrations
- **Razorpay & Stripe (Dual Payment Gateways)**: Handles order checkouts dynamically based on customer destination. Razorpay processes domestic India orders (INR in paise), while Stripe processes all international orders (USD in cents).
- **Cloudflare R2**: Used for product image storage with pre-signed upload URLs for security (using S3-compatible API).
- **Resend**: Sends transactional emails for order confirmations and password resets.
- **AWS Secrets Manager**: Manages sensitive configuration in production environments.

### Testing
- **Unit Tests**: Test individual services using Jest mocks for database and external dependencies.
- **Integration Tests**: Test full API flows using `supertest` with a MongoDB Memory Server.

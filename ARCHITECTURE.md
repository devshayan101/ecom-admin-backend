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
- Processing Stripe payment confirmations.
- Periodic dashboard metric calculations.

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
- **Route Boundary Validation**: Input mutations for critical configuration (such as tax rules and rate configurations) are validated at the route boundary via Zod schemas before being passed to service layer persistence handlers.
- **Shipping Zone Checkout Filtering**: When global shipping is enabled, public settings endpoints dynamically compute and return only the subset of countries and states covered by active shipping zones (`zone.active === true`), preventing customers from selecting unserviced destinations during checkout.

### Integrations
- **Stripe**: Handles order payments. Webhooks update the order status asychronously.
- **Cloudflare R2**: Used for product image storage with pre-signed upload URLs for security (using S3-compatible API).
- **Resend**: Sends transactional emails for order confirmations and password resets.
- **AWS Secrets Manager**: Manages sensitive configuration in production environments.

### Testing
- **Unit Tests**: Test individual services using Jest mocks for database and external dependencies.
- **Integration Tests**: Test full API flows using `supertest` with a MongoDB Memory Server.

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
- Sending transactional emails via SES.
- Processing Stripe payment confirmations.
- Periodic dashboard metric calculations.

## Core Patterns

### Authentication & RBAC
- **JWT**: Uses RS256 asymmetric signatures.
- **Session Management**: Session state is persisted in MongoDB to allow for easy revocation.
- **RBAC**: Permissions are loaded into memory at startup and checked via a middleware that maps roles to specific resource actions (e.g., `products:write`).

### Background Processing
BullMQ manages job scheduling and execution via Redis. Each worker is dedicated to a specific queue (e.g., `notifications`, `payments`) to allow for independent scaling.

### Integrations
- **Stripe**: Handles order payments. Webhooks update the order status asychronously.
- **AWS S3**: Used for product image storage with pre-signed upload URLs for security.
- **AWS SES**: Sends transactional emails for order confirmations and password resets.
- **AWS Secrets Manager**: Manages sensitive configuration in production environments.

### Testing
- **Unit Tests**: Test individual services using Jest mocks for database and external dependencies.
- **Integration Tests**: Test full API flows using `supertest` with a MongoDB Memory Server.

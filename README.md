# Ecom Admin Backend

A robust backend for the Ecommerce Admin system, built with Hono, TypeScript, and MongoDB.

## Tech Stack
- **Framework**: [Hono](https://hono.dev/)
- **Runtime**: Node.js
- **Database**: MongoDB (via Mongoose)
- **Background Tasks**: BullMQ (with Redis)
- **Service Integration**:
  - **Payments**: Stripe
  - **Storage**: AWS S3
  - **Email**: AWS SES
  - **Secrets**: AWS Secrets Manager
- **Validation**: Zod
- **Authentication**: JWT (RS256)

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- MongoDB
- Redis
- [LocalStack](https://localstack.cloud/) (for local AWS services)

### Installation
1. Clone the repository and navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables:
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Fill in the required secrets (Stripe, AWS, JWT keys).

### Running Locally
- **Development mode**:
  ```bash
  npm run dev
  ```
- **Build**:
  ```bash
  npm run build
  ```
- **Production mode**:
  ```bash
  npm run start
  ```

## Project Structure
- `src/index.ts`: Entry point and server configuration.
- `src/routes/`: API route definitions.
- `src/services/`: Business logic layer.
- `src/models/`: Mongoose schemas.
- `src/workers/`: Background job processors.
- `src/middleware/`: Custom middleware (Auth, RBAC, etc.).
- `src/config/`: Configuration and secrets management.

## API Documentation
See [API.md](./API.md) for detailed endpoint documentation.

## Architecture
See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design details.

# Ecom Admin Backend

A robust backend for the Ecommerce Admin system, built with Hono, TypeScript, and MongoDB.

## Tech Stack & Features
- **Framework**: [Hono](https://hono.dev/)
- **Runtime**: Bun (Optimized execution) / Node.js
- **Database**: MongoDB (via Mongoose) with singleton Settings enforcement
- **Background Tasks**: BullMQ (with Redis)
- **Service Integration**:
  - **Payments**: Razorpay (domestic) & Stripe (international)
  - **Storage**: Cloudflare R2
  - **Email**: Resend
  - **Secrets**: AWS Secrets Manager
- **Validation**: Zod (Route boundary validation for Settings & APIs)
- **Authentication**: JWT (RS256)
- **Shipping Engine**: Dynamic zone matching with active shipping zone checkout filtering and custom rate delivery times
- **Homepage Content Management**: Admin-controlled Hero Carousel slides, Promotion Grid cards, and Trending Product Video Shorts managed via singleton settings with CloudFront media uploads.
- **Dynamic Specifications, Variations & FAQs**: Supports dynamic specifications (Highlights, About This Item, Specs Sheets), custom product-level variant categories (Color, Size) defined on the fly, and collapsible product FAQs with conditional storefront rendering.
- **Coupon Code & Discount Management**: Full promotional discount system supporting percentage and fixed discounts, minimum order constraints, max discount caps, date validity windows, total usage limits, and real-time storefront cart drawer & checkout validation.

## Setup Instructions

### Prerequisites
- Bun (Preferred) or Node.js (v18+)
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
   bun install # or npm install
   ```
3. Configure environment variables:
   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Fill in the required secrets (Stripe, Razorpay, AWS, JWT keys).

### Running Locally
- **Development mode**:
  ```bash
  bun run dev # or npm run dev
  ```
- **Build**:
  ```bash
  bun run build # or npm run build
  ```
- **Production mode**:
  ```bash
  bun run start # or npm run start
  ```

## Project Structure
- `src/index.ts`: Entry point and server configuration.
- `src/routes/`: API route definitions (including product reviews and coupons).
- `src/services/`: Business logic layer (including review management, ratings, and coupon validation).
- `src/models/`: Mongoose schemas (Product, Review, Coupon, Settings, etc.).
- `src/workers/`: Background job processors.
- `src/middleware/`: Custom middleware (Auth, RBAC, etc.).
- `src/config/`: Configuration and secrets management.

## API Documentation
See [API.md](./API.md) for detailed endpoint documentation.

## Architecture
See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design details.

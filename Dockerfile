# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN bun ci

COPY . .

RUN bun run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN bun ci --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["bun", "run", "start"]

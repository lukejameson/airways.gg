# Build from monorepo root context (docker-compose sets context: .)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package*.json ./
COPY packages/database/package*.json ./packages/database/
COPY apps/position-service/package*.json ./apps/position-service/

# Install all workspace dependencies
RUN npm install

# Copy source
COPY packages/database/ ./packages/database/
COPY apps/position-service/ ./apps/position-service/

# Build
WORKDIR /app/apps/position-service
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/apps/position-service/dist ./dist
COPY --from=builder /app/apps/position-service/package*.json ./

RUN npm ci --omit=dev

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]

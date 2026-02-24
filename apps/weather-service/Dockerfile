# Build from monorepo root context (docker-compose sets context: .)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package*.json ./
COPY packages/database/package*.json ./packages/database/
COPY apps/weather-service/package*.json ./apps/weather-service/

# Install all workspace dependencies
RUN npm install

# Copy source
COPY packages/database/ ./packages/database/
COPY apps/weather-service/ ./apps/weather-service/

WORKDIR /app/packages/database
RUN npm run build

WORKDIR /app/apps/weather-service
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/apps/weather-service/dist ./dist
COPY --from=builder /app/apps/weather-service/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]

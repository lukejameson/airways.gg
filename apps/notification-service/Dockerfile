# Build from monorepo root context (docker-compose sets context: .)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package*.json ./
COPY packages/database/package*.json ./packages/database/
COPY apps/notification-service/package*.json ./apps/notification-service/

# Install all workspace dependencies
RUN npm install

# Copy source
COPY packages/database/ ./packages/database/
COPY apps/notification-service/ ./apps/notification-service/

WORKDIR /app/packages/database
RUN npm run build

WORKDIR /app/apps/notification-service
RUN npm run build

# Prune devDependencies before copying to the production image
WORKDIR /app
RUN npm prune --production

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/apps/notification-service/dist ./dist
COPY --from=builder /app/apps/notification-service/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database ./packages/database

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]

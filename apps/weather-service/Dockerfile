# Build from monorepo root context (docker-compose sets context: .)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package*.json ./
COPY packages/database/package*.json ./packages/database/
COPY packages/telegram/package*.json ./packages/telegram/
COPY apps/weather-service/package*.json ./apps/weather-service/

# Install all workspace dependencies
RUN npm install

# Copy source
COPY packages/database/ ./packages/database/
COPY packages/telegram/ ./packages/telegram/
COPY apps/weather-service/ ./apps/weather-service/

WORKDIR /app/packages/database
RUN npm run build

WORKDIR /app/packages/telegram
RUN npm run build

WORKDIR /app/apps/weather-service
RUN npm run build

# Prune devDependencies before copying to the production image
WORKDIR /app
RUN npm prune --production

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/apps/weather-service/dist ./dist
COPY --from=builder /app/apps/weather-service/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/packages/telegram ./packages/telegram

ENV NODE_ENV=production \
    TZ=UTC
CMD ["node", "dist/index.js"]

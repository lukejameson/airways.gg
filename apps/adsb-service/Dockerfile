# Build from monorepo root context (docker-compose sets context: .)
# No TypeScript build step — dist/ contains pre-compiled JS
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package*.json ./
COPY packages/database/package*.json ./packages/database/
COPY apps/adsb-service/package*.json ./apps/adsb-service/

# Install all workspace dependencies
RUN npm install

# Copy source
COPY packages/database/ ./packages/database/
COPY apps/adsb-service/ ./apps/adsb-service/

WORKDIR /app/packages/database
RUN npm run build

# Prune devDependencies before copying to the production image
WORKDIR /app
RUN npm prune --production

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/apps/adsb-service/dist ./dist
COPY --from=builder /app/apps/adsb-service/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database ./packages/database

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]

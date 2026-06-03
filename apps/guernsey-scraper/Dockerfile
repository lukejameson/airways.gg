# Build from monorepo root context
# docker-compose.yml: context: . / dockerfile: apps/guernsey-scraper/Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/database/package*.json ./packages/database/
COPY packages/telegram/package*.json ./packages/telegram/
COPY apps/guernsey-scraper/package*.json ./apps/guernsey-scraper/

RUN npm install

COPY packages/database/ ./packages/database/
COPY packages/telegram/ ./packages/telegram/
COPY apps/guernsey-scraper/ ./apps/guernsey-scraper/

WORKDIR /app/packages/database
RUN npm run build

WORKDIR /app/packages/telegram
RUN npm run build

WORKDIR /app/apps/guernsey-scraper
RUN npm run build

# Prune devDependencies before copying to the production image
WORKDIR /app
RUN npm prune --production

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/apps/guernsey-scraper/dist ./dist
COPY --from=builder /app/apps/guernsey-scraper/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database ./packages/database
COPY --from=builder /app/packages/telegram ./packages/telegram

RUN apk add --no-cache tzdata

ENV NODE_ENV=production \
    TZ=UTC
CMD ["node", "dist/index.js"]

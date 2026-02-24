# Build from monorepo root context
# docker-compose.yml: context: . / dockerfile: apps/guernsey-scraper/Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY packages/database/package*.json ./packages/database/
COPY apps/guernsey-scraper/package*.json ./apps/guernsey-scraper/

RUN npm install

COPY packages/database/ ./packages/database/
COPY apps/guernsey-scraper/ ./apps/guernsey-scraper/

WORKDIR /app/apps/guernsey-scraper
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/apps/guernsey-scraper/dist ./dist
COPY --from=builder /app/apps/guernsey-scraper/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

CMD ["node", "dist/index.js"]

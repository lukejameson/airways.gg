FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/database/package*.json ./packages/database/
COPY apps/api/package*.json ./apps/api/
RUN npm install
COPY packages/database/ ./packages/database/
COPY apps/api/ ./apps/api/
WORKDIR /app/packages/database
RUN npm run build
WORKDIR /app/apps/api
RUN npm run build
WORKDIR /app
RUN npm prune --production

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database ./packages/database
ENV NODE_ENV=production \
    TZ=UTC
CMD ["node", "dist/index.js"]

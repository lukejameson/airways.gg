# Build from monorepo root context (docker-compose sets context: .)
# docker-compose.yml should set: context: . / dockerfile: apps/web/Dockerfile

FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package*.json ./
COPY packages/database/package*.json ./packages/database/
COPY apps/web/package*.json ./apps/web/

# Install all workspace dependencies
RUN npm install

# Copy source
COPY packages/database/ ./packages/database/
COPY apps/web/ ./apps/web/

# Build
WORKDIR /app/apps/web
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy only the built SvelteKit output (adapter-node produces a self-contained build/)
COPY --from=builder /app/apps/web/build ./build
COPY --from=builder /app/apps/web/preload-env.js ./
COPY --from=builder /app/apps/web/package*.json ./

# SvelteKit adapter-node bundles everything; only need prod deps for any external runtime deps
RUN npm ci --omit=dev

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "--import", "./preload-env.js", "build"]

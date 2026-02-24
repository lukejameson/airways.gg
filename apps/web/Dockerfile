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

# Build the shared database package first so its dist/ exists for Vite
WORKDIR /app/packages/database
RUN npm run build

# Build the web app
WORKDIR /app/apps/web
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy only the built SvelteKit output (adapter-node produces a self-contained build/)
COPY --from=builder /app/apps/web/build ./build
COPY --from=builder /app/apps/web/preload-env.js ./
COPY --from=builder /app/apps/web/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database ./packages/database

EXPOSE 3000
ENV NODE_ENV=production
CMD ["sh", "-c", "cd /app/packages/database && npx drizzle-kit migrate || true && cd /app && node --import ./preload-env.js build"]

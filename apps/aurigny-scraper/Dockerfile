# Build from monorepo root context
# docker-compose.yml: context: . / dockerfile: apps/aurigny-scraper/Dockerfile

FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace manifests
COPY package*.json ./
COPY packages/database/package*.json ./packages/database/
COPY apps/aurigny-scraper/package*.json ./apps/aurigny-scraper/

RUN npm install

COPY packages/database/ ./packages/database/
COPY apps/aurigny-scraper/ ./apps/aurigny-scraper/

WORKDIR /app/packages/database
RUN npm run build

WORKDIR /app/apps/aurigny-scraper
RUN npm run build

# Runtime stage — needs Chromium for puppeteer-real-browser
FROM node:20-slim

# Install Chromium, Xvfb and dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    xvfb \
    fonts-freefont-ttf \
    libxss1 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    DISPLAY=:99

WORKDIR /app

COPY --from=builder /app/apps/aurigny-scraper/dist ./dist
COPY --from=builder /app/apps/aurigny-scraper/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database ./packages/database

# Create user with a home directory so Chromium can write profile/cache files.
# Add to video group so Xvfb can create a virtual display, chmod /tmp so
# Xvfb can write its X lock files.
RUN groupadd -r scraper && useradd -r -g scraper -m -d /home/scraper scraper \
    && usermod -aG video scraper \
    && chmod 1777 /tmp

USER scraper

CMD ["node", "dist/index.js"]

# Build from monorepo root context
# docker-compose.yml: context: . / dockerfile: apps/aurigny-scraper/Dockerfile

FROM node:20-slim AS builder

WORKDIR /app

# Copy workspace manifests
COPY package*.json ./
COPY packages/database/package*.json ./packages/database/
COPY apps/aurigny-scraper/package*.json ./apps/aurigny-scraper/

# Install dependencies - puppeteer-real-browser will download its patched Chrome
RUN npm install

COPY packages/database/ ./packages/database/
COPY apps/aurigny-scraper/ ./apps/aurigny-scraper/

WORKDIR /app/packages/database
RUN npm run build

WORKDIR /app/apps/aurigny-scraper
RUN npm run build

# Prune devDependencies before copying to the production image
WORKDIR /app
RUN npm prune --production

# Runtime stage
FROM node:20-slim

# Install Xvfb and browser dependencies (but NOT system Chromium)
RUN apt-get update && apt-get install -y \
    xvfb \
    gosu \
    tzdata \
    locales \
    procps \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-dejavu-core \
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
    libpango-1.0-0 \
    libcairo2 \
    dbus \
    libx11-xcb1 \
    libxcb-dri3-0 \
    libdrm2 \
    libxkbcommon0 \
    libglu1-mesa \
    --no-install-recommends \
    && ln -snf /usr/share/zoneinfo/Europe/London /etc/localtime \
    && echo "Europe/London" > /etc/timezone \
    && locale-gen en_GB.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    HOME=/home/scraper \
    TZ=Europe/London \
    LANG=en_GB.UTF-8 \
    LANGUAGE=en_GB:en

WORKDIR /app

COPY --from=builder /app/apps/aurigny-scraper/dist ./dist
COPY --from=builder /app/apps/aurigny-scraper/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/database ./packages/database

# Copy puppeteer's downloaded Chrome from builder's cache
COPY --from=builder /root/.cache/puppeteer /root/.cache/puppeteer

# Create user with a home directory so Chromium can write profile/cache files.
RUN groupadd -r scraper && useradd -r -g scraper -m -d /home/scraper scraper \
    && usermod -aG video scraper \
    && chmod 1777 /tmp

COPY apps/aurigny-scraper/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Copy puppeteer's downloaded Chrome from builder's cache to a shared location
RUN mkdir -p /opt/chrome \
    && cp -r /root/.cache/puppeteer/chrome /opt/chrome/ \
    && chown -R scraper:scraper /opt/chrome \
    && rm -rf /root/.cache

ENTRYPOINT ["docker-entrypoint.sh"]

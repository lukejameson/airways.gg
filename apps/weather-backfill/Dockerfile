FROM node:20-alpine
WORKDIR /app
RUN npm install pg
COPY scripts/weather-backfill.mjs ./weather-backfill.mjs
ENV NODE_ENV=production \
    TZ=UTC
ENTRYPOINT ["node", "weather-backfill.mjs"]

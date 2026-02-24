#!/bin/sh
# Entrypoint script that runs database migrations before starting the app

echo "Running database migrations..."
cd /app/packages/database
npx drizzle-kit migrate

echo "Starting application..."
cd /app
exec node --import ./preload-env.js build

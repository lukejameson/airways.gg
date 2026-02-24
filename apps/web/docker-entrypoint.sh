#!/bin/sh
set -e

# Entrypoint script that runs database migrations before starting the app

cd /app/packages/database

# Retry migration up to 30 times with 2 second delay (1 minute total)
for i in $(seq 1 30); do
    echo "[migrate] Attempt $i/30..."
    if npx drizzle-kit migrate 2>&1; then
        echo "[migrate] Done."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "[migrate] Failed after 30 attempts, starting app anyway."
    else
        echo "[migrate] Database not ready, retrying in 2s..."
        sleep 2
    fi
done

echo "[entrypoint] Starting application..."
cd /app
exec node --import ./preload-env.js build

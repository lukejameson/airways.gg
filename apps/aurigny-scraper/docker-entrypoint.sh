#!/bin/bash
set -e

# Start Xvfb for headless browser with GUI
export DISPLAY=:99
Xvfb :99 -screen 0 1920x1080x24 -ac &
XVFB_PID=$!

# Give Xvfb time to start
sleep 2

# Check if Xvfb is running
if ! kill -0 $XVFB_PID 2>/dev/null; then
    echo "Failed to start Xvfb"
    exit 1
fi

echo "Xvfb started on display :99"

# Run the scraper as non-root user
exec gosu scraper node dist/index.js
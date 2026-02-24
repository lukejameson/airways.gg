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

# Find and set CHROME_PATH for puppeteer-real-browser
CHROME_BIN=$(find /opt/chrome -name chrome -type f -path "*/chrome-linux64/*" 2>/dev/null | head -1)

if [ -n "$CHROME_BIN" ]; then
    export CHROME_PATH="$CHROME_BIN"
    echo "Found Chrome at: $CHROME_PATH"
else
    echo "Error: Chrome binary not found in /opt/chrome"
    exit 1
fi

# Run the scraper as non-root user
exec gosu scraper node dist/index.js
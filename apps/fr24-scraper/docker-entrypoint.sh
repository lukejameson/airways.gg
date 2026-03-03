#!/bin/bash
set -e

# Find and set CHROME_PATH for puppeteer-real-browser
CHROME_BIN=$(find /opt/chrome -name chrome -type f -path "*/chrome-linux64/*" 2>/dev/null | head -1)

if [ -n "$CHROME_BIN" ]; then
    export CHROME_PATH="$CHROME_BIN"
    echo "Found Chrome at: $CHROME_PATH"
else
    echo "Error: Chrome binary not found in /opt/chrome"
    exit 1
fi

exec node dist/index.js

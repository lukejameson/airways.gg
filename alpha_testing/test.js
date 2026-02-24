// test.js
const { connect } = require('puppeteer-real-browser');

async function fetchFlights(direction = 'dep') {
    const today = new Date().toISOString().split('T')[0];
    let capturedData = null;

    console.log('🚀 Launching real browser...');

    const { browser, page } = await connect({
        headless: false, // Must be false to solve Turnstile
        args: [],
        customConfig: {},
        turnstile: true,   // Auto-solve Turnstile ✨
        connectOption: {},
        disableXvfb: false,
        ignoreAllFlags: false,
    });

    try {
        // Intercept API response
        await page.setRequestInterception(false);

        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('/api/schedule')) {
                try {
                    const body = await response.text();
                    capturedData = body;
                    console.log(`✅ Captured! Status: ${response.status()} Size: ${body.length} bytes`);
                } catch (e) {
                    console.error('Error reading response:', e.message);
                }
            }
        });

        page.on('request', (request) => {
            if (request.url().includes('/api/schedule')) {
                console.log(`📡 API Request: ${request.url().substring(0, 120)}...`);
            }
        });

        console.log(`📄 Loading page...`);

        await page.goto(
            'https://www.aurigny.com/information/arrivals-departures',
            {
                waitUntil: 'networkidle2',
                timeout: 120000  // 2 min - Turnstile needs time
            }
        );

        console.log(`✓ Page loaded: ${await page.title()}`);

        // Wait for API call
        await new Promise(r => setTimeout(r, 8000));

        if (capturedData) {
            console.log('\n📦 DATA PREVIEW:');
            console.log('─'.repeat(60));
            console.log(capturedData.substring(0, 400));
            console.log('─'.repeat(60));

            const flightCount = (capturedData.match(/<Flight>/g) || []).length;
            console.log(`✈️  Flights found: ${flightCount}`);

            require('fs').writeFileSync('flights_raw.xml', capturedData);
            console.log('💾 Saved to flights_raw.xml');
        } else {
            console.log('❌ No data captured - taking screenshot');
            await page.screenshot({ path: 'debug.png', fullPage: true });
        }

    } catch (e) {
        console.error('❌ Error:', e.message);
        await page.screenshot({ path: 'error.png', fullPage: true });
    } finally {
        await browser.close();
        console.log('🔒 Browser closed');
    }

    return capturedData;
}

fetchFlights('dep')
    .then(data => {
        console.log(data ? '\n✅ SUCCESS' : '\n❌ FAILED');
        process.exit(data ? 0 : 1);
    })
    .catch(err => {
        console.error('Fatal:', err);
        process.exit(1);
    });

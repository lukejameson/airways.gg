# scraper.py
import asyncio
import json
from datetime import date
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async

async def fetch_flights(direction: str = 'dep', target_date: str = None):
    if not target_date:
        target_date = date.today().isoformat()

    captured_data = None

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
            ]
        )

        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent=(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/120.0.0.0 Safari/537.36'
            ),
            locale='en-GB',
            timezone_id='Europe/London',
        )

        page = await context.new_page()
        await stealth_async(page)

        # Intercept the API response
        async def on_response(response):
            nonlocal captured_data
            if '/api/schedule' in response.url:
                try:
                    captured_data = await response.text()
                    print(f"✅ Captured {len(captured_data)} bytes from {response.url}")
                except Exception as e:
                    print(f"Error reading response: {e}")

        page.on('response', on_response)

        # Load the main page - Cloudflare challenge solved automatically
        print(f"Loading page for {direction} on {target_date}...")
        await page.goto(
            'https://www.aurigny.com/information/arrivals-departures',
            wait_until='networkidle',
            timeout=60000
        )

        # Wait for API call to complete
        await asyncio.sleep(5)

        # If we need arrivals and only got departures, click the tab
        if direction == 'arr' and not captured_data:
            try:
                await page.click('text=Arrivals')
                await asyncio.sleep(4)
            except:
                print("Could not click arrivals tab")

        await browser.close()

    return captured_data

async def main():
    data = await fetch_flights('dep')
    if data:
        # Save raw XML
        with open('flights.xml', 'w') as f:
            f.write(data)
        print("Saved to flights.xml")
        print(f"Preview: {data[:300]}")
    else:
        print("No data captured")

asyncio.run(main())

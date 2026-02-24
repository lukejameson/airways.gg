import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(__dirname, '../../../.env') });

import { connect } from 'puppeteer-real-browser';

(async () => {
  const { browser, page } = await connect({
    headless: false, turnstile: true, disableXvfb: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  let responseCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (page as any).on('response', (r: any) => {
    responseCount++;
    const url: string = r.url();
    if (!url.match(/\.(js|css|png|woff)/) && !url.startsWith('data:'))
      console.log('response:', r.status(), url.substring(0, 80));
  });

  await (page as any).goto('https://www.aurigny.com/information/arrivals-departures', {
    waitUntil: 'domcontentloaded', timeout: 60000
  });
  
  await new Promise(r => setTimeout(r, 40000));
  console.log('Total responses:', responseCount);
  
  await browser.close();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });

import { loadEnv } from '@airways/common';
loadEnv({ serviceName: 'Position', startDir: __dirname, logPath: true });

import { pollPositions } from './poller';

async function main() {
  const intervalSecs = parseInt(process.env.POSITION_INTERVAL_LIVE_SECS ?? '300', 10);
  console.log('[Position] Aircraft position service starting...');
  console.log(`[Position] Poll interval: ${intervalSecs}s for live/implied-airborne flights`);
  console.log('[Position] Tracking: inbound (to GCI) and outbound (from GCI) — both directions');
  console.log('[Position] FR24 gate: status=Airborne|Taxiing OR actualDeparture is set (and not terminal)');
  console.log('[Position] Status back-write: Taxiing (ground speed >5kts), Airborne (alt >500ft or speed >100kts)');

  if (!process.env.FR24_API_TOKEN) {
    console.error('[Position] FR24_API_TOKEN is not set — position service will not run');
    console.error('[Position] Add FR24_API_TOKEN=<your_token> to .env');
    process.exit(1);
  }

  async function runPoll() {
    try {
      const nextPollIn = await pollPositions();
      console.log(`[Position] Scheduling next poll in ${Math.round(nextPollIn/1000)}s`);
      setTimeout(runPoll, nextPollIn);
    } catch (err) {
      console.error('[Position] Poll failed:', err);
      // Retry in 1 minute on error
      setTimeout(runPoll, 60 * 1000);
    }
  }

  // Start the polling loop
  runPoll();
}

main().catch(err => {
  console.error('[Position] Fatal error:', err);
  process.exit(1);
});

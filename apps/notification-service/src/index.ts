import { loadEnv } from '@airways/common';
loadEnv({ serviceName: 'Notify', startDir: __dirname, logPath: true });

import { dispatch } from './dispatcher';
import { sendAlert } from '@airways/telegram';

async function main() {
  const intervalMs = parseInt(process.env.NOTIFY_POLL_INTERVAL_MS ?? '15000', 10);
  console.log('[Notify] Notification service starting...');
  console.log(`[Notify] Poll interval: ${intervalMs}ms`);

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    console.error('[Notify] VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must all be set');
    await sendAlert('notification-service', 'critical', 'VAPID keys not configured — push notifications will not work');
    process.exit(1);
  }

  async function runPoll() {
    try {
      await dispatch();
    } catch (err) {
      console.error('[Notify] Dispatch failed:', err);
      sendAlert('notification-service', 'warning', 'Dispatch failed', err).catch(() => {});
    }
    setTimeout(runPoll, intervalMs);
  }

  runPoll();
}

main().catch(err => {
  console.error('[Notify] Fatal error:', err);
  sendAlert('notification-service', 'critical', 'Fatal error', err).finally(() => process.exit(1));
});

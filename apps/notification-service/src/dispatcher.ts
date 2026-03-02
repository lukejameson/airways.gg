import webpush from 'web-push';
import { getDb } from '@airways/database';
import { pushSubscriptions, notificationWatermark, flightStatusHistory } from '@airways/database/schema';
import { eq, gt, inArray, sql } from 'drizzle-orm';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function dispatch(): Promise<void> {
  const db = getDb();

  // 1. Get or initialise the watermark row
  const watermarkRows = await db.select().from(notificationWatermark).limit(1);
  let watermarkId: number;
  let watermarkRowId: number;

  if (watermarkRows.length === 0) {
    // First run: initialise to the current max id so we don't replay history
    const maxRow = await db
      .select({ maxId: sql<number>`coalesce(max(id), 0)` })
      .from(flightStatusHistory);
    const initialId = maxRow[0]?.maxId ?? 0;

    const inserted = await db
      .insert(notificationWatermark)
      .values({ lastProcessedId: initialId })
      .returning();
    watermarkId = inserted[0].lastProcessedId;
    watermarkRowId = inserted[0].id;
    console.log(`[Notify] Initialised watermark to ${watermarkId}`);
    return;
  } else {
    watermarkId = watermarkRows[0].lastProcessedId;
    watermarkRowId = watermarkRows[0].id;
  }

  // 2. Fetch up to 50 new status history rows
  const newRows = await db
    .select({
      id: flightStatusHistory.id,
      flightId: flightStatusHistory.flightId,
      flightCode: flightStatusHistory.flightCode,
      flightDate: flightStatusHistory.flightDate,
      statusMessage: flightStatusHistory.statusMessage,
    })
    .from(flightStatusHistory)
    .where(gt(flightStatusHistory.id, watermarkId))
    .orderBy(flightStatusHistory.id)
    .limit(50);

  if (newRows.length === 0) return;

  const maxProcessedId = newRows[newRows.length - 1].id;

  // 3. Group by flightId, keep the latest status per flight
  const latestByFlight = new Map<
    number,
    { flightId: number; flightCode: string; flightDate: string; statusMessage: string }
  >();
  for (const row of newRows) {
    if (row.flightId == null) continue;
    latestByFlight.set(row.flightId, {
      flightId: row.flightId,
      flightCode: row.flightCode,
      flightDate: row.flightDate,
      statusMessage: row.statusMessage,
    });
  }

  if (latestByFlight.size === 0) {
    await advanceWatermark(db, watermarkRowId, maxProcessedId);
    return;
  }

  // 4. Look up subscriptions for affected flights
  const flightIds = Array.from(latestByFlight.keys());
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.flightId, flightIds));

  // 5. Send notifications, collect endpoints to delete on 410/404
  const endpointsToDelete: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      const flightInfo = latestByFlight.get(sub.flightId);
      if (!flightInfo) return;

      const payload = JSON.stringify({
        title: `${flightInfo.flightCode} — Status Update`,
        body: flightInfo.statusMessage,
        url: `/flights/${sub.flightId}`,
        flightId: sub.flightId,
      });

      try {
        await webpush.sendNotification(
          sub.subscription as webpush.PushSubscription,
          payload,
        );
        // Update lastNotifiedAt
        await db
          .update(pushSubscriptions)
          .set({ lastNotifiedAt: new Date() })
          .where(eq(pushSubscriptions.id, sub.id));
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          // Subscription is gone — remove all flights for this endpoint
          endpointsToDelete.push(sub.endpoint);
        } else {
          console.error(`[Notify] Failed to send to endpoint (flight ${sub.flightId}):`, (err as Error).message);
        }
      }
    }),
  );

  // 6. Clean up dead subscriptions
  if (endpointsToDelete.length > 0) {
    const unique = [...new Set(endpointsToDelete)];
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.endpoint, unique));
    console.log(`[Notify] Removed ${unique.length} expired endpoint(s)`);
  }

  // 7. Advance watermark
  await advanceWatermark(db, watermarkRowId, maxProcessedId);
  console.log(`[Notify] Processed up to id=${maxProcessedId}, sent to ${subs.length} subscription(s)`);
}

async function advanceWatermark(
  db: ReturnType<typeof getDb>,
  rowId: number,
  newId: number,
): Promise<void> {
  await db
    .update(notificationWatermark)
    .set({ lastProcessedId: newId, updatedAt: new Date() })
    .where(eq(notificationWatermark.id, rowId));
}

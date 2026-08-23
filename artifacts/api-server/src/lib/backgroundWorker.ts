/**
 * Background sync worker.
 * Started exactly once after the API server begins listening.
 * Every 15 seconds it finds all running giveaways and syncs them using the
 * same lock-protected entry point as manual sync.
 *
 * Design:
 *  - setInterval is unref'd so it does not prevent process exit.
 *  - One tick failure does not stop later runs.
 *  - Only safe IDs and error class names are logged — no tokens, raw errors,
 *    or sensitive data.
 */
import { db } from "@workspace/db";
import { giveawaysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import {
  syncGiveawayWithLock,
  SyncLockConflictError,
  MetaAuthError,
  MetaPermissionError,
  MetaGraphError,
  MetaPageCapError,
} from "./metaService";

const WORKER_INTERVAL_MS = 15 * 1000; // 15 seconds

async function runSyncTick(): Promise<void> {
  // Find all running giveaways
  let runningGiveaways: Array<typeof giveawaysTable.$inferSelect>;
  try {
    runningGiveaways = await db
      .select()
      .from(giveawaysTable)
      .where(eq(giveawaysTable.status, "running"));
  } catch (err) {
    logger.error({ errClass: (err as Error)?.name ?? "Error" }, "Background worker: failed to query running giveaways");
    return;
  }

  for (const giveaway of runningGiveaways) {
    try {
      await syncGiveawayWithLock(giveaway);
      logger.info({ giveawayId: giveaway.id }, "Background worker: sync complete");
    } catch (err) {
      const errClass =
        err instanceof SyncLockConflictError ? "SyncLockConflictError"
        : err instanceof MetaPageCapError ? "MetaPageCapError"
        : err instanceof MetaAuthError ? "MetaAuthError"
        : err instanceof MetaPermissionError ? "MetaPermissionError"
        : err instanceof MetaGraphError ? "MetaGraphError"
        : (err as Error)?.name ?? "Error";

      if (err instanceof SyncLockConflictError) {
        // Not an error — another sync (manual) is in progress; skip silently
        logger.debug(
          { giveawayId: giveaway.id, errClass },
          "Background worker: skipped — sync lock held",
        );
      } else {
        logger.warn(
          { giveawayId: giveaway.id, errClass },
          "Background worker: sync failed",
        );
      }
      // Continue to next giveaway — one failure must not stop later runs
    }
  }
}

/**
 * Start the background worker. Call this once after the server begins
 * listening. The interval is unref'd so it won't prevent clean shutdown.
 */
export function startBackgroundWorker(): void {
  logger.info("Background worker started");
  const interval = setInterval(() => {
    runSyncTick().catch((err) => {
      // Top-level safety net — should never fire since runSyncTick catches internally
      logger.error({ errClass: (err as Error)?.name ?? "Error" }, "Background worker: unhandled tick error");
    });
  }, WORKER_INTERVAL_MS);

  // unref so the interval does not prevent graceful process exit
  interval.unref();
}

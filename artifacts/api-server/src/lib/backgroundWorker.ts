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
const WEBHOOK_EVENT_TTL_MS = 10 * 60 * 1000; // Meta may retry deliveries

type Giveaway = typeof giveawaysTable.$inferSelect;

/**
 * Recently accepted Meta delivery IDs. This is an optimisation only: database
 * replacement syncs remain idempotent across restarts and multiple instances.
 */
const recentWebhookEvents = new Map<string, number>();
const webhookSyncStates = new Map<string, { rerunRequested: boolean }>();

function pruneRecentWebhookEvents(now: number): void {
  for (const [eventKey, expiresAt] of recentWebhookEvents) {
    if (expiresAt <= now) recentWebhookEvents.delete(eventKey);
  }
}

function logWebhookSyncFailure(giveawayId: string, err: unknown): void {
  const errClass =
    err instanceof SyncLockConflictError ? "SyncLockConflictError"
    : err instanceof MetaPageCapError ? "MetaPageCapError"
    : err instanceof MetaAuthError ? "MetaAuthError"
    : err instanceof MetaPermissionError ? "MetaPermissionError"
    : err instanceof MetaGraphError ? "MetaGraphError"
    : (err as Error)?.name ?? "Error";

  if (err instanceof SyncLockConflictError) {
    logger.debug(
      { giveawayId, errClass },
      "Meta webhook: skipped — sync lock held",
    );
    return;
  }
  logger.warn({ giveawayId, errClass }, "Meta webhook: sync failed");
}

async function runWebhookSync(
  giveaway: Giveaway,
  state: { rerunRequested: boolean },
): Promise<void> {
  try {
    do {
      state.rerunRequested = false;
      try {
        await syncGiveawayWithLock(giveaway);
        logger.info({ giveawayId: giveaway.id }, "Meta webhook: sync complete");
      } catch (err) {
        logWebhookSyncFailure(giveaway.id, err);
      }
      // Events received while syncing request one coalesced follow-up pull,
      // preventing overlap without losing a comment that arrived mid-sync.
    } while (state.rerunRequested);
  } finally {
    webhookSyncStates.delete(giveaway.id);
  }
}

/**
 * Schedule a lock-protected pull after a verified Meta comment delivery.
 * Returns false for duplicate deliveries; valid but irrelevant events are
 * filtered before this function is called.
 */
export function queueWebhookSync(giveaway: Giveaway, eventKey: string): boolean {
  const now = Date.now();
  pruneRecentWebhookEvents(now);
  if (recentWebhookEvents.has(eventKey)) return false;
  recentWebhookEvents.set(eventKey, now + WEBHOOK_EVENT_TTL_MS);

  const existing = webhookSyncStates.get(giveaway.id);
  if (existing) {
    existing.rerunRequested = true;
    return true;
  }

  const state = { rerunRequested: false };
  webhookSyncStates.set(giveaway.id, state);
  void runWebhookSync(giveaway, state);
  return true;
}

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

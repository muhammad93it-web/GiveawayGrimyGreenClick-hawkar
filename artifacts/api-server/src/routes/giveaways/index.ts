import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { giveawaysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireCsrf, loadSession } from "../../lib/session";
import {
  getCurrentGiveaway,
  getPublicCurrentGiveaway,
  getParticipantsForGiveaway,
  buildGiveawayProjection,
  validateAssetOwnership,
  validatePostOwnership,
  upsertGiveaway,
  syncGiveawayWithLock,
  SyncLockConflictError,
  GIVEAWAY_STATUSES,
  MetaAuthError,
  MetaPermissionError,
  MetaGraphError,
  MetaPageCapError,
} from "../../lib/metaService";
import {
  GetCurrentGiveawayResponse,
  PutCurrentGiveawayResponse,
  PatchGiveawayStatusResponse,
  SyncGiveawayResponse,
  PutCurrentGiveawayBody,
  PatchGiveawayStatusBody,
} from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router: IRouter = Router();

/**
 * GET /giveaways/current
 * Public endpoint — returns the most recently updated giveaway projection.
 * No authentication required.
 */
router.get("/giveaways/current", async (_req, res): Promise<void> => {
  const giveaway = await getPublicCurrentGiveaway();
  const participants = giveaway
    ? await getParticipantsForGiveaway(giveaway.id)
    : [];
  const projection = buildGiveawayProjection(giveaway, participants);
  const payload = GetCurrentGiveawayResponse.parse(projection);
  res.json(payload);
});

/**
 * PUT /giveaways/current
 * Auth + CSRF required. Select post and configure prize.
 * Validates that the selected post belongs to the specified asset server-side.
 * Persists the post message. Clears stale comments/aggregates transactionally.
 */
router.put(
  "/giveaways/current",
  loadSession,
  requireAuth,
  requireCsrf,
  async (req, res): Promise<void> => {
    const parsed = PutCurrentGiveawayBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { assetId, postId, prizeCount, prizeTitle } = parsed.data;
    const metaUserId = req.session!.metaUserId;

    // Verify the asset is owned by this connection
    const owned = await validateAssetOwnership(metaUserId, assetId);
    if (!owned) {
      res.status(403).json({ error: "Asset not owned by this connection" });
      return;
    }

    // Verify the post belongs to this asset by fetching the asset's posts
    // server-side.  This prevents a user from associating a giveaway with
    // a post on an asset they do not own.
    let postInfo: Awaited<ReturnType<typeof validatePostOwnership>>;
    try {
      postInfo = await validatePostOwnership(metaUserId, assetId, postId);
    } catch (err) {
      if (err instanceof MetaAuthError) {
        res.status(401).json({ error: (err as Error).message });
        return;
      }
      if (err instanceof MetaPermissionError || err instanceof MetaGraphError) {
        req.log.warn({ errName: (err as Error).name }, "Meta error validating post");
        res.status(502).json({ error: "Failed to verify post with Meta" });
        return;
      }
      req.log.error({ err }, "Failed to validate post ownership");
      res.status(500).json({ error: "Failed to validate post" });
      return;
    }

    if (!postInfo) {
      res
        .status(403)
        .json({ error: "Post not found on this asset" });
      return;
    }

    try {
      await upsertGiveaway(metaUserId, {
        id: randomUUID(),
        assetId,
        postId,
        postPlatform: postInfo.platform,
        postMessage: postInfo.message,
        prizeCount,
        prizeTitle,
      });
    } catch (err) {
      if (err instanceof SyncLockConflictError) {
        res.status(409).json({
          error:
            "نوێکردنەوەی کۆمێنتەکان بەردەوامە؛ پاش تەواوبوونی دووبارە هەوڵ بدەرەوە",
        });
        return;
      }
      throw err;
    }

    const giveaway = await getCurrentGiveaway(metaUserId);
    const participants = giveaway
      ? await getParticipantsForGiveaway(giveaway.id)
      : [];
    const projection = buildGiveawayProjection(giveaway, participants);
    const payload = PutCurrentGiveawayResponse.parse(projection);
    res.json(payload);
  },
);

/**
 * PATCH /giveaways/current/status
 * Auth + CSRF required. Transition giveaway status.
 */
router.patch(
  "/giveaways/current/status",
  loadSession,
  requireAuth,
  requireCsrf,
  async (req, res): Promise<void> => {
    const parsed = PatchGiveawayStatusBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { status } = parsed.data;
    const metaUserId = req.session!.metaUserId;

    const giveaway = await getCurrentGiveaway(metaUserId);
    if (!giveaway) {
      res.status(400).json({ error: "No active giveaway" });
      return;
    }

    // status is validated by Zod schema (enum); this check is a belt-and-suspenders
    if (
      !GIVEAWAY_STATUSES.includes(status as (typeof GIVEAWAY_STATUSES)[number])
    ) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    if (status === "completed") {
      try {
        await syncGiveawayWithLock(giveaway, { completeAfterSync: true });
      } catch (err) {
        const safeMessage =
          err instanceof SyncLockConflictError
            ? "نوێکردنەوەیەکی دیکە بەردەوامە؛ چەند چرکەیەک چاوەڕێ بکە"
            : err instanceof MetaPageCapError
              ? err.safeMessage
              : err instanceof MetaAuthError ||
                  err instanceof MetaPermissionError
                ? err.message
                : "نوێکردنەوەی کۆتایی سەرکەوتوو نەبوو؛ خەڵاتەکە دانەخرا";

        req.log.warn(
          { errClass: (err as Error)?.name ?? "Error" },
          "Final giveaway sync failed",
        );
        res
          .status(err instanceof SyncLockConflictError ? 409 : 502)
          .json({ error: safeMessage });
        return;
      }
    } else {
      await db
        .update(giveawaysTable)
        .set({ status, updatedAt: new Date() })
        .where(eq(giveawaysTable.id, giveaway.id));
    }

    const updated = await getCurrentGiveaway(metaUserId);
    const participants = updated
      ? await getParticipantsForGiveaway(updated.id)
      : [];
    const projection = buildGiveawayProjection(updated, participants);
    const payload = PatchGiveawayStatusResponse.parse(projection);
    res.json(payload);
  },
);

/**
 * POST /giveaways/current/sync
 * Auth + CSRF required. Pull comments from Meta and update projection.
 */
router.post(
  "/giveaways/current/sync",
  loadSession,
  requireAuth,
  requireCsrf,
  async (req, res): Promise<void> => {
    const metaUserId = req.session!.metaUserId;

    const giveaway = await getCurrentGiveaway(metaUserId);
    if (!giveaway) {
      res.status(400).json({ error: "No active giveaway" });
      return;
    }
    if (!giveaway.postId) {
      res.status(400).json({ error: "No post selected for this giveaway" });
      return;
    }
    if (giveaway.status === "completed") {
      res.status(409).json({
        error: "خەڵاتەکە تەواو کراوە؛ پێش نوێکردنەوە دووبارە دەستی پێبکەرەوە",
      });
      return;
    }

    try {
      await syncGiveawayWithLock(giveaway);
    } catch (err) {
      const safeMessage =
        err instanceof SyncLockConflictError
          ? "نوێکردنەوەیەکی دیکە بەردەوامە؛ چەند چرکەیەک چاوەڕێ بکە"
          : err instanceof MetaPageCapError
            ? err.safeMessage
            : err instanceof MetaAuthError || err instanceof MetaPermissionError
              ? err.message
              : "نوێکردنەوە سەرکەوتوو نەبوو؛ داتای پێشوو پارێزرا";

      req.log.warn(
        { errClass: (err as Error)?.name ?? "Error" },
        "Giveaway comment sync failed",
      );

      if (err instanceof SyncLockConflictError) {
        res.status(409).json({ error: safeMessage });
        return;
      }

      if (err instanceof MetaAuthError) {
        res.status(401).json({ error: safeMessage });
        return;
      }
      if (
        err instanceof MetaPermissionError ||
        err instanceof MetaGraphError ||
        err instanceof MetaPageCapError
      ) {
        res.status(502).json({ error: safeMessage });
        return;
      }
      res.status(500).json({ error: safeMessage });
      return;
    }

    const updated = await getCurrentGiveaway(metaUserId);
    const participants = updated
      ? await getParticipantsForGiveaway(updated.id)
      : [];
    const projection = buildGiveawayProjection(updated, participants);
    const payload = SyncGiveawayResponse.parse(projection);
    res.json(payload);
  },
);

export default router;

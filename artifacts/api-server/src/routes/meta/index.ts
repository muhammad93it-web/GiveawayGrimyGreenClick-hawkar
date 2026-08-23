import { Router, type IRouter, type Request } from "express";
import { createHash, createHmac } from "crypto";
import { db } from "@workspace/db";
import { metaConnectionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  requireAuth,
  requireCsrf,
  loadSession,
  setCsrfCookie,
  destroySession,
} from "../../lib/session";
import {
  getMetaConfig,
  getMetaWebhookVerifyToken,
  getCallbackUrl,
  getFrontendBase,
  buildOAuthUrl,
  handleOAuthCallback,
  getAssetsForUser,
  listPostsForAsset,
  validateAssetOwnership,
  disconnectMeta,
  MetaAuthError,
  MetaPermissionError,
  MetaGraphError,
  MetaPageNotAllowedError,
  MetaConnectionConflictError,
  getRunningFacebookGiveawayForWebhook,
  getMetaTokenHealth,
  type MetaTokenHealth,
} from "../../lib/metaService";
import {
  GetMetaStatusResponse,
  ListMetaAssetsResponse,
  ListMetaAssetPostsResponse,
  ListMetaAssetPostsParams,
  MetaDisconnectResponse,
} from "@workspace/api-zod";
import { safeEqual } from "../../lib/crypto";
import { queueWebhookSync } from "../../lib/backgroundWorker";

/**
 * Cookie name for the short-lived OAuth state.
 * HttpOnly, SameSite=Lax, secure in production, expires with the state TTL.
 */
const OAUTH_STATE_COOKIE = "oauth_state";
/** 10 minutes in seconds — matches OAUTH_STATE_TTL_MS in metaService */
const OAUTH_STATE_COOKIE_MAX_AGE = 10 * 60;

const router: IRouter = Router();

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getQueryValue(req: Request, name: string): string | null {
  const value = req.query[name];
  return typeof value === "string" ? value : null;
}

function hasValidMetaSignature(req: Request, appSecret: string): boolean {
  const signature = req.get("x-hub-signature-256");
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  if (!Buffer.isBuffer(req.body)) return false;

  const expected = `sha256=${createHmac("sha256", appSecret)
    .update(req.body)
    .digest("hex")}`;
  return safeEqual(signature, expected);
}

/**
 * Extract only Page feed notifications for newly added top-level comments.
 * All shape checks are defensive because even a valid Meta event may refer to
 * unrelated Page activity.
 */
function getNewCommentEvents(
  payload: unknown,
  allowedPageId: string,
): Array<{ pageId: string; postId: string; eventKey: string }> {
  if (!isRecord(payload) || payload.object !== "page" || !Array.isArray(payload.entry)) {
    return [];
  }

  const events: Array<{ pageId: string; postId: string; eventKey: string }> = [];
  for (const entry of payload.entry) {
    if (!isRecord(entry) || entry.id !== allowedPageId || !Array.isArray(entry.changes)) {
      continue;
    }

    for (const change of entry.changes) {
      if (!isRecord(change) || change.field !== "feed" || !isRecord(change.value)) {
        continue;
      }
      const value = change.value;
      if (
        value.item !== "comment" ||
        value.verb !== "add" ||
        typeof value.post_id !== "string" ||
        typeof value.comment_id !== "string"
      ) {
        continue;
      }
      events.push({
        pageId: allowedPageId,
        postId: value.post_id,
        // A comment ID is Meta's stable delivery identity for new-comment feed events.
        eventKey: `page-comment:${allowedPageId}:${value.post_id}:${value.comment_id}`,
      });
    }
  }
  return events;
}

/**
 * GET /meta/webhook
 * Meta callback handshake. The verify token is never echoed or logged.
 */
router.get("/meta/webhook", (req, res): void => {
  const verifyToken = getMetaWebhookVerifyToken();
  if (!verifyToken) {
    req.log.warn("Meta webhook verify token is not configured");
    res.sendStatus(503);
    return;
  }

  const mode = getQueryValue(req, "hub.mode");
  const suppliedToken = getQueryValue(req, "hub.verify_token");
  const challenge = getQueryValue(req, "hub.challenge");
  if (
    mode !== "subscribe" ||
    !suppliedToken ||
    !safeEqual(suppliedToken, verifyToken) ||
    !challenge
  ) {
    req.log.warn({ errorKind: "webhook_challenge_rejected" }, "Meta webhook challenge rejected");
    res.sendStatus(403);
    return;
  }

  res.type("text/plain").status(200).send(challenge);
});

/**
 * POST /meta/webhook
 * Verifies Meta's raw-body HMAC, then schedules a lock-protected comment pull.
 * The acknowledgement never waits on Meta Graph pagination.
 */
router.post("/meta/webhook", async (req, res): Promise<void> => {
  const config = getMetaConfig();
  if (!config) {
    req.log.warn("Meta webhook received while Meta configuration is unavailable");
    res.sendStatus(503);
    return;
  }
  if (!hasValidMetaSignature(req, config.appSecret)) {
    req.log.warn({ errorKind: "webhook_signature_rejected" }, "Meta webhook signature rejected");
    res.sendStatus(401);
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(req.body.toString("utf8")) as unknown;
  } catch {
    req.log.warn({ errorKind: "webhook_invalid_json" }, "Meta webhook body was not valid JSON");
    res.sendStatus(400);
    return;
  }

  const events = getNewCommentEvents(payload, config.allowedPageId);
  if (events.length > 0) {
    // One bounded lookup per delivery, regardless of how many changes Meta
    // batches into the payload.
    const giveaway = await getRunningFacebookGiveawayForWebhook(
      config.allowedPageId,
    );
    if (giveaway?.postId) {
      const eventKeys = events
        .filter((event) => event.postId === giveaway.postId)
        .map((event) => event.eventKey);
      if (eventKeys.length > 0) {
        const batchKey = createHash("sha256")
          .update([...new Set(eventKeys)].sort().join("\n"))
          .digest("hex");
        queueWebhookSync(giveaway, `page-comment-batch:${batchKey}`);
      }
    }
  }

  // Always acknowledge a valid signed delivery, including irrelevant events,
  // so Meta does not retry activity that cannot affect this giveaway.
  res.sendStatus(200);
});

/**
 * GET /meta/status
 * Returns Meta integration configuration status and sets CSRF cookie.
 */
router.get(
  "/meta/status",
  loadSession,
  async (req, res): Promise<void> => {
    const config = getMetaConfig();
    const callbackUrl = getCallbackUrl(req);
    let adminName: string | null = null;
    let connected = false;
    let tokenHealth: MetaTokenHealth = {
      status: "unknown",
      expiresAt: null as string | null,
      checkedAt: null as string | null,
    };

    if (req.session) {
      const [conn] = await db
        .select()
        .from(metaConnectionsTable)
        .where(eq(metaConnectionsTable.metaUserId, req.session.metaUserId));
      if (conn) {
        connected = true;
        adminName = conn.adminName;
        tokenHealth = await getMetaTokenHealth(req.session.metaUserId);
      }
    }

    // Set CSRF token cookie so the client can read it and attach it to mutations
    const csrfToken = setCsrfCookie(res);

    const payload = GetMetaStatusResponse.parse({
      configured: config !== null,
      connected,
      adminName,
      callbackUrl,
      csrfToken,
      tokenStatus: tokenHealth.status,
      tokenExpiresAt: tokenHealth.expiresAt,
      tokenCheckedAt: tokenHealth.checkedAt,
    });
    res.json(payload);
  },
);

/**
 * GET /meta/login
 * Initiates Meta OAuth flow. Returns 503 if credentials are not configured.
 * Sets a short-lived HttpOnly SameSite=Lax cookie containing the raw state
 * so the callback can verify it came from this browser session.
 */
router.get("/meta/login", async (req, res): Promise<void> => {
  const config = getMetaConfig();
  if (!config) {
    res.status(503).json({ error: "Meta credentials are not configured" });
    return;
  }
  const callbackUrl = getCallbackUrl(req);
  try {
    const { url: oauthUrl, state } = await buildOAuthUrl(config, callbackUrl);

    // Bind state to this browser session via a short-lived HttpOnly cookie.
    // Do NOT log state.
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: OAUTH_STATE_COOKIE_MAX_AGE * 1000,
      path: "/",
    });

    res.redirect(302, oauthUrl);
  } catch (err) {
    req.log.error({ err }, "Failed to build OAuth URL");
    res.status(500).json({ error: "Failed to initiate Meta login" });
  }
});

/**
 * GET /meta/callback
 * Handles the OAuth callback from Meta.
 * Validates state cookie (constant-time), clears cookie on both success/failure,
 * then atomically consumes the state hash from DB.
 * Redirects to the frontend with ?meta=connected or ?meta=error.
 * The redirect destination is derived server-side from APP_ORIGIN or the
 * request host — it is never echoed back from a user-supplied query parameter.
 */
router.get("/meta/callback", async (req, res): Promise<void> => {
  const config = getMetaConfig();

  // Safe redirect base — never taken from query params
  const frontendBase = getFrontendBase(req);

  // Always clear the OAuth state cookie regardless of outcome
  const clearStateCookie = () => {
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
  };

  // Handle an OAuth error response from Meta
  if (req.query.error) {
    req.log.warn({ errorKind: "meta_oauth_error" }, "Meta OAuth error callback");
    clearStateCookie();
    res.redirect(302, `${frontendBase}/?meta=error`);
    return;
  }

  const code =
    typeof req.query.code === "string" ? req.query.code : null;
  const state =
    typeof req.query.state === "string" ? req.query.state : null;

  if (!code || !state) {
    clearStateCookie();
    res.redirect(302, `${frontendBase}/?meta=error`);
    return;
  }

  if (!config) {
    clearStateCookie();
    res.redirect(302, `${frontendBase}/?meta=error`);
    return;
  }

  // Constant-time compare state query param against the cookie value.
  // Do NOT log state, code, or cookie values.
  const cookieState: string | undefined =
    typeof req.cookies?.[OAUTH_STATE_COOKIE] === "string"
      ? (req.cookies[OAUTH_STATE_COOKIE] as string)
      : undefined;

  if (!cookieState || !safeEqual(state, cookieState)) {
    req.log.warn({ errorKind: "state_mismatch" }, "OAuth state cookie mismatch");
    clearStateCookie();
    res.redirect(302, `${frontendBase}/?meta=error`);
    return;
  }

  // Clear cookie before proceeding — ensure it's cleared even on success
  clearStateCookie();

  const callbackUrl = getCallbackUrl(req);

  try {
    // Pass cookieState to handleOAuthCallback so it re-checks internally too
    await handleOAuthCallback(code, state, cookieState, callbackUrl, config, res);
    res.redirect(302, `${frontendBase}/?meta=connected`);
  } catch (err) {
    if (err instanceof MetaPageNotAllowedError) {
      req.log.warn({ errorKind: "page_not_allowed" }, "OAuth: required page not in user's accounts");
    } else if (err instanceof MetaConnectionConflictError) {
      req.log.warn({ errorKind: "connection_conflict" }, "OAuth: singleton connection held by different user");
    } else if (err instanceof MetaAuthError || err instanceof MetaPermissionError) {
      req.log.warn({ errName: (err as Error).name }, "Meta OAuth failed");
    } else {
      req.log.error({ err }, "Meta OAuth callback error");
    }
    res.redirect(302, `${frontendBase}/?meta=error`);
  }
});

/**
 * POST /meta/disconnect
 * Disconnects Meta integration. Requires auth and CSRF.
 */
router.post(
  "/meta/disconnect",
  loadSession,
  requireAuth,
  requireCsrf,
  async (req, res): Promise<void> => {
    const metaUserId = req.session!.metaUserId;
    try {
      await disconnectMeta(metaUserId);
      await destroySession(req, res);
      const payload = MetaDisconnectResponse.parse({ ok: true });
      res.json(payload);
    } catch (err) {
      req.log.error({ err }, "Failed to disconnect Meta");
      res.status(500).json({ error: "Failed to disconnect" });
    }
  },
);

/**
 * GET /meta/assets
 * Lists owned Facebook Pages and Instagram accounts.
 */
router.get(
  "/meta/assets",
  loadSession,
  requireAuth,
  async (req, res): Promise<void> => {
    const metaUserId = req.session!.metaUserId;
    try {
      const assets = await getAssetsForUser(metaUserId);
      const payload = ListMetaAssetsResponse.parse(assets);
      res.json(payload);
    } catch (err) {
      req.log.error({ err }, "Failed to list Meta assets");
      res.status(500).json({ error: "Failed to list assets" });
    }
  },
);

/**
 * GET /meta/assets/:assetId/posts
 * Lists recent posts for a specific owned asset.
 */
router.get(
  "/meta/assets/:assetId/posts",
  loadSession,
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ListMetaAssetPostsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const { assetId } = params.data;
    const metaUserId = req.session!.metaUserId;

    const owned = await validateAssetOwnership(metaUserId, assetId);
    if (!owned) {
      res.status(403).json({ error: "Asset not owned by this connection" });
      return;
    }

    try {
      const posts = await listPostsForAsset(metaUserId, assetId);
      const payload = ListMetaAssetPostsResponse.parse(posts);
      res.json(payload);
    } catch (err) {
      if (err instanceof MetaAuthError) {
        res.status(401).json({ error: err.message });
        return;
      }
      if (err instanceof MetaPermissionError) {
        res.status(403).json({ error: err.message });
        return;
      }
      if (err instanceof MetaGraphError) {
        req.log.warn(
          { errName: (err as Error).name },
          "Meta Graph error fetching posts",
        );
        res.status(502).json({ error: "Failed to fetch posts from Meta" });
        return;
      }
      req.log.error({ err }, "Failed to list posts");
      res.status(500).json({ error: "Failed to list posts" });
    }
  },
);

export default router;

import { Router, type IRouter } from "express";
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
} from "../../lib/metaService";
import {
  GetMetaStatusResponse,
  ListMetaAssetsResponse,
  ListMetaAssetPostsResponse,
  ListMetaAssetPostsParams,
  MetaDisconnectResponse,
} from "@workspace/api-zod";
import { safeEqual } from "../../lib/crypto";

/**
 * Cookie name for the short-lived OAuth state.
 * HttpOnly, SameSite=Lax, secure in production, expires with the state TTL.
 */
const OAUTH_STATE_COOKIE = "oauth_state";
/** 10 minutes in seconds — matches OAUTH_STATE_TTL_MS in metaService */
const OAUTH_STATE_COOKIE_MAX_AGE = 10 * 60;

const router: IRouter = Router();

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

    if (req.session) {
      const [conn] = await db
        .select()
        .from(metaConnectionsTable)
        .where(eq(metaConnectionsTable.metaUserId, req.session.metaUserId));
      if (conn) {
        connected = true;
        adminName = conn.adminName;
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

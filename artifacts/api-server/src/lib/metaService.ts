/**
 * Meta integration business logic.
 * Handles OAuth, connection management, asset listing, and comment syncing.
 */
import { db } from "@workspace/db";
import {
  oauthStatesTable,
  metaConnectionsTable,
  giveawaysTable,
  importedCommentsTable,
  participantAggregatesTable,
  GIVEAWAY_STATUSES,
} from "@workspace/db";
import { eq, lt, gt, and, or, isNull } from "drizzle-orm";
import { createHmac } from "crypto";
import { encrypt, decrypt, sha256Hex, generateToken } from "./crypto";
import {
  exchangeCodeForToken,
  getLongLivedToken,
  fetchMeAndAccounts,
  fetchInstagramAccount,
  fetchPagePosts,
  fetchInstagramMedia,
  fetchAllFacebookComments,
  fetchAllInstagramComments,
  validateUserAccessToken,
  validateAssetAccessToken,
  ANONYMOUS_DISPLAY_NAME,
  MetaAuthError,
  MetaPermissionError,
  MetaGraphError,
  MetaPageCapError,
  type GraphPage,
} from "./metaGraph";
import { createSession } from "./session";
import type { Response } from "express";
import { randomUUID } from "crypto";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TOKEN_HEALTH_CACHE_MS = 10 * 60 * 1000; // 10 minutes
const TOKEN_EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Stale sync lock expires after this many milliseconds */
// A capped sync can make up to 50 sequential Graph requests. Each request has
// a 15-second timeout, so keep the lease longer than that worst-case window.
export const SYNC_LOCK_TTL_MS = 15 * 60 * 1000;

export interface MetaConfig {
  appId: string;
  appSecret: string;
  allowedPageId: string;
}

export const META_TOKEN_STATUSES = [
  "active",
  "expiring",
  "expired",
  "reconnect_required",
  "unknown",
] as const;

export type MetaTokenStatus = (typeof META_TOKEN_STATUSES)[number];

export interface MetaTokenHealth {
  status: MetaTokenStatus;
  expiresAt: string | null;
  checkedAt: string | null;
}

function isMetaTokenStatus(value: string): value is MetaTokenStatus {
  return META_TOKEN_STATUSES.includes(value as MetaTokenStatus);
}

function tokenStatusFromConnection(
  connection: typeof metaConnectionsTable.$inferSelect,
): MetaTokenHealth {
  return {
    status: isMetaTokenStatus(connection.tokenStatus)
      ? connection.tokenStatus
      : "unknown",
    expiresAt: connection.tokenExpiresAt?.toISOString() ?? null,
    checkedAt: connection.tokenCheckedAt?.toISOString() ?? null,
  };
}

function getTokenHealthStatus(
  isValid: boolean,
  expiresAt: Date | null,
  now: Date,
): MetaTokenStatus {
  if (!isValid) {
    return expiresAt && expiresAt.getTime() <= now.getTime()
      ? "expired"
      : "reconnect_required";
  }
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return "expired";
  if (
    expiresAt &&
    expiresAt.getTime() - now.getTime() <= TOKEN_EXPIRY_WARNING_MS
  ) {
    return "expiring";
  }
  return "active";
}

/**
 * Reads Meta's token inspector at a bounded interval and persists only
 * non-sensitive health metadata. A temporary Graph failure does not overwrite
 * the last known health, so it cannot falsely tell an administrator to reconnect.
 */
export async function getMetaTokenHealth(
  metaUserId: string,
): Promise<MetaTokenHealth> {
  const [connection] = await db
    .select()
    .from(metaConnectionsTable)
    .where(eq(metaConnectionsTable.metaUserId, metaUserId));
  if (!connection) {
    return { status: "unknown", expiresAt: null, checkedAt: null };
  }

  const now = new Date();
  if (
    connection.tokenCheckedAt &&
    now.getTime() - connection.tokenCheckedAt.getTime() <
      TOKEN_HEALTH_CACHE_MS
  ) {
    return tokenStatusFromConnection(connection);
  }

  const config = getMetaConfig();
  if (!config) return tokenStatusFromConnection(connection);

  let userToken: string;
  let pageTokens: Array<{ id: string; token: string }>;
  try {
    userToken = decrypt(
      connection.encryptedLongLivedToken ?? connection.encryptedUserToken,
    );
    const pageTokenEntries = connection.encryptedPageTokensJson
      ? (JSON.parse(decrypt(connection.encryptedPageTokensJson)) as Array<{
          id: string;
          token: string;
        }>)
      : [];
    const seenTokens = new Set<string>();
    pageTokens = [];
    for (const entry of pageTokenEntries) {
      const token = decrypt(entry.token);
      if (seenTokens.has(token)) continue;
      seenTokens.add(token);
      pageTokens.push({ id: entry.id, token });
    }
  } catch {
    return tokenStatusFromConnection(connection);
  }

  let status: MetaTokenStatus;
  try {
    await Promise.all([
      validateUserAccessToken(userToken),
      ...pageTokens.map((entry) =>
        validateAssetAccessToken(entry.id, entry.token),
      ),
    ]);
    status = getTokenHealthStatus(true, connection.tokenExpiresAt, now);
  } catch (err) {
    if (err instanceof MetaAuthError || err instanceof MetaPermissionError) {
      status = getTokenHealthStatus(false, connection.tokenExpiresAt, now);
    } else {
      // Temporary Graph/network failures keep the last known health.
      return tokenStatusFromConnection(connection);
    }
  }

  try {
    const [updated] = await db
      .update(metaConnectionsTable)
      .set({
        tokenStatus: status,
        tokenCheckedAt: now,
      })
      .where(
        and(
          eq(metaConnectionsTable.metaUserId, metaUserId),
          eq(
            metaConnectionsTable.authorizationVersion,
            connection.authorizationVersion,
          ),
        ),
      )
      .returning();
    if (updated) return tokenStatusFromConnection(updated);

    // OAuth rotated credentials while the old inspection was in flight.
    // Return the newly authorized connection's health instead of stale data.
    const [current] = await db
      .select()
      .from(metaConnectionsTable)
      .where(eq(metaConnectionsTable.metaUserId, metaUserId))
      .limit(1);
    return current
      ? tokenStatusFromConnection(current)
      : { status: "unknown", expiresAt: null, checkedAt: null };
  } catch {
    // A database failure should not expose credentials or Graph details.
    return tokenStatusFromConnection(connection);
  }
}

/**
 * Records a failed authorization observed during a live sync. This is not used
 * for ordinary Graph/network failures, which should remain retryable.
 */
async function recordMetaAuthorizationFailure(
  metaUserId: string,
  authorizationVersion: string,
): Promise<boolean> {
  const updated = await db
    .update(metaConnectionsTable)
    .set({
      tokenStatus: "reconnect_required",
      tokenCheckedAt: new Date(),
    })
    .where(
      and(
        eq(metaConnectionsTable.metaUserId, metaUserId),
        eq(metaConnectionsTable.authorizationVersion, authorizationVersion),
      ),
    )
    .returning({ metaUserId: metaConnectionsTable.metaUserId });
  return updated.length > 0;
}

/**
 * Background sync is intentionally paused after a confirmed authorization
 * failure. Reauthorization or the dashboard health check resumes it.
 */
export async function metaConnectionNeedsReconnect(
  metaUserId: string,
): Promise<boolean> {
  const [connection] = await db
    .select({ tokenStatus: metaConnectionsTable.tokenStatus })
    .from(metaConnectionsTable)
    .where(eq(metaConnectionsTable.metaUserId, metaUserId))
    .limit(1);
  return (
    connection?.tokenStatus === "expired" ||
    connection?.tokenStatus === "reconnect_required"
  );
}

/**
 * Returns the full Meta config (appId, appSecret, allowedPageId) or null
 * if any required variable is missing. Login is a Sorani-safe 503 when null.
 */
export function getMetaConfig(): MetaConfig | null {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const allowedPageId = process.env.META_ALLOWED_PAGE_ID;
  if (!appId || !appSecret || !allowedPageId) return null;
  return { appId, appSecret, allowedPageId };
}

/**
 * Returns the dedicated Meta webhook verify token, when configured.
 * This is intentionally separate from the Meta app secret because it is
 * entered in Meta's callback configuration and may be rotated independently.
 */
export function getMetaWebhookVerifyToken(): string | null {
  return process.env.META_WEBHOOK_VERIFY_TOKEN ?? null;
}
/**
 * Compute the OAuth callback / redirect URI.
 *
 * Priority:
 *   1. META_REDIRECT_URI env var (explicit override — most reliable in prod)
 *   2. APP_ORIGIN env var (preserves scheme + host as configured)
 *   3. Derived from the incoming request via req.protocol + req.get('host'),
 *      which preserves a local port number unlike req.hostname.
 *
 * A trailing slash on the origin base is normalised away.
 * The path segment /api/meta/callback is always appended by this function.
 */
export function getCallbackUrl(req: {
  protocol: string;
  get(name: string): string | undefined;
}): string {
  if (process.env.META_REDIRECT_URI) {
    return process.env.META_REDIRECT_URI;
  }
  const base = process.env.APP_ORIGIN
    ? process.env.APP_ORIGIN.replace(/\/$/, "")
    : `${req.protocol}://${req.get("host") ?? "localhost"}`;
  return `${base}/api/meta/callback`;
}

/**
 * Derive the safe frontend redirect base (scheme + host, no path).
 * Used for post-OAuth redirects only — never echoes back user-supplied input.
 */
export function getFrontendBase(req: {
  protocol: string;
  get(name: string): string | undefined;
}): string {
  if (process.env.APP_ORIGIN) {
    return process.env.APP_ORIGIN.replace(/\/$/, "");
  }
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

/**
 * The exact permissions this app uses. Keep this list intentionally narrow:
 * it is the source of truth for both the OAuth dialog and the App Review
 * submission. Adding one means documenting and reviewing its user benefit.
 */
export const META_OAUTH_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  // The Page management use case exposes this permission for reading visitor
  // posts and comments. It is also available to this app for test users.
  "pages_read_user_content",
  "instagram_basic",
  "instagram_manage_comments",
] as const;

const OAUTH_SCOPES = META_OAUTH_PERMISSIONS.join(",");

/**
 * Generate an OAuth state, persist its hash, and return the OAuth
 * authorization URL. Also returns the raw state so the caller can set it
 * as an HttpOnly cookie on the browser.
 */
export async function buildOAuthUrl(
  config: MetaConfig,
  callbackUrl: string,
): Promise<{ url: string; state: string }> {
  // Clean up expired states first
  await db
    .delete(oauthStatesTable)
    .where(lt(oauthStatesTable.expiresAt, new Date()));

  const state = generateToken(32);
  const stateHash = sha256Hex(state);
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  await db.insert(oauthStatesTable).values({ stateHash, expiresAt });

  const url = new URL("https://www.facebook.com/dialog/oauth");
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  // When an administrator previously declined a required permission, Meta
  // would otherwise keep returning the old, incomplete grant. Re-prompting
  // lets a public, Live-mode user correct that consent without dashboard work.
  url.searchParams.set("auth_type", "rerequest");
  // Useful while testing App Review and troubleshooting a public connection:
  // Meta includes the permissions it actually granted in the callback.
  url.searchParams.set("return_scopes", "true");
  return { url: url.toString(), state };
}

/**
 * Validate and atomically consume an OAuth state parameter.
 * DELETE…RETURNING ensures no two parallel requests can both succeed.
 * Returns true if valid (deleted), false otherwise.
 */
export async function consumeOAuthState(state: string): Promise<boolean> {
  const stateHash = sha256Hex(state);
  const deleted = await db
    .delete(oauthStatesTable)
    .where(
      and(
        eq(oauthStatesTable.stateHash, stateHash),
        // Only delete (consume) rows that have not yet expired
        gt(oauthStatesTable.expiresAt, new Date()),
      ),
    )
    .returning();
  return deleted.length > 0;
}

export interface AssetInfo {
  id: string;
  platform: "facebook" | "instagram";
  name: string;
  pictureUrl: string | null;
  accessToken: string; // not returned to client — internal use only
}

export interface PostInfo {
  id: string;
  platform: "facebook" | "instagram";
  message: string | null;
  createdAt: string;
  permalinkUrl: string | null;
  thumbnailUrl: string | null;
}

/**
 * Errors thrown when the authorized user does not own the required page.
 */
export class MetaPageNotAllowedError extends Error {
  constructor() {
    super("The authorized Meta user does not own the required Page");
    this.name = "MetaPageNotAllowedError";
  }
}

/**
 * Thrown when a different Meta user tries to connect while one already exists.
 */
export class MetaConnectionConflictError extends Error {
  constructor() {
    super("A Meta connection already exists for a different user");
    this.name = "MetaConnectionConflictError";
  }
}

/**
 * Handle the OAuth callback: exchange code, verify allowed page ownership,
 * enforce singleton connection, upsert connection. Creates a session cookie.
 *
 * Flow:
 *  1. Exchange code → short token → long-lived token
 *  2. Fetch /me/accounts
 *  3. Require META_ALLOWED_PAGE_ID to be among the user's owned pages
 *  4. Persist ONLY that page + its connected IG account as assets/tokens
 *  5. Enforce singleton: same user → update in place, different user → reject
 */
export async function handleOAuthCallback(
  code: string,
  state: string,
  cookieState: string | undefined,
  callbackUrl: string,
  config: MetaConfig,
  res: Response,
): Promise<void> {
  // 1. Verify state: constant-time compare against the browser cookie
  if (!cookieState) {
    throw new Error("Missing OAuth state cookie");
  }
  // Use the same safeEqual helper from crypto to prevent timing attacks
  const { safeEqual } = await import("./crypto");
  if (!safeEqual(state, cookieState)) {
    throw new Error("OAuth state mismatch");
  }

  // 2. Atomically consume state hash from DB (prevents replay)
  const valid = await consumeOAuthState(state);
  if (!valid) throw new Error("Invalid or expired OAuth state");

  const shortGrant = await exchangeCodeForToken(
    code,
    callbackUrl,
    config.appId,
    config.appSecret,
  );
  const longGrant = await getLongLivedToken(
    shortGrant.accessToken,
    config.appId,
    config.appSecret,
    shortGrant.expiresAt,
  );
  const longToken = longGrant.accessToken;

  const me = await fetchMeAndAccounts(longToken);
  const pages: GraphPage[] = me.accounts?.data ?? [];

  // 3. Find the allowed page among the user's owned pages
  const allowedPage = pages.find((p) => p.id === config.allowedPageId);
  if (!allowedPage || !allowedPage.access_token) {
    throw new MetaPageNotAllowedError();
  }

  // 4. Build assets from ONLY the allowed page + its connected IG account
  const assets: Omit<AssetInfo, "accessToken">[] = [];
  const pageTokenMap: Record<string, string> = {};

  pageTokenMap[allowedPage.id] = allowedPage.access_token;
  assets.push({
    id: allowedPage.id,
    platform: "facebook",
    name: allowedPage.name,
    pictureUrl: allowedPage.picture?.data?.url ?? null,
  });

  // Fetch connected Instagram business account (best-effort)
  const igId = allowedPage.instagram_business_account?.id;
  if (igId) {
    try {
      const igAccount = await fetchInstagramAccount(igId, allowedPage.access_token);
      assets.push({
        id: igId,
        platform: "instagram",
        name: igAccount.name ?? igAccount.username ?? igId,
        pictureUrl: igAccount.profile_picture_url ?? null,
      });
      pageTokenMap[igId] = allowedPage.access_token; // IG uses parent page token
    } catch {
      // Best-effort: skip IG account if fetch fails
    }
  }

  // Encrypt tokens at rest
  const encryptedUserToken = encrypt(longToken);
  const encryptedPageTokensJson = encrypt(
    JSON.stringify(
      Object.entries(pageTokenMap).map(([id, token]) => ({
        id,
        token: encrypt(token),
      })),
    ),
  );
  const authorizationVersion = randomUUID();

  // 5. Enforce singleton connection at DB level
  // Check if a connection already exists for a *different* user
  const existing = await db
    .select({ metaUserId: metaConnectionsTable.metaUserId })
    .from(metaConnectionsTable)
    .where(eq(metaConnectionsTable.singletonKey, "default"))
    .limit(1);

  if (existing.length > 0 && existing[0].metaUserId !== me.id) {
    throw new MetaConnectionConflictError();
  }

  // Upsert: same user updates in place using singletonKey conflict target.
  // We use metaUserId as PK and singletonKey as the singleton enforcement index.
  await db
    .insert(metaConnectionsTable)
    .values({
      metaUserId: me.id,
      singletonKey: "default",
      adminName: me.name,
      encryptedUserToken,
      encryptedLongLivedToken: encryptedUserToken,
      encryptedPageTokensJson,
      assetsJson: JSON.stringify(assets),
      tokenStatus: "unknown",
      tokenExpiresAt: longGrant.expiresAt,
      tokenCheckedAt: null,
      authorizationVersion,
    })
    .onConflictDoUpdate({
      target: metaConnectionsTable.metaUserId,
      set: {
        singletonKey: "default",
        adminName: me.name,
        encryptedUserToken,
        encryptedLongLivedToken: encryptedUserToken,
        encryptedPageTokensJson,
        assetsJson: JSON.stringify(assets),
        tokenStatus: "unknown",
        tokenExpiresAt: longGrant.expiresAt,
        tokenCheckedAt: null,
        authorizationVersion,
        updatedAt: new Date(),
      },
    });

  // Populate fresh health immediately. A temporary inspector failure leaves the
  // safe state as unknown and never invalidates an otherwise successful login.
  await getMetaTokenHealth(me.id);
  await createSession(res, me.id);
}

/**
 * Get all assets for the authenticated connection (no tokens).
 */
export async function getAssetsForUser(
  metaUserId: string,
): Promise<Omit<AssetInfo, "accessToken">[]> {
  const [conn] = await db
    .select()
    .from(metaConnectionsTable)
    .where(eq(metaConnectionsTable.metaUserId, metaUserId));
  if (!conn) return [];
  try {
    const assets = JSON.parse(conn.assetsJson) as Omit<
      AssetInfo,
      "accessToken"
    >[];
    return assets;
  } catch {
    return [];
  }
}

/**
 * Get the decrypted access token for a specific asset (page or IG account).
 */
function getTokenForAsset(
  connection: typeof metaConnectionsTable.$inferSelect,
  assetId: string,
): string | null {
  if (!connection.encryptedPageTokensJson) return null;
  try {
    const entries = JSON.parse(
      decrypt(connection.encryptedPageTokensJson),
    ) as Array<{ id: string; token: string }>;
    const entry = entries.find((e) => e.id === assetId);
    if (!entry) return null;
    return decrypt(entry.token);
  } catch {
    return null;
  }
}

/**
 * Validate that assetId belongs to the authenticated user's connection.
 */
export async function validateAssetOwnership(
  metaUserId: string,
  assetId: string,
): Promise<boolean> {
  const assets = await getAssetsForUser(metaUserId);
  return assets.some((a) => a.id === assetId);
}

/**
 * List recent posts for an asset. Returns up to 25 posts.
 * Never returns null — callers should validate ownership before calling.
 */
export async function listPostsForAsset(
  metaUserId: string,
  assetId: string,
): Promise<PostInfo[]> {
  const [conn] = await db
    .select()
    .from(metaConnectionsTable)
    .where(eq(metaConnectionsTable.metaUserId, metaUserId));
  if (!conn) return [];

  const assets = JSON.parse(conn.assetsJson) as AssetInfo[];
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) return [];

  const token = getTokenForAsset(conn, assetId);
  if (!token) return [];

  if (asset.platform === "facebook") {
    const posts = await fetchPagePosts(assetId, token);
    return posts.map((p) => ({
      id: p.id,
      platform: "facebook" as const,
      message: p.message ?? p.story ?? null,
      createdAt: p.created_time,
      permalinkUrl: p.permalink_url ?? null,
      thumbnailUrl: p.full_picture ?? null,
    }));
  } else {
    const media = await fetchInstagramMedia(assetId, token);
    return media.map((m) => ({
      id: m.id,
      platform: "instagram" as const,
      message: m.caption ?? null,
      createdAt: m.timestamp,
      permalinkUrl: m.permalink ?? null,
      thumbnailUrl: m.thumbnail_url ?? m.media_url ?? null,
    }));
  }
}

/**
 * Validate that a postId belongs to the given asset by fetching the asset's
 * recent posts server-side.
 * Returns the matching PostInfo (including its message) or null.
 */
export async function validatePostOwnership(
  metaUserId: string,
  assetId: string,
  postId: string,
): Promise<PostInfo | null> {
  const posts = await listPostsForAsset(metaUserId, assetId);
  return posts.find((p) => p.id === postId) ?? null;
}

/**
 * Disconnect: remove connection (cascade deletes sessions, giveaways, etc.).
 */
export async function disconnectMeta(metaUserId: string): Promise<void> {
  // The FK cascade on admin_sessions and giveaways handles child rows.
  // We delete the connection row; the cascade does the rest.
  await db
    .delete(metaConnectionsTable)
    .where(eq(metaConnectionsTable.metaUserId, metaUserId));
}

/**
 * Get the current giveaway for a Meta user.
 * The unique index on metaUserId ensures at most one row exists.
 */
export async function getCurrentGiveaway(metaUserId: string) {
  const [giveaway] = await db
    .select()
    .from(giveawaysTable)
    .where(eq(giveawaysTable.metaUserId, metaUserId))
    .limit(1);
  return giveaway ?? null;
}

/**
 * Finds the only giveaway a Page comment webhook is permitted to trigger.
 * The caller must already have verified the webhook's HMAC and allowed Page.
 */
export async function getRunningFacebookGiveawayForWebhook(
  pageId: string,
) {
  const [giveaway] = await db
    .select()
    .from(giveawaysTable)
    .where(
      and(
        eq(giveawaysTable.assetId, pageId),
        eq(giveawaysTable.postPlatform, "facebook"),
        eq(giveawaysTable.status, "running"),
      ),
    )
    .limit(1);
  return giveaway ?? null;
}
/**
 * Get the public current giveaway scoped to the singleton Meta connection.
 * Never returns a global latest across users — only the singleton tenant's
 * giveaway is public.
 */
export async function getPublicCurrentGiveaway() {
  // Find the singleton connection first
  const [conn] = await db
    .select({ metaUserId: metaConnectionsTable.metaUserId })
    .from(metaConnectionsTable)
    .where(eq(metaConnectionsTable.singletonKey, "default"))
    .limit(1);

  if (!conn) return null;

  const [giveaway] = await db
    .select()
    .from(giveawaysTable)
    .where(eq(giveawaysTable.metaUserId, conn.metaUserId))
    .limit(1);
  return giveaway ?? null;
}

/**
 * Get aggregated participants for a giveaway.
 */
export async function getParticipantsForGiveaway(giveawayId: string) {
  return db
    .select()
    .from(participantAggregatesTable)
    .where(eq(participantAggregatesTable.giveawayId, giveawayId))
    .orderBy(
      participantAggregatesTable.rank,
    );
}

/**
 * Derive an opaque, stable participantKey for a participant.
 * HMAC-SHA256(SESSION_SECRET, giveawayId + ":" + platform + ":" + externalUserId)
 * Truncated to 32 hex chars (128 bits) — collision-safe for this use case.
 */
function deriveParticipantKey(
  giveawayId: string,
  platform: string,
  externalUserId: string,
): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  return createHmac("sha256", secret)
    .update(`${giveawayId}:${platform}:${externalUserId}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Build the public giveaway projection object from a DB row + participants.
 * Raw external user IDs are never included — participants expose only the
 * opaque participantKey derived by HMAC-SHA256.
 */
export function buildGiveawayProjection(
  giveaway: typeof giveawaysTable.$inferSelect | null,
  participants: Array<typeof participantAggregatesTable.$inferSelect>,
) {
  if (!giveaway) {
    return {
      exists: false,
      status: null,
      prizeCount: null,
      prizeTitle: null,
      assetId: null,
      postId: null,
      postPlatform: null,
      postMessage: null,
      totalComments: null,
      totalParticipants: null,
      participants: [],
      lastSyncedAt: null,
      lastError: null,
      updatedAt: null,
    };
  }
  return {
    exists: true,
    status: giveaway.status as "idle" | "running" | "paused" | "completed",
    prizeCount: giveaway.prizeCount,
    prizeTitle: giveaway.prizeTitle,
    assetId: giveaway.assetId ?? null,
    postId: giveaway.postId ?? null,
    postPlatform:
      (giveaway.postPlatform as "facebook" | "instagram" | null) ?? null,
    postMessage: giveaway.postMessage ?? null,
    totalComments: giveaway.totalComments,
    totalParticipants: giveaway.totalParticipants,
    participants: participants.map((p) => ({
      participantKey: deriveParticipantKey(giveaway.id, p.platform, p.externalUserId),
      platform: p.platform as "facebook" | "instagram",
      displayName: p.displayName,
      commentCount: p.commentCount,
      rank: p.rank,
      profilePictureUrl: p.profilePictureUrl ?? null,
    })),
    lastSyncedAt: giveaway.lastSyncedAt?.toISOString() ?? null,
    lastError: giveaway.lastError ?? null,
    updatedAt: giveaway.updatedAt?.toISOString() ?? null,
  };
}

/**
 * Upsert the giveaway for a user using the DB-level unique constraint on
 * metaUserId.  When changing the selected post, stale comments and participant
 * aggregates are cleared transactionally so stale ranks are never visible.
 */
export async function upsertGiveaway(
  metaUserId: string,
  fields: {
    id: string; // only used for the initial INSERT; ignored on UPDATE
    assetId: string;
    postId: string;
    postPlatform: "facebook" | "instagram";
    postMessage: string | null;
    prizeCount: number;
    prizeTitle: string;
    /** Explicit confirmation to clear prior ranking, including for the same post. */
    reset: boolean;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    // Serialize configuration decisions for this singleton giveaway. Without a
    // row lock, two tabs can both decide against a stale pre-reset snapshot and
    // restore counters that a concurrent reset has just cleared.
    const [existing] = await tx
      .select()
      .from(giveawaysTable)
      .where(eq(giveawaysTable.metaUserId, metaUserId))
      .limit(1)
      .for("update");

    if (existing) {
      const targetChanged =
        existing.assetId !== fields.assetId || existing.postId !== fields.postId;
      if (targetChanged && !fields.reset) {
        throw new GiveawayResetConfirmationRequiredError();
      }
      const shouldClearData = targetChanged || fields.reset;
      const staleThreshold = new Date(Date.now() - SYNC_LOCK_TTL_MS);
      const updated = await tx
        .update(giveawaysTable)
        .set({
          assetId: fields.assetId,
          postId: fields.postId,
          postPlatform: fields.postPlatform,
          postMessage: fields.postMessage,
          prizeCount: fields.prizeCount,
          prizeTitle: fields.prizeTitle,
          status: "idle",
          totalComments: shouldClearData ? 0 : existing.totalComments,
          totalParticipants: shouldClearData ? 0 : existing.totalParticipants,
          lastSyncedAt: shouldClearData ? null : existing.lastSyncedAt,
          lastError: null,
          // This UPDATE only succeeds when no live sync owns the lease.
          syncLockedAt: null,
          syncLockedBy: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(giveawaysTable.metaUserId, metaUserId),
            or(
              isNull(giveawaysTable.syncLockedAt),
              lt(giveawaysTable.syncLockedAt, staleThreshold),
            ),
          ),
        )
        .returning({ id: giveawaysTable.id });

      if (updated.length === 0) {
        throw new SyncLockConflictError();
      }

      // Clear stale sync data transactionally whenever the post changes or an
      // administrator explicitly starts the same post over from scratch.
      if (shouldClearData) {
        await tx
          .delete(importedCommentsTable)
          .where(eq(importedCommentsTable.giveawayId, existing.id));
        await tx
          .delete(participantAggregatesTable)
          .where(eq(participantAggregatesTable.giveawayId, existing.id));
      }
    } else {
      // A concurrent first configuration may win the unique constraint.
      // Return a retryable conflict rather than overwriting its live lease.
      const inserted = await tx
        .insert(giveawaysTable)
        .values({
          id: fields.id,
          metaUserId,
          assetId: fields.assetId,
          postId: fields.postId,
          postPlatform: fields.postPlatform,
          postMessage: fields.postMessage,
          prizeCount: fields.prizeCount,
          prizeTitle: fields.prizeTitle,
          status: "idle",
          totalComments: 0,
          totalParticipants: 0,
        })
        .onConflictDoNothing({
          target: giveawaysTable.metaUserId,
        })
        .returning({ id: giveawaysTable.id });

      if (inserted.length === 0) {
        throw new SyncLockConflictError();
      }
    }
  });
}

/** Error thrown when a sync lock cannot be acquired. */
export class SyncLockConflictError extends Error {
  constructor() {
    super("Another sync is already in progress");
    this.name = "SyncLockConflictError";
  }
}

/** A changed post must never discard its current ranking without confirmation. */
export class GiveawayResetConfirmationRequiredError extends Error {
  constructor() {
    super("Changing the selected post requires reset confirmation");
    this.name = "GiveawayResetConfirmationRequiredError";
  }
}

/**
 * Attempt to acquire the sync lock for a giveaway row.
 * Race-safe: uses UPDATE … WHERE (syncLockedAt IS NULL OR syncLockedAt < staleThreshold)
 * and checks rows-affected. Returns the lock ID if acquired, throws SyncLockConflictError
 * if another non-stale lock is held.
 */
export async function acquireSyncLock(giveawayId: string): Promise<string> {
  const lockId = randomUUID();
  const staleThreshold = new Date(Date.now() - SYNC_LOCK_TTL_MS);

  const updated = await db
    .update(giveawaysTable)
    .set({ syncLockedAt: new Date(), syncLockedBy: lockId })
    .where(
      and(
        eq(giveawaysTable.id, giveawayId),
        or(
          isNull(giveawaysTable.syncLockedAt),
          lt(giveawaysTable.syncLockedAt, staleThreshold),
        ),
      ),
    )
    .returning({ id: giveawaysTable.id });

  if (updated.length === 0) {
    throw new SyncLockConflictError();
  }
  return lockId;
}

/**
 * Release the sync lock, but only if the caller still owns it.
 * Silently ignores if the lock has already been superseded.
 */
export async function releaseSyncLock(
  giveawayId: string,
  lockId: string,
): Promise<void> {
  await db
    .update(giveawaysTable)
    .set({ syncLockedAt: null, syncLockedBy: null })
    .where(
      and(
        eq(giveawaysTable.id, giveawayId),
        eq(giveawaysTable.syncLockedBy, lockId),
      ),
    );
}

/**
 * Sync comments from Meta for the current giveaway (inner, no lock).
 * Replaces comments and aggregates transactionally.
 * Throws MetaPageCapError if there are more pages than the safety cap allows
 * — in that case the DB is NOT modified (previous data is preserved).
 */
export async function syncGiveawayComments(
  giveaway: typeof giveawaysTable.$inferSelect,
  lockId: string,
): Promise<{ totalComments: number; totalParticipants: number }> {
  if (!giveaway.postId || !giveaway.postPlatform || !giveaway.assetId) {
    throw new Error("No post selected for this giveaway");
  }

  const [conn] = await db
    .select()
    .from(metaConnectionsTable)
    .where(eq(metaConnectionsTable.metaUserId, giveaway.metaUserId));
  if (!conn) throw new Error("Meta connection not found");

  const token = getTokenForAsset(conn, giveaway.assetId);
  if (!token) throw new Error("No access token for asset");

  type RawComment = {
    externalCommentId: string;
    externalUserId: string;
    displayName: string;
    message: string;
    profilePictureUrl: string | null;
    commentedAt: Date;
  };

  let rawComments: RawComment[];

  try {
    if (giveaway.postPlatform === "facebook") {
      // May throw MetaPageCapError — caller must not persist partial data
      const fbComments = await fetchAllFacebookComments(giveaway.postId, token);
      rawComments = fbComments.map((c) => {
        // Stable external user ID: prefer from.id, fall back to comment ID so the
        // user is stable across syncs even without public author data.
        const externalUserId = c.from?.id ?? `fb-comment:${c.id}`;
        const displayName = c.from?.name ?? ANONYMOUS_DISPLAY_NAME;
        return {
          externalCommentId: c.id,
          externalUserId,
          displayName,
          message: c.message,
          profilePictureUrl: c.from?.picture?.data?.url ?? null,
          commentedAt: new Date(c.created_time),
        };
      });
    } else {
      // May throw MetaPageCapError — caller must not persist partial data
      const igComments = await fetchAllInstagramComments(giveaway.postId, token);
      rawComments = igComments.map((c) => {
        // Stable external user ID: prefer from.id (numeric IG user ID), fall back
        // to username. The username is stable enough for IG giveaway counting.
        const externalUserId = c.from?.id ?? c.username;
        const displayName = c.from?.username ?? c.username ?? ANONYMOUS_DISPLAY_NAME;
        return {
          externalCommentId: c.id,
          externalUserId,
          displayName,
          message: c.text,
          profilePictureUrl: null, // IG comment API does not expose profile photos
          commentedAt: new Date(c.timestamp),
        };
      });
    }
  } catch (err) {
    if (err instanceof MetaAuthError || err instanceof MetaPermissionError) {
      err.authorizationVersion = conn.authorizationVersion;
    }
    throw err;
  }

  // Deduplicate by external comment ID
  const seen = new Set<string>();
  const dedupedComments = rawComments.filter((c) => {
    if (seen.has(c.externalCommentId)) return false;
    seen.add(c.externalCommentId);
    return true;
  });

  const platform = giveaway.postPlatform;
  const giveawayId = giveaway.id;

  // Aggregate by platform+user
  const userMap = new Map<
    string,
    {
      externalUserId: string;
      displayName: string;
      commentCount: number;
      profilePictureUrl: string | null;
      mostRecentCommentAt: Date;
    }
  >();

  for (const c of dedupedComments) {
    const key = c.externalUserId;
    const existing = userMap.get(key);
    if (!existing) {
      userMap.set(key, {
        externalUserId: c.externalUserId,
        displayName: c.displayName,
        commentCount: 1,
        profilePictureUrl: c.profilePictureUrl,
        mostRecentCommentAt: c.commentedAt,
      });
    } else {
      existing.commentCount++;
      if (c.commentedAt > existing.mostRecentCommentAt) {
        existing.mostRecentCommentAt = c.commentedAt;
        if (c.profilePictureUrl) {
          existing.profilePictureUrl = c.profilePictureUrl;
        }
      }
    }
  }

  // Sort for deterministic rank: count desc → most recent desc → ID asc
  const aggregates = Array.from(userMap.values()).sort((a, b) => {
    if (b.commentCount !== a.commentCount) return b.commentCount - a.commentCount;
    const timeDiff =
      b.mostRecentCommentAt.getTime() - a.mostRecentCommentAt.getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.externalUserId.localeCompare(b.externalUserId);
  });

  const rankedAggregates = aggregates.map((a, i) => ({ ...a, rank: i + 1 }));
  const totalComments = dedupedComments.length;
  const totalParticipants = userMap.size;

  // Replace all in a single transaction
  await db.transaction(async (tx) => {
    const [lockedGiveaway] = await tx
      .select()
      .from(giveawaysTable)
      .where(
        and(
          eq(giveawaysTable.id, giveawayId),
          eq(giveawaysTable.syncLockedBy, lockId),
        ),
      )
      .for("update");

    if (
      !lockedGiveaway ||
      lockedGiveaway.assetId !== giveaway.assetId ||
      lockedGiveaway.postId !== giveaway.postId ||
      lockedGiveaway.postPlatform !== giveaway.postPlatform ||
      lockedGiveaway.status !== giveaway.status
    ) {
      throw new SyncLockConflictError();
    }

    await tx
      .delete(importedCommentsTable)
      .where(eq(importedCommentsTable.giveawayId, giveawayId));
    await tx
      .delete(participantAggregatesTable)
      .where(eq(participantAggregatesTable.giveawayId, giveawayId));

    if (dedupedComments.length > 0) {
      const commentRows = dedupedComments.map((c) => ({
        id: randomUUID(),
        giveawayId,
        externalCommentId: c.externalCommentId,
        platform,
        externalUserId: c.externalUserId,
        displayName: c.displayName,
        message: c.message,
        profilePictureUrl: c.profilePictureUrl ?? null,
        commentedAt: c.commentedAt,
      }));
      for (let i = 0; i < commentRows.length; i += 500) {
        await tx
          .insert(importedCommentsTable)
          .values(commentRows.slice(i, i + 500));
      }
    }

    if (rankedAggregates.length > 0) {
      const aggRows = rankedAggregates.map((a) => ({
        id: randomUUID(),
        giveawayId,
        platform,
        externalUserId: a.externalUserId,
        displayName: a.displayName,
        commentCount: a.commentCount,
        rank: a.rank,
        profilePictureUrl: a.profilePictureUrl ?? null,
        mostRecentCommentAt: a.mostRecentCommentAt,
      }));
      for (let i = 0; i < aggRows.length; i += 500) {
        await tx
          .insert(participantAggregatesTable)
          .values(aggRows.slice(i, i + 500));
      }
    }

    await tx
      .update(giveawaysTable)
      .set({
        totalComments,
        totalParticipants,
        lastSyncedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(giveawaysTable.id, giveawayId));
  });

  return { totalComments, totalParticipants };
}

/**
 * Lock-protected sync entry point used by both manual sync (route handler)
 * and background worker. Acquires the lock, runs syncGiveawayComments,
 * releases the lock regardless of success/failure.
 *
 * On MetaPageCapError the safeMessage is persisted to lastError and the
 * previously successful data is left untouched (the inner sync throws before
 * touching the DB).
 *
 * Returns the updated giveaway row.
 */
export async function syncGiveawayWithLock(
  giveaway: typeof giveawaysTable.$inferSelect,
  options: { completeAfterSync?: boolean } = {},
): Promise<typeof giveawaysTable.$inferSelect> {
  const lockId = await acquireSyncLock(giveaway.id);
  try {
    const [lockedGiveaway] = await db
      .select()
      .from(giveawaysTable)
      .where(eq(giveawaysTable.id, giveaway.id));

    if (
      !lockedGiveaway ||
      lockedGiveaway.assetId !== giveaway.assetId ||
      lockedGiveaway.postId !== giveaway.postId ||
      lockedGiveaway.postPlatform !== giveaway.postPlatform ||
      lockedGiveaway.status !== giveaway.status
    ) {
      throw new SyncLockConflictError();
    }

    await syncGiveawayComments(lockedGiveaway, lockId);
    if (options.completeAfterSync) {
      const completed = await db
        .update(giveawaysTable)
        .set({ status: "completed", updatedAt: new Date() })
        .where(
          and(
            eq(giveawaysTable.id, giveaway.id),
            eq(giveawaysTable.syncLockedBy, lockId),
          ),
        )
        .returning({ id: giveawaysTable.id });

      if (completed.length === 0) {
        throw new SyncLockConflictError();
      }
    }
  } catch (err) {
    let shouldPersistError = true;
    if (
      (err instanceof MetaAuthError || err instanceof MetaPermissionError) &&
      err.authorizationVersion
    ) {
      err.authorizationFailureIsCurrent =
        await recordMetaAuthorizationFailure(
          giveaway.metaUserId,
          err.authorizationVersion,
        );
      shouldPersistError = err.authorizationFailureIsCurrent;
    }
    // A lock/configuration conflict is expected retry behavior and must not
    // attach an error to a newly reconfigured giveaway.
    if (!(err instanceof SyncLockConflictError) && shouldPersistError) {
      const safeMessage =
        err instanceof MetaPageCapError
          ? (err as MetaPageCapError).safeMessage
          : err instanceof MetaAuthError || err instanceof MetaPermissionError
            ? (err as Error).message
            : "زانیاری بەرپرسایەتی نەگیشت — هەوڵبدەرەوە";
      await db
        .update(giveawaysTable)
        .set({ lastError: safeMessage, updatedAt: new Date() })
        .where(eq(giveawaysTable.id, giveaway.id));
    }
    throw err;
  } finally {
    await releaseSyncLock(giveaway.id, lockId);
  }

  const [updated] = await db
    .select()
    .from(giveawaysTable)
    .where(eq(giveawaysTable.id, giveaway.id));
  return updated;
}

export {
  MetaAuthError,
  MetaPermissionError,
  MetaGraphError,
  MetaPageCapError,
  GIVEAWAY_STATUSES,
};

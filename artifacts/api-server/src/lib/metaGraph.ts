/**
 * Meta Graph API client.
 * Tokens are sent as Authorization: Bearer headers, never in URL query strings.
 * All paging is guarded by a maximum page count and a host allowlist.
 * Error messages returned to callers are safe (no raw token/secret content).
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v26.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const SAFE_PAGING_HOST = "graph.facebook.com";
const MAX_PAGES = 50;

/** Sorani fallback when a comment has no public author information. */
export const ANONYMOUS_DISPLAY_NAME = "بێ ناو";

export interface GraphPage {
  id: string;
  name: string;
  access_token?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string };
}

export interface GraphInstagramAccount {
  id: string;
  name: string;
  username?: string;
  profile_picture_url?: string;
}

export interface GraphPost {
  id: string;
  message?: string;
  story?: string;
  created_time: string;
  permalink_url?: string;
  full_picture?: string;
}

export interface GraphMedia {
  id: string;
  caption?: string;
  timestamp: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
}

export interface GraphFacebookComment {
  id: string;
  message: string;
  created_time: string;
  from?: { id: string; name: string; picture?: { data?: { url?: string } } };
}

export interface GraphInstagramComment {
  id: string;
  text: string;
  timestamp: string;
  username: string;
  from?: { id: string; username: string };
}

export interface GraphPaging {
  next?: string;
}

/**
 * Core fetch helper.
 * Token is sent in the Authorization header, not the URL.
 * For paging URLs the caller has already stripped the access_token query param.
 */
async function graphFetch<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json()) as T & {
    error?: { message?: string; type?: string; code?: number };
  };
  if (!response.ok || (data as { error?: unknown }).error) {
    const errData = data as {
      error?: { message?: string; type?: string; code?: number };
    };
    const code = errData.error?.code;
    const type = errData.error?.type ?? "";
    // Map known Meta auth/permission error codes to safe, user-facing messages.
    // Never forward the raw error message which may contain token fragments.
    if (code === 190 || code === 102 || type === "OAuthException") {
      throw new MetaAuthError(
        "Meta authorization expired or revoked. Please reconnect.",
      );
    }
    if (
      code === 10 ||
      code === 200 ||
      type === "GraphMethodException"
    ) {
      throw new MetaPermissionError(
        "Insufficient Meta permissions. Please reconnect.",
      );
    }
    // Generic safe error — do NOT include errData.error.message which may
    // contain sensitive details or token fragments.
    throw new MetaGraphError("Meta API error");
  }
  return data;
}

export class MetaAuthError extends Error {
  authorizationVersion?: string;
  authorizationFailureIsCurrent?: boolean;

  constructor(message: string) {
    super(message);
    this.name = "MetaAuthError";
  }
}

export class MetaPermissionError extends Error {
  authorizationVersion?: string;
  authorizationFailureIsCurrent?: boolean;

  constructor(message: string) {
    super(message);
    this.name = "MetaPermissionError";
  }
}

export class MetaGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaGraphError";
  }
}

/**
 * Thrown when the 50-page safety cap is hit but Meta signals more pages exist.
 * Callers must NOT return the partial result — they should persist a safe error.
 * Sorani safe message suitable for storing in lastError.
 */
export class MetaPageCapError extends Error {
  /** Sorani-safe message for persisting in lastError */
  readonly safeMessage = "زانیاری بەرپرسایەتی تەواو نەگیشت — زۆری کۆمێنتەکان پێشوو لە سنوور بوو";
  constructor() {
    super("Graph paging cap reached with more pages pending — partial data not persisted");
    this.name = "MetaPageCapError";
  }
}

export interface AccessTokenGrant {
  accessToken: string;
  expiresAt: Date | null;
}

function expiresAtFromSeconds(expiresIn: unknown): Date | null {
  if (
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    return null;
  }
  return new Date(Date.now() + expiresIn * 1000);
}

/**
 * Exchange an authorization code for a short-lived user token.
 * Uses a POST body to avoid the token appearing in server logs.
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  appId: string,
  appSecret: string,
): Promise<AccessTokenGrant> {
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const response = await fetch(`${GRAPH_BASE}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!response.ok || !data.access_token) {
    throw new MetaAuthError("Failed to exchange authorization code");
  }
  return {
    accessToken: data.access_token,
    expiresAt: expiresAtFromSeconds(data.expires_in),
  };
}

/**
 * Exchange a short-lived token for a long-lived user token (~60 days).
 * Uses a POST body to keep credentials off the URL.
 */
export async function getLongLivedToken(
  shortToken: string,
  appId: string,
  appSecret: string,
  fallbackExpiresAt: Date | null,
): Promise<AccessTokenGrant> {
  const body = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });
  const response = await fetch(`${GRAPH_BASE}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!response.ok || !data.access_token) {
    // Fall back to the original token if long-lived exchange fails
    return { accessToken: shortToken, expiresAt: fallbackExpiresAt };
  }
  return {
    accessToken: data.access_token,
    expiresAt: expiresAtFromSeconds(data.expires_in),
  };
}

export interface MeResult {
  id: string;
  name: string;
  accounts?: {
    data: GraphPage[];
    paging?: GraphPaging;
  };
}

/**
 * Fetch /me and /me/accounts to get the user and their pages.
 */
export async function fetchMeAndAccounts(token: string): Promise<MeResult> {
  const url = `${GRAPH_BASE}/me?fields=id,name,accounts{id,name,access_token,picture,instagram_business_account}`;
  return graphFetch<MeResult>(url, token);
}

/**
 * Validate the current user token through a minimal authenticated request.
 * The token stays in the Authorization header and never enters the URL.
 */
export async function validateUserAccessToken(token: string): Promise<void> {
  await graphFetch<{ id: string }>(`${GRAPH_BASE}/me?fields=id`, token);
}

/**
 * Validate a Page/Instagram token against the asset it was issued for.
 * The external ID is non-secret; the token stays in the Authorization header.
 */
export async function validateAssetAccessToken(
  assetId: string,
  token: string,
): Promise<void> {
  const safeAssetId = encodeURIComponent(assetId);
  await graphFetch<{ id: string }>(
    `${GRAPH_BASE}/${safeAssetId}?fields=id`,
    token,
  );
}

/**
 * Fetch Instagram business account details for a given IG account ID.
 */
export async function fetchInstagramAccount(
  igAccountId: string,
  pageToken: string,
): Promise<GraphInstagramAccount> {
  const url = `${GRAPH_BASE}/${igAccountId}?fields=id,name,username,profile_picture_url`;
  return graphFetch<GraphInstagramAccount>(url, pageToken);
}

/**
 * Fetch recent posts for a Facebook Page (last 25).
 */
export async function fetchPagePosts(
  pageId: string,
  pageToken: string,
): Promise<GraphPost[]> {
  const url = `${GRAPH_BASE}/${pageId}/posts?fields=id,message,story,created_time,permalink_url,full_picture&limit=25`;
  const data = await graphFetch<{ data: GraphPost[] }>(url, pageToken);
  return data.data ?? [];
}

/**
 * Fetch recent media for an Instagram account (last 25).
 */
export async function fetchInstagramMedia(
  igAccountId: string,
  igToken: string,
): Promise<GraphMedia[]> {
  const url = `${GRAPH_BASE}/${igAccountId}/media?fields=id,caption,timestamp,permalink,thumbnail_url,media_url&limit=25`;
  const data = await graphFetch<{ data: GraphMedia[] }>(url, igToken);
  return data.data ?? [];
}

/**
 * Strip the access_token query parameter from a Graph API paging URL and
 * verify the host is safe before following it.
 * Returns null if the URL is unsafe or unparseable.
 */
function safePagingUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== SAFE_PAGING_HOST
    ) {
      return null;
    }
    parsed.searchParams.delete("access_token");
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Fetch all comments for a Facebook Page post, following pagination safely.
 * Only follows paging URLs on graph.facebook.com; limits to MAX_PAGES fetches.
 *
 * Throws MetaPageCapError if the cap is hit while Meta signals more pages,
 * preventing partial rankings from being persisted.
 */
export async function fetchAllFacebookComments(
  postId: string,
  pageToken: string,
): Promise<GraphFacebookComment[]> {
  const comments: GraphFacebookComment[] = [];
  let url: string | undefined = `${GRAPH_BASE}/${postId}/comments?fields=id,message,created_time,from{id,name,picture}&limit=100`;
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    type FbCommentPage = {
      data: GraphFacebookComment[];
      paging?: { next?: string };
    };
    const pageData: FbCommentPage = await graphFetch<FbCommentPage>(
      url,
      pageToken,
    );
    if (pageData.data) comments.push(...pageData.data);
    const nextRaw: string | undefined = pageData.paging?.next;
    if (nextRaw) {
      const safeNext = safePagingUrl(nextRaw);
      if (!safeNext) {
        throw new MetaPageCapError();
      }
      url = safeNext;
    } else {
      url = undefined;
    }
    pages++;
  }

  // If we exhausted the cap but Meta still has more pages, refuse partial data
  if (pages >= MAX_PAGES && url !== undefined) {
    throw new MetaPageCapError();
  }

  return comments;
}

/**
 * Fetch all comments for an Instagram media object, following pagination safely.
 *
 * Throws MetaPageCapError if the cap is hit while Meta signals more pages,
 * preventing partial rankings from being persisted.
 */
export async function fetchAllInstagramComments(
  mediaId: string,
  igToken: string,
): Promise<GraphInstagramComment[]> {
  const comments: GraphInstagramComment[] = [];
  let url: string | undefined = `${GRAPH_BASE}/${mediaId}/comments?fields=id,text,timestamp,username,from{id,username}&limit=100`;
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    type IgCommentPage = {
      data: GraphInstagramComment[];
      paging?: { next?: string };
    };
    const pageData: IgCommentPage = await graphFetch<IgCommentPage>(
      url,
      igToken,
    );
    if (pageData.data) comments.push(...pageData.data);
    const nextRaw: string | undefined = pageData.paging?.next;
    if (nextRaw) {
      const safeNext = safePagingUrl(nextRaw);
      if (!safeNext) {
        throw new MetaPageCapError();
      }
      url = safeNext;
    } else {
      url = undefined;
    }
    pages++;
  }

  // If we exhausted the cap but Meta still has more pages, refuse partial data
  if (pages >= MAX_PAGES && url !== undefined) {
    throw new MetaPageCapError();
  }

  return comments;
}

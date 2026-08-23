import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { adminSessionsTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import { sha256Hex, generateToken, safeEqual } from "./crypto";

const SESSION_COOKIE = "sid";
const CSRF_COOKIE = "csrf";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionData {
  metaUserId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionData;
    }
  }
}

/**
 * Set a session cookie for the given Meta user.
 * Stores a SHA-256 hash of the random token in DB.
 */
export async function createSession(
  res: Response,
  metaUserId: string,
): Promise<void> {
  const token = generateToken(32);
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(adminSessionsTable).values({ tokenHash, metaUserId, expiresAt });

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

/**
 * Clear the session cookie and remove from DB.
 */
export async function destroySession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token && typeof token === "string") {
    const tokenHash = sha256Hex(token);
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.tokenHash, tokenHash));
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.clearCookie(CSRF_COOKIE, { path: "/" });
}

/**
 * Express middleware: loads session from cookie if present.
 * Does NOT reject unauthenticated requests — use requireAuth for that.
 */
export async function loadSession(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== "string") {
    next();
    return;
  }
  try {
    const tokenHash = sha256Hex(token);
    const [session] = await db
      .select()
      .from(adminSessionsTable)
      .where(eq(adminSessionsTable.tokenHash, tokenHash));
    if (session && session.expiresAt > new Date()) {
      req.session = { metaUserId: session.metaUserId };
    }
  } catch {
    // DB error — skip session, do not crash
  }
  next();
}

/**
 * Express middleware: requires a valid session.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

/**
 * Set or refresh the CSRF token cookie (not HttpOnly so JS can read it).
 * Returns the token value.
 */
export function setCsrfCookie(res: Response, existingToken?: string): string {
  const token = existingToken ?? generateToken(16);
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_MS,
  });
  return token;
}

/**
 * Express middleware: validates the double-submit CSRF pattern.
 * Requires X-CSRF-Token header to match the csrf cookie value.
 * Uses safeEqual for constant-time comparison to prevent timing attacks.
 * Normalises the header value (Express may return string | string[]).
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const raw = req.headers["x-csrf-token"];
  // Normalise: Express can return string | string[]; take the first element
  const headerToken = Array.isArray(raw) ? raw[0] : raw;

  if (
    !cookieToken ||
    typeof cookieToken !== "string" ||
    !headerToken ||
    typeof headerToken !== "string" ||
    !safeEqual(cookieToken, headerToken)
  ) {
    res.status(403).json({ error: "Invalid CSRF token" });
    return;
  }
  next();
}

/**
 * Clean up expired sessions from DB.
 * Deletes rows whose expiresAt is strictly less than now (i.e. already expired).
 * Safe to call periodically from background tasks.
 */
export async function cleanExpiredSessions(): Promise<void> {
  await db
    .delete(adminSessionsTable)
    .where(lt(adminSessionsTable.expiresAt, new Date()));
}

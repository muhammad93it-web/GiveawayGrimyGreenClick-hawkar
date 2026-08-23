import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiDirectory = path.resolve(currentDirectory, "..");
const databaseLibraryDirectory = path.resolve(apiDirectory, "../../lib/db");
const sourceDatabaseUrl = process.env.DATABASE_URL;

if (!sourceDatabaseUrl) {
  throw new Error("DATABASE_URL must be set to run sync race tests");
}

process.env.SESSION_SECRET = "sync-reset-race-test-secret";

const schemaName = `sync_reset_race_${randomUUID().replaceAll("-", "")}`;
const bundledEntry = path.join(
  databaseLibraryDirectory,
  `.sync-reset-race-${randomUUID()}.mjs`,
);

async function runSql(sql) {
  await execFileAsync("psql", ["-v", "ON_ERROR_STOP=1", "-c", sql], {
    env: process.env,
  });
}

async function createIsolatedSchema() {
  const tables = [
    "meta_connections",
    "giveaways",
    "imported_comments",
    "participant_aggregates",
  ];
  const statements = [
    `CREATE SCHEMA "${schemaName}"`,
    ...tables.map(
      (table) =>
        `CREATE TABLE "${schemaName}"."${table}" (LIKE public."${table}" INCLUDING ALL)`,
    ),
  ];
  await runSql(statements.join("; "));
}

function databaseUrlForSchema(url, schema) {
  const scopedUrl = new URL(url);
  scopedUrl.searchParams.set("options", `-c search_path=${schema}`);
  return scopedUrl.toString();
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

await createIsolatedSchema();
process.env.DATABASE_URL = databaseUrlForSchema(sourceDatabaseUrl, schemaName);

let service;
try {
  await build({
    bundle: true,
    entryPoints: [
      path.join(currentDirectory, "fixtures/meta-service-test-entry.ts"),
    ],
    external: ["pg", "drizzle-orm", "drizzle-orm/*"],
    format: "esm",
    outfile: bundledEntry,
    platform: "node",
    target: "node20",
  });

  service = await import(
    `${pathToFileURL(bundledEntry).href}?cacheBust=${randomUUID()}`
  );
} catch (error) {
  await runSql(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await rm(bundledEntry, { force: true });
  throw error;
}

const {
  SYNC_LOCK_TTL_MS,
  SyncLockConflictError,
  db,
  eq,
  encrypt,
  giveawaysTable,
  importedCommentsTable,
  metaConnectionsTable,
  participantAggregatesTable,
  pool,
  syncGiveawayWithLock,
  upsertGiveaway,
} = service;

async function seedGiveaway({ suffix, postId }) {
  const metaUserId = `meta-user-${suffix}`;
  const giveawayId = `giveaway-${suffix}`;
  const assetId = `asset-${suffix}`;
  const pageToken = encrypt(`page-token-${suffix}`);

  await db.insert(metaConnectionsTable).values({
    metaUserId,
    singletonKey: `test-${suffix}`,
    adminName: "Test administrator",
    encryptedUserToken: encrypt(`user-token-${suffix}`),
    encryptedLongLivedToken: encrypt(`user-token-${suffix}`),
    encryptedPageTokensJson: encrypt(
      JSON.stringify([{ id: assetId, token: pageToken }]),
    ),
    assetsJson: "[]",
    authorizationVersion: `authorization-${suffix}`,
  });
  await db.insert(giveawaysTable).values({
    id: giveawayId,
    metaUserId,
    assetId,
    postId,
    postPlatform: "facebook",
    postMessage: "Old post",
    prizeCount: 1,
    prizeTitle: "Prize",
    status: "running",
    totalComments: 7,
    totalParticipants: 4,
  });
  await db.insert(importedCommentsTable).values({
    id: `previous-comment-${suffix}`,
    giveawayId,
    externalCommentId: `previous-comment-${suffix}`,
    platform: "facebook",
    externalUserId: `previous-user-${suffix}`,
    displayName: "Previous participant",
    message: "Previous comment",
    profilePictureUrl: null,
    commentedAt: new Date(),
  });
  await db.insert(participantAggregatesTable).values({
    id: `previous-participant-${suffix}`,
    giveawayId,
    platform: "facebook",
    externalUserId: `previous-user-${suffix}`,
    displayName: "Previous participant",
    commentCount: 7,
    rank: 1,
    profilePictureUrl: null,
    mostRecentCommentAt: new Date(),
  });

  const [giveaway] = await db
    .select()
    .from(giveawaysTable)
    .where(eq(giveawaysTable.id, giveawayId));
  return { assetId, giveaway, giveawayId, metaUserId };
}

async function runExpiredLockRace({ suffix, resetPostId }) {
  const initialPostId = `old-post-${suffix}`;
  const seeded = await seedGiveaway({ suffix, postId: initialPostId });
  const fetchStarted = deferred();
  const releaseFetch = deferred();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    assert.match(String(url), new RegExp(`/${initialPostId}/comments`));
    fetchStarted.resolve();
    await releaseFetch.promise;
    return new Response(
      JSON.stringify({
        data: [
          {
            id: `stale-comment-${suffix}`,
            message: "Stale comment",
            created_time: "2026-08-23T00:00:00.000Z",
            from: { id: `stale-user-${suffix}`, name: "Stale participant" },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const syncPromise = syncGiveawayWithLock(seeded.giveaway);
    await fetchStarted.promise;

    await db
      .update(giveawaysTable)
      .set({
        syncLockedAt: new Date(Date.now() - SYNC_LOCK_TTL_MS - 1),
      })
      .where(eq(giveawaysTable.id, seeded.giveawayId));

    await upsertGiveaway(seeded.metaUserId, {
      id: `unused-${suffix}`,
      assetId: seeded.assetId,
      postId: resetPostId,
      postPlatform: "facebook",
      postMessage: "Reset post",
      prizeCount: 2,
      prizeTitle: "Reset prize",
      reset: true,
    });

    releaseFetch.resolve();
    await assert.rejects(syncPromise, SyncLockConflictError);

    const [giveaway] = await db
      .select()
      .from(giveawaysTable)
      .where(eq(giveawaysTable.id, seeded.giveawayId));
    const comments = await db
      .select()
      .from(importedCommentsTable)
      .where(eq(importedCommentsTable.giveawayId, seeded.giveawayId));
    const participants = await db
      .select()
      .from(participantAggregatesTable)
      .where(eq(participantAggregatesTable.giveawayId, seeded.giveawayId));

    assert.equal(giveaway.postId, resetPostId);
    assert.equal(giveaway.status, "idle");
    assert.equal(giveaway.totalComments, 0);
    assert.equal(giveaway.totalParticipants, 0);
    assert.equal(comments.length, 0);
    assert.equal(participants.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test(
  "an expired sync cannot repopulate a ranking reset while its Meta request is delayed",
  { concurrency: false },
  async () => {
    await runExpiredLockRace({
      suffix: "same-post",
      resetPostId: "old-post-same-post",
    });
  },
);

test(
  "an expired sync cannot restore stale counters after the selected post changes",
  { concurrency: false },
  async () => {
    await runExpiredLockRace({
      suffix: "changed-post",
      resetPostId: "new-post-changed-post",
    });
  },
);

test.after(async () => {
  try {
    await pool.end();
  } finally {
    await runSql(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await rm(bundledEntry, { force: true });
  }
});

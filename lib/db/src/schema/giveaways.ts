import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { metaConnectionsTable } from "./metaConnections";

export const GIVEAWAY_STATUSES = [
  "idle",
  "running",
  "paused",
  "completed",
] as const;
export type GiveawayStatus = (typeof GIVEAWAY_STATUSES)[number];

/**
 * One current giveaway per Meta connection, enforced by a unique index on
 * metaUserId. Upsert / update should always target the existing row via that
 * constraint rather than inserting a second one.
 *
 * syncLockedAt / syncLockedBy implement a short-lived advisory lease so that
 * background sync and manual sync cannot overlap. A lock is considered stale
 * after the server-defined sync lease TTL and may be forcibly acquired.
 */
export const giveawaysTable = pgTable(
  "giveaways",
  {
    id: text("id").primaryKey(), // random UUID
    metaUserId: text("meta_user_id")
      .notNull()
      .references(() => metaConnectionsTable.metaUserId, {
        onDelete: "cascade",
      }),
    status: text("status").notNull().default("idle"), // GiveawayStatus
    prizeCount: integer("prize_count").notNull().default(1),
    prizeTitle: text("prize_title").notNull().default(""),
    // Selected post info
    postId: text("post_id"), // external post ID
    postPlatform: text("post_platform"), // "facebook" | "instagram"
    postMessage: text("post_message"),
    assetId: text("asset_id"), // external asset ID
    // Aggregated totals
    totalComments: integer("total_comments").notNull().default(0),
    totalParticipants: integer("total_participants").notNull().default(0),
    // Sync tracking
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    // Sync lease fields — null means unlocked
    syncLockedAt: timestamp("sync_locked_at", { withTimezone: true }),
    syncLockedBy: text("sync_locked_by"), // opaque worker/request ID
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // DB-level enforcement of one giveaway per Meta connection
    uniqueIndex("giveaways_meta_user_id_unique").on(t.metaUserId),
    index("giveaways_updated_at_idx").on(t.updatedAt),
  ],
);

export const insertGiveawaySchema = createInsertSchema(giveawaysTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertGiveaway = z.infer<typeof insertGiveawaySchema>;
export type Giveaway = typeof giveawaysTable.$inferSelect;

import {
  pgTable,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { giveawaysTable } from "./giveaways";

/**
 * Aggregated participant statistics per giveaway.
 * Keyed by platform + externalUserId (never by display name).
 * Replaced transactionally on each sync.
 */
export const participantAggregatesTable = pgTable(
  "participant_aggregates",
  {
    id: text("id").primaryKey(), // random UUID
    giveawayId: text("giveaway_id")
      .notNull()
      .references(() => giveawaysTable.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // "facebook" | "instagram"
    externalUserId: text("external_user_id").notNull(),
    displayName: text("display_name").notNull(),
    commentCount: integer("comment_count").notNull().default(0),
    rank: integer("rank").notNull().default(0),
    profilePictureUrl: text("profile_picture_url"),
    // Most recent comment timestamp for tiebreaking
    mostRecentCommentAt: timestamp("most_recent_comment_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("participant_aggregates_giveaway_user_idx").on(
      t.giveawayId,
      t.platform,
      t.externalUserId,
    ),
    index("participant_aggregates_giveaway_id_idx").on(t.giveawayId),
    index("participant_aggregates_rank_idx").on(t.giveawayId, t.rank),
  ],
);

export const insertParticipantAggregateSchema = createInsertSchema(
  participantAggregatesTable,
).omit({ createdAt: true, updatedAt: true });
export type InsertParticipantAggregate = z.infer<
  typeof insertParticipantAggregateSchema
>;
export type ParticipantAggregate =
  typeof participantAggregatesTable.$inferSelect;

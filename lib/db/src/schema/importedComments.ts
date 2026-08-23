import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { giveawaysTable } from "./giveaways";

/**
 * Raw comments imported from Meta Graph API for a giveaway.
 * Deduplicated by external comment ID.
 */
export const importedCommentsTable = pgTable(
  "imported_comments",
  {
    id: text("id").primaryKey(), // random UUID
    giveawayId: text("giveaway_id")
      .notNull()
      .references(() => giveawaysTable.id, { onDelete: "cascade" }),
    externalCommentId: text("external_comment_id").notNull(),
    platform: text("platform").notNull(), // "facebook" | "instagram"
    externalUserId: text("external_user_id").notNull(),
    displayName: text("display_name").notNull(),
    message: text("message").notNull().default(""),
    profilePictureUrl: text("profile_picture_url"),
    commentedAt: timestamp("commented_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("imported_comments_giveaway_external_idx").on(
      t.giveawayId,
      t.externalCommentId,
    ),
    index("imported_comments_giveaway_id_idx").on(t.giveawayId),
    index("imported_comments_user_idx").on(
      t.giveawayId,
      t.platform,
      t.externalUserId,
    ),
  ],
);

export const insertImportedCommentSchema =
  createInsertSchema(importedCommentsTable).omit({ createdAt: true });
export type InsertImportedComment = z.infer<typeof insertImportedCommentSchema>;
export type ImportedComment = typeof importedCommentsTable.$inferSelect;

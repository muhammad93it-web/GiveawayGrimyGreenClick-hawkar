import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Stores SHA-256 hashes of OAuth state parameters with short expiry.
 * The raw state value is never stored — only the hash.
 */
export const oauthStatesTable = pgTable("oauth_states", {
  stateHash: text("state_hash").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertOauthStateSchema = createInsertSchema(oauthStatesTable);
export type InsertOauthState = z.infer<typeof insertOauthStateSchema>;
export type OauthState = typeof oauthStatesTable.$inferSelect;

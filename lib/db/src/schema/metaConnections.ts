import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Stores Meta (Facebook/Instagram) OAuth connections.
 * Tokens are stored AES-256-GCM encrypted at rest.
 *
 * Single active connection enforced by singletonKey = 'default' with a
 * unique index. Only the disconnect flow can release it; a new OAuth flow
 * by the same user updates in place, a different user is rejected at the
 * service layer.
 */
export const metaConnectionsTable = pgTable(
  "meta_connections",
  {
    metaUserId: text("meta_user_id").primaryKey(),
    /**
     * Constant value 'default' on every row; unique index prevents a
     * second row being inserted, providing a race-safe singleton slot.
     */
    singletonKey: text("singleton_key").notNull().default("default"),
    adminName: text("admin_name").notNull(),
    // AES-256-GCM encrypted user access token: "iv:authTag:ciphertext" (all hex)
    encryptedUserToken: text("encrypted_user_token").notNull(),
    // AES-256-GCM encrypted long-lived user token
    encryptedLongLivedToken: text("encrypted_long_lived_token"),
    // Serialized JSON of page tokens: Array<{pageId, encryptedToken}>
    encryptedPageTokensJson: text("encrypted_page_tokens_json"),
    // Serialized JSON of asset metadata (pages + instagram accounts)
    assetsJson: text("assets_json").notNull().default("[]"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("meta_connections_user_id_idx").on(t.metaUserId),
    // Enforces at most one row in the table at the DB level
    uniqueIndex("meta_connections_singleton_key_idx").on(t.singletonKey),
  ],
);

export const insertMetaConnectionSchema =
  createInsertSchema(metaConnectionsTable).omit({
    createdAt: true,
    updatedAt: true,
  });
export type InsertMetaConnection = z.infer<typeof insertMetaConnectionSchema>;
export type MetaConnection = typeof metaConnectionsTable.$inferSelect;

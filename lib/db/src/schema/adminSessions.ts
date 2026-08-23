import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { metaConnectionsTable } from "./metaConnections";

/**
 * Stores SHA-256 hashes of random opaque session tokens.
 * The raw session token is stored only in an HttpOnly SameSite=Lax cookie.
 * Sessions expire after 30 days.
 * FK to meta_connections ensures sessions are cascade-deleted when a
 * connection is removed (e.g. on disconnect).
 */
export const adminSessionsTable = pgTable(
  "admin_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    metaUserId: text("meta_user_id")
      .notNull()
      .references(() => metaConnectionsTable.metaUserId, {
        onDelete: "cascade",
      }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("admin_sessions_meta_user_id_idx").on(t.metaUserId)],
);

export const insertAdminSessionSchema = createInsertSchema(adminSessionsTable);
export type InsertAdminSession = z.infer<typeof insertAdminSessionSchema>;
export type AdminSession = typeof adminSessionsTable.$inferSelect;

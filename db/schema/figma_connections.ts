// db/schema/figma_connections.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, profiles } from "./users";

export const figmaConnections = pgTable("figma_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // Tokens are encrypted at rest using AES-256-GCM via lib/encrypt.ts.
  // Stored format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
  // Requires FIGMA_TOKEN_ENCRYPTION_KEY env var (64 hex chars / 32 bytes).
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  scopes: text("scopes"),
  connectedById: uuid("connected_by_id")
    .references(() => profiles.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FigmaConnection = typeof figmaConnections.$inferSelect;
export type NewFigmaConnection = typeof figmaConnections.$inferInsert;

// db/schema/figma_connections.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, profiles } from "./users";

export const figmaConnections = pgTable("figma_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  // TODO(security): encrypt these tokens at rest before onboarding paying customers.
  // Use AES-256-GCM with a secret key stored in env (e.g. FIGMA_TOKEN_ENCRYPTION_KEY).
  // Tokens are currently stored as plaintext.
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

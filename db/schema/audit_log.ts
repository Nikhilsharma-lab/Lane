import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { organizations } from "./users";

const inet = customType<{ data: string }>({
  dataType() {
    return "inet";
  },
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // FK to auth.users applied in raw SQL (cross-schema).
    actorUserId: uuid("actor_user_id"),
    eventType: text("event_type").notNull(),
    eventData: jsonb("event_data").notNull().default({}),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workspaceTimeIdx: index("audit_log_workspace_time").on(
      table.workspaceId,
      table.createdAt.desc(),
    ),
    actorTimeIdx: index("audit_log_actor_time").on(
      table.actorUserId,
      table.createdAt.desc(),
    ),
    eventTypeIdx: index("audit_log_event_type").on(
      table.eventType,
      table.createdAt.desc(),
    ),
  }),
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

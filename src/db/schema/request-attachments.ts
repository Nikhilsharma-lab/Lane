import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { requests } from "./requests";
import { organizations, profiles } from "./users";

export const requestAttachments = pgTable(
  "request_attachments",
  {
    id: uuid("id").primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => profiles.id),
    storagePath: text("storage_path").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("request_attachments_storage_path_unique").on(
      table.storagePath
    ),
    index("request_attachments_request_id_idx").on(table.requestId),
    index("request_attachments_org_id_idx").on(table.orgId),
    check(
      "request_attachments_size_check",
      sql`${table.sizeBytes} > 0 AND ${table.sizeBytes} <= 10485760`
    ),
  ]
);

export type RequestAttachment = typeof requestAttachments.$inferSelect;
export type NewRequestAttachment = typeof requestAttachments.$inferInsert;

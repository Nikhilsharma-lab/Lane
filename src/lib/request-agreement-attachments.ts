import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { MemberAuth } from "./auth-guard";
import type { AgreementTx } from "./request-agreement-store";
/** Walk only same-workspace predecessor links; each source retains its own guest guard. */
export async function agreementAttachments(
  connection: AgreementTx | typeof db,
  requestId: string,
  auth: MemberAuth,
) {
  return connection.execute<{
    id: string;
    fileName: string;
    sourceId: string;
  }>(sql`
  with recursive sources as (
   select r.id, array[r.id] as visited from requests r
    where r.id=${requestId}::uuid and r.org_id=${auth.orgId} and (${auth.role !== "guest"} or r.created_by=${auth.userId})
   union all
   select r.id, s.visited || r.id from sources s
    join request_replacements l on l.replacement_id=s.id and l.org_id=${auth.orgId}
    join requests r on r.id=l.original_id and r.org_id=l.org_id
    where not r.id=any(s.visited) and (${auth.role !== "guest"} or r.created_by=${auth.userId})
  ) select a.id, a.file_name as "fileName", a.request_id as "sourceId" from request_attachments a
   join sources s on s.id=a.request_id where a.org_id=${auth.orgId} and a.uploaded_at is not null order by a.id
 `);
}

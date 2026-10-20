import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { requestSchema } from "@/lib/request-schema";
it.skipIf(!process.env.LANE_RESET_FIXTURES)("validates every explicitly supplied dummy Request against the New Request schema", () => {
 const rows=JSON.parse(readFileSync(process.env.LANE_RESET_FIXTURES!,"utf8"));
 expect(rows).toHaveLength(12);
 for(const row of rows) expect(requestSchema.safeParse(row).success, row.title).toBe(true);
 for(const status of ["open","in_progress","done"])expect(rows.filter((row:{status:string})=>row.status===status)).toHaveLength(4);
});

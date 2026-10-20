import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ role: "org:member", queries: [] as {sql:string; params:unknown[]}[], responses: [] as unknown[][][] }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId:"user_member", orgId:"org_a", orgRole:state.role }) }));
vi.mock("@/db", async () => {
 const { drizzle } = await import("drizzle-orm/pg-proxy"); const schema = await import("@/db/schema");
 return { ...schema, db:drizzle(async (sql,params) => { state.queries.push({sql,params}); return {rows:state.responses.shift() ?? []}; }, {schema}) };
});
beforeEach(() => {state.role="org:member";state.queries=[];state.responses=[];});
it("denies guest label creation and a mismatched workspace before querying", async () => {
 const {createLabel}=await import("./label-actions"); state.role="org:guest";
 expect(await createLabel({name:"Feedback",colour:"green"},{orgId:"org_a"})).toMatchObject({success:false});
 state.role="org:member";
 expect(await createLabel({name:"Feedback",colour:"green"},{orgId:"org_b"})).toMatchObject({success:false});
 expect(state.queries).toHaveLength(0);
});
it("uses the session creator and reuses case-insensitive duplicates", async () => {
 const {createLabel}=await import("./label-actions"); state.responses=[[],[["11111111-1111-4111-8111-111111111111","Feedback","green"]]];
 expect(await createLabel({name:" feedback ",colour:"blue"},{orgId:"org_a"})).toMatchObject({success:true,label:{name:"Feedback",colour:"green"}});
 expect(state.queries[0].params).toContain("user_member"); expect(state.queries[0].params).toContain("org_a");
 expect(state.queries[1].params).toContain("org_a");
});
it("reuses defaults without inserting duplicate catalogue entries", async () => {
 const {createLabel}=await import("./label-actions");
 expect(await createLabel({name:" BUG ",colour:"blue"},{orgId:"org_a"})).toMatchObject({success:true,label:{id:"bug",colour:"red"}});
 expect(state.queries).toHaveLength(0);
});
it("rejects an unavailable Project before inserting a label", async () => {
 const {createLabel}=await import("./label-actions");
 expect(await createLabel({name:"Navigation",colour:"green",projectId:"22222222-2222-4222-8222-222222222222"},{orgId:"org_a"})).toMatchObject({success:false});
 expect(state.queries).toHaveLength(1);
 expect(state.queries[0].sql).toContain("projects");
 expect(state.queries[0].params).toContain("org_a");
});
it("saves Project scope with the session identity", async () => {
 const {createLabel}=await import("./label-actions");
 const projectId="22222222-2222-4222-8222-222222222222";
 state.responses=[[[projectId]],[["11111111-1111-4111-8111-111111111111","Navigation","green",projectId]]];
 expect(await createLabel({name:"Navigation",colour:"green",projectId},{orgId:"org_a"})).toMatchObject({success:true,label:{projectId}});
 expect(state.queries[1].params).toContain(projectId);
 expect(state.queries[1].params).toContain("user_member");
});

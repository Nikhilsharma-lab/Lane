import postgres from "postgres";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { afterAll, beforeAll, expect, it } from "vitest";
import { loadWorkspaceSearch, workspaceSearchInputSchema } from "@/lib/data/search";
import { randomUUID } from "node:crypto";
let sql:ReturnType<typeof postgres>;
const org="org_label_test",other="org_label_other",user="user_label_test",label=randomUUID();
beforeAll(async()=>{
 const url=new URL(process.env.DATABASE_URL!);if(url.hostname!=="localhost"&&url.hostname!=="127.0.0.1"||!TEST_DATABASE_PATH.test(url.pathname))throw Error("Local tests only");
 sql=postgres(url.toString());
 await sql`insert into organizations(id,name,slug) values (${org},'Labels','labels-test'),(${other},'Other','labels-other')`;
 await sql`insert into profiles(id,full_name,email) values (${user},'Test','labels@example.test')`;
 await sql`insert into workspace_labels(id,org_id,name,colour,created_by) values (${label},${org},'Customer feedback','green',${user})`;
});
afterAll(async()=>{if(sql){await sql`delete from organizations where id in (${org},${other})`;await sql`delete from profiles where id=${user}`;await sql.end();}});
it("saves multiple labels and removes them without altering context or blank measurements",async()=>{
 const [request]=await sql`insert into requests(org_id,title,description,created_by,request_type,affected_people) values (${org},'Saved title','Saved description',${user},'bug','Saved context') returning *`;
 expect(request.label_keys).toEqual(['bug']);
 await sql`update requests set label_keys=${['bug',label]} where id=${request.id}`;
 const [saved]=await sql`select * from requests where id=${request.id}`;
 expect(saved.label_keys).toEqual(['bug',label]);expect(saved.affected_people).toBe('Saved context');expect(saved.expected_impact).toBeNull();expect(saved.measurement_draft).toBeNull();
 await sql`update requests set label_keys=${[]} where id=${request.id}`;
 const [cleared]=await sql`select * from requests where id=${request.id}`;expect(cleared.label_keys).toEqual([]);expect(cleared.request_type).toBeNull();
});
it("rejects cross-workspace labels even for direct SQL writes",async()=>{
 await expect(sql`insert into requests(org_id,title,description,created_by,label_keys) values (${other},'Saved title','Saved description',${user},${[label]})`).rejects.toMatchObject({code:'23514'});
});
it("enforces case-insensitive catalogue uniqueness",async()=>{
 await expect(sql`insert into workspace_labels(org_id,name,colour,created_by) values (${org},'customer feedback','blue',${user})`).rejects.toMatchObject({code:'23505'});
});
it("searches any selected label and counts each label independently",async()=>{
 const [request]=await sql`insert into requests(org_id,title,description,created_by,label_keys) values (${org},'Searchable labels','Saved description',${user},${['bug',label]}) returning id`;
 const found=await loadWorkspaceSearch({orgId:org,userId:user,role:'member'},workspaceSearchInputSchema.parse({query:'Searchable',types:[label]}));
 expect(found.requests.items.map(row=>row.id)).toEqual([request.id]);
 expect(found.facets?.types).toMatchObject({bug:1,[label]:1});
});
it("keeps Project labels scoped and rejects changing Project until they are removed",async()=>{
 const project=randomUUID(), scoped=randomUUID();
 await sql`insert into projects(id,org_id,name,created_by) values (${project},${org},'Label project',${user})`;
 await sql`insert into workspace_labels(id,org_id,name,colour,created_by,project_id) values (${scoped},${org},'Customer feedback','blue',${user},${project})`;
 const [request]=await sql`insert into requests(org_id,title,description,created_by,project_id,label_keys) values (${org},'Scoped','Preserved',${user},${project},${[scoped,label]}) returning id`;
 await expect(sql`update requests set project_id=null where id=${request.id}`).rejects.toMatchObject({code:'23514'});
 await sql`update requests set project_id=null,label_keys=${[label]} where id=${request.id}`;
 const [saved]=await sql`select description,label_keys,project_id from requests where id=${request.id}`;
 expect(saved).toMatchObject({description:'Preserved',label_keys:[label],project_id:null});
 await expect(sql`insert into workspace_labels(org_id,name,colour,created_by,project_id) values (${other},'Invalid','blue',${user},${project})`).rejects.toMatchObject({code:'23503'});
});

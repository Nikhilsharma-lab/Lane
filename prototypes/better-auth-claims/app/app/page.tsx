// PROTOTYPE (#344). A signed-in page: session + role read once per request, and
// server actions that re-derive identity from the session, never from arguments.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { queries, sql } from "@/lib/db";
import { currentSession, guardActiveMember } from "@/lib/guard";

async function rename(orgId: string, form: FormData) {
  "use server";
  const m = await guardActiveMember(orgId);
  if (!m) redirect("/app?msg=signed-out-or-not-a-member");
  if (m.role !== "admin") redirect(`/app?msg=refused-as-${m.role}`);
  await auth.api.updateOrganization({ body: { organizationId: orgId, data: { name: String(form.get("name")) } }, headers: await headers() });
  revalidatePath("/app");
  redirect("/app?msg=renamed");
}

async function signOut() {
  "use server";
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}

// raw queries on this page are counted by hand: the first-membership lookup always runs
const orgId_queries = (_active: string | null | undefined) => 1;

export default async function AppPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const t0 = performance.now();
  const session = await currentSession();
  if (!session) redirect("/login");
  queries.count += orgId_queries(session.session.activeOrganizationId);
  const [first] = await sql`select organization_id from member where user_id = ${session.user.id} order by created_at limit 1`;
  const orgId = session.session.activeOrganizationId ?? first?.organization_id;
  const m = orgId ? await guardActiveMember(orgId) : null;
  const [org] = orgId ? await sql`select name from organizations where id = ${orgId}` : [];
  if (orgId) queries.count++;
  const ms = performance.now() - t0;
  const { msg } = await searchParams;
  return (
    <main>
      <h1 id="signed-in">Signed in as {session.user.name}</h1>
      <p>Workspace: <span id="org">{org?.name ?? "none"}</span>; role: <span id="role">{m?.role ?? "not a member"}</span></p>
      <p>Session + role read in <span id="read-ms">{ms.toFixed(1)}</span> ms on the server.</p>
      {msg && <p id="msg">{msg}</p>}
      {orgId && <form action={rename.bind(null, orgId)}><input name="name" defaultValue={org?.name} /><button id="rename">Rename</button></form>}
      <form action={signOut}><button id="sign-out">Sign out</button></form>
    </main>
  );
}

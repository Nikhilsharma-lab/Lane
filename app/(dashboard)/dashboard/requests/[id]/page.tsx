import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let debugInfo = "";

  try {
    const { id } = await params;
    debugInfo += `id=${id} `;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    debugInfo += `user=${user.id.slice(0, 8)} `;

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id));
    if (!profile) redirect("/login");
    debugInfo += `profile=ok `;

    const [request] = await db
      .select()
      .from(requests)
      .where(eq(requests.id, id));
    if (!request || request.orgId !== profile.orgId) notFound();
    debugInfo += `request=${request.title.slice(0, 20)} `;

    return (
      <div className="min-h-screen bg-zinc-950 text-white p-10">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold mt-6">{request.title}</h1>
        <p className="text-sm text-zinc-500 mt-2">
          Status: {request.status} · Stage: {request.stage}
        </p>
        <p className="text-sm text-zinc-400 mt-4 whitespace-pre-wrap">
          {request.description}
        </p>
        <p className="text-xs text-zinc-700 mt-8 font-mono">
          debug: {debugInfo}
        </p>
      </div>
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);
    const stack =
      err instanceof Error ? err.stack?.slice(0, 500) : "";

    return (
      <div className="min-h-screen bg-zinc-950 text-white p-10">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← Back
        </Link>
        <h1 className="text-xl font-semibold text-red-400 mt-6">
          Page Error (caught)
        </h1>
        <p className="text-sm text-zinc-400 mt-2">Debug: {debugInfo}</p>
        <pre className="text-xs text-red-300 mt-4 whitespace-pre-wrap bg-zinc-900 p-4 rounded-lg">
          {message}
          {"\n\n"}
          {stack}
        </pre>
      </div>
    );
  }
}

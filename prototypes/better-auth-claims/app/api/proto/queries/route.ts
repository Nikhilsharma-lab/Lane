// PROTOTYPE (#344). Exposes the server's query counter to the browser walk.
import { queries } from "@/lib/db";
export const dynamic = "force-dynamic";
export function GET() { return Response.json({ count: queries.count }); }

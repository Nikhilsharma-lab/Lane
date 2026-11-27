import { handleAuthRequest } from "@/lib/auth-server"
import { betterAuthServer } from "@/lib/feature-switches"

/**
 * #371 (spec #369): Better Auth's route. While BETTER_AUTH_SECRET is unset or blank every call gets a plain
 * 404 and nothing is built, so no database connection opens. The secret isn't set on staging or production until
 * increment 6.
 */
async function handle(request: Request): Promise<Response> {
  const config = betterAuthServer()
  if (!config.on) return new Response(null, { status: 404 })
  return handleAuthRequest(config, request)
}

export const GET = handle
export const POST = handle

/** #377: Cloudflare Turnstile's public site key, which Lane's auth screens render the human check with. Optional. */
export const TURNSTILE_SITE_KEY_NAME = "NEXT_PUBLIC_TURNSTILE_SITE_KEY"

/**
 * The site key, or null when it isn't set. Next writes the value into the browser bundle at build time, which is why
 * the name is spelled out here rather than read through the constant above.
 */
export function turnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null
}

// Explicit identities, not substring matches or a production bypass flag.
export const STAGING_REF = "jznepeqghjixcrpuddym";

/**
 * SHA-256, in lowercase hex, of Lane Staging's BETTER_AUTH_SECRET as dotenv reads it. Only the fingerprint is
 * committed (#399). The secret is in the git-ignored staging env file, and increment 6 sets the same value on Vercel
 * staging.
 */
export const STAGING_AUTH_SECRET_SHA256 = "fd50bebe99b574fcd074c8d30803a82d60c58ce1f255659a32d4f0374e93a382";

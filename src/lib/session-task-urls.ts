import { SIGN_IN_URL } from "./auth-return-address";

/** Where Lane resumes each Clerk session task: ClerkProvider's `taskUrls` (src/app/layout.tsx). */
export const SESSION_TASK_URLS = {
  "choose-organization": SIGN_IN_URL,
  "reset-password": "/reset-password",
} as const;

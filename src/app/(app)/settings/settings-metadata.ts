import type { Metadata } from "next";

/**
 * #271 (A114): every Settings page's tab reads "Settings · Lane". Each page re-exports this rather than a Settings
 * layout setting it: a layout's title would outrank "Page not found" on a missing /settings/… address or Metric.
 */
export const metadata: Metadata = { title: "Settings" };

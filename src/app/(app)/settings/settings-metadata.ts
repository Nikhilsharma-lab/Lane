import type { Metadata } from "next";

/**
 * #271 (A114): every Settings page's tab reads "Settings · Lane". Each page exports it as its metadata rather than a Settings
 * layout setting it: a layout's title would outrank "Page not found" on a missing /settings/… address or Metric.
 */
export const settingsMetadata: Metadata = { title: "Settings" };

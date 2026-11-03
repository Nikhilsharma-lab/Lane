import type { Metadata } from "next";

// #271 (A114): every Settings page's tab reads "Settings · Lane".
export const metadata: Metadata = { title: "Settings" };

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

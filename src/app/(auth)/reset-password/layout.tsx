import type { Metadata } from "next";

// #271 (A114): the page itself is a client component, so its tab name ("Reset password · Lane") lives here.
export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}

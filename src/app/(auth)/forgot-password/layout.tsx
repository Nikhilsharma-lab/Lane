import type { Metadata } from "next";

// #271 (A114): the page itself is a client component, so its tab name ("Forgot password · Lane") lives here.
export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}

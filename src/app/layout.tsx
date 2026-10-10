import type { Metadata } from "next";
import { fontVariables } from "@/lib/fonts";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastStack, ToastStackProvider } from "@/components/arc/toast-stack/toast-stack";
import "@/components/arc/foundation.css";
import "./globals.css";
// Linear visual values through Arc's public token hooks. Activated for
// production by Nikhil on 2026-10-09 (docs/design-system/linear-primitives.md).
import "@/styles/lane-primitives.css";
import "@/styles/lane-arc-theme.css";

export const metadata: Metadata = {
  title: "Lane",
  description: "Collect design requests, clarify the problem, and track the work from Open to Done.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-visual-system="lane"
      data-ui-state-contract="semantic"
      suppressHydrationWarning
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProvider
          signInUrl="/login"
          signUpUrl="/signup"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/onboarding"
          allowedRedirectOrigins={[
            process.env.NEXT_PUBLIC_APP_URL,
            "http://localhost:3000",
            "http://localhost:3100",
            "https://lane-staging.vercel.app",
            "https://app.uselane.app",
          ].filter((origin): origin is string => Boolean(origin))}
          taskUrls={{
            "choose-organization": "/login",
            "reset-password": "/reset-password",
          }}
        >
          <ThemeProvider
            attribute={["class", "data-theme"]}
            defaultTheme="system"
            enableSystem
            enableColorScheme
            disableTransitionOnChange
          >
            <ToastStackProvider>
              {children}
              <ToastStack />
            </ToastStackProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

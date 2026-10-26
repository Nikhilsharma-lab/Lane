import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import { ClerkProvider } from "@clerk/nextjs";
import { ui } from "@clerk/ui";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastStack, ToastStackProvider } from "@/components/arc/toast-stack/toast-stack";
import { SpeedInsights } from "@/components/speed-insights";
import { WebVitals } from "@/components/web-vitals";
import { reportsSpeedInsights } from "@/lib/speed-insights";
// The one theme file, Arc's foundation (in a lower cascade layer) and the bridge all load through
// globals.css; src/styles/theme.css explains its two halves.
import "./globals.css";
// Styles used by the root error, global-error and not-found boundaries. Next.js preloads a boundary's CSS on
// every page so the fallback paints instantly, and Chrome then warns that the file went unused. Loading these
// small modules here makes them part of the layout's own stylesheet, so the boundaries need no separate file.
import "@/components/arc/button/button.module.css";
import "@/components/arc/empty-state/empty-state.module.css";
import "@/components/shell/page-strip.module.css";
import "./app-frame.module.css";
import tabColours from "./theme-color.json";

// The favicon, icons, manifest, tab colours and Open Graph image beside this file are generated from the Lane
// mark and the theme file by scripts/brand/brand-assets.mjs (plan §6.4, O4, #96). Open Graph and Twitter need absolute image
// URLs; without a parseable NEXT_PUBLIC_APP_URL, Next falls back to its own deployment URL.
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const description = "Collect design requests, clarify the problem, and track the work from Open to Done.";

export const metadata: Metadata = {
  metadataBase: appUrl && URL.canParse(appUrl) ? new URL(appUrl) : undefined,
  title: "Lane",
  description,
  openGraph: { type: "website", siteName: "Lane", title: "Lane", description },
  twitter: { card: "summary_large_image", title: "Lane", description },
};

// The browser tab starts on the device colour scheme with the theme's light and dark backgrounds;
// TabColour (in ThemeProvider) then switches it to Lane's resolved theme, the saved Profile choice.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: tabColours.light },
    { media: "(prefers-color-scheme: dark)", color: tabColours.dark },
  ],
};

// Origins Clerk may redirect back to after sign-in, sign-up and invite flows.
// NEXT_PUBLIC_APP_URL stays first. Localhost is only trusted outside the
// production deployment (plan 6.1, G10).
const isProductionDeployment = process.env.VERCEL_ENV === "production";
const allowedRedirectOrigins = Array.from(
  new Set(
    [
      process.env.NEXT_PUBLIC_APP_URL,
      ...(isProductionDeployment ? [] : ["http://localhost:3000", "http://localhost:3100"]),
      "https://lane-staging.vercel.app",
      "https://app.uselane.app",
    ].filter((origin): origin is string => Boolean(origin)),
  ),
);

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
        {/* Plan item 1.15b: logs Web Vitals in development; posts nothing in production. */}
        <WebVitals />
        {/* Decision 8.13 (leftover plan L3): Speed Insights field metrics from app.uselane.app only, so
            staging, previews, local builds and tests send nothing. */}
        {reportsSpeedInsights({ VERCEL_ENV: process.env.VERCEL_ENV, NEXT_PUBLIC_APP_URL: appUrl }) ? <SpeedInsights /> : null}
        {/* `ui` pins Clerk's components to the installed @clerk/ui version instead of the CDN build,
            so the members table's .cl-* layout rules (clerk-profile.module.css) cannot break silently
            and Clerk stops logging its structural_css_pin_clerk_ui warning on every page.
            `prefetchUI={false}` drops the CDN preload of ui.browser.js, which the bundled UI never uses. */}
        <ClerkProvider
          ui={ui}
          prefetchUI={false}
          signInUrl="/login"
          signUpUrl="/signup"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/onboarding"
          allowedRedirectOrigins={allowedRedirectOrigins}
          taskUrls={{
            "choose-organization": "/login",
            "reset-password": "/reset-password",
          }}
        >
          <ThemeProvider>
            <ToastStackProvider>
              {children}
              {/* Plan item 2.4 (decision 8.22): toasts swap text and icons without a blur. The region is
                  "Messages (Alt+T)", as the ? overlay names it, apart from the sidebar's Inbox. */}
              <ToastStack morph="plain" label="Messages" />
            </ToastStackProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}

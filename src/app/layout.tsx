import type { Metadata, Viewport } from "next";
import { fontVariables } from "@/lib/fonts";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastStack, ToastStackProvider } from "@/components/arc/toast-stack/toast-stack";
import { SpeedInsights } from "@/components/speed-insights";
import { WebVitals } from "@/components/web-vitals";
import { ReducedMotion } from "@/components/motion/reduced-motion";
import { MotionFeatures } from "@/components/motion/motion-features";
import { LoadingFeel } from "@/components/loading/loading-feel";
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
  // #271 (A114): each page names its tab "Page · Lane"; plain "Lane" stays the fallback and the sharing cards' title.
  title: { default: "Lane", template: "%s · Lane" },
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
        {/* #262: with motion turned off on the device, every Motion animation is instant (A122). */}
        <ReducedMotion />
        {/* #262: what was clicked shows as pressed, and content that replaces a seen placeholder fades in. */}
        <LoadingFeel />
        {/* Plan item 1.15b: logs Web Vitals in development; posts nothing in production. */}
        <WebVitals />
        {/* Decision 8.13 (leftover plan L3): Speed Insights field metrics from app.uselane.app only, so
            staging, previews, local builds and tests send nothing. */}
        {reportsSpeedInsights({ VERCEL_ENV: process.env.VERCEL_ENV, NEXT_PUBLIC_APP_URL: appUrl }) ? <SpeedInsights /> : null}
        {/* #266: Motion's renderer, animations and gestures come with every page; the (app) layout adds layout and drag. */}
        <MotionFeatures>
          <ThemeProvider>
            <ToastStackProvider>
              {children}
              {/* Plan item 2.4 (decision 8.22): toasts swap text and icons without a blur. The region is
                  "Messages (Alt+T)", as the ? overlay names it, apart from the sidebar's Inbox. */}
              <ToastStack morph="plain" label="Messages" />
            </ToastStackProvider>
          </ThemeProvider>
        </MotionFeatures>
      </body>
    </html>
  );
}

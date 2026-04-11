import type { Metadata } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "next-themes";
import { Geist_Mono, Geist } from "next/font/google";

const geistHeading = Geist({subsets:['latin'],variable:'--font-heading'});

const geistMono = Geist_Mono({subsets:['latin'],variable:'--font-mono'});

const sans = GeistSans;
const mono = GeistMono;

export const metadata: Metadata = {
  title: 'Lane',
  description: 'Multi-persona DesignOps platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={cn(sans.variable, mono.variable, "font-mono", geistMono.variable, geistHeading.variable)}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  )
}

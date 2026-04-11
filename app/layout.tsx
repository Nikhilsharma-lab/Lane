import type { Metadata } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { cn } from "@/lib/utils";

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
    <html lang="en" className={cn(sans.variable, mono.variable, "font-mono")}>
      <body>{children}<SpeedInsights /></body>
    </html>
  )
}

import type { Metadata } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Inter, Geist_Mono, Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geistMono = Geist_Mono({subsets:['latin'],variable:'--font-mono'});

const geistHeading = Geist({subsets:['latin'],variable:'--font-heading'});

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
    <html lang="en" className={cn( sans.variable, mono.variable, "font-mono", geistMono.variable, geistHeading.variable)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
      </head>
      <body>{children}<SpeedInsights /></body>
    </html>
  )
}

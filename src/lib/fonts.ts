import { Geist, Inter, Geist_Mono } from "next/font/google"

// Arc's official typography: Geist for display headings, Inter for controls and body.
export const sans = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" })
// Lane's theme points --font-display at Inter (src/styles/lane-arc-theme.css),
// so Geist is declared for Arc's token but never painted. No preload link for
// it (plan item 1.13); the variable stays so the Arc fallback keeps working.
export const display = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap", preload: false })
export const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" })
export const fontVariables = `${sans.variable} ${display.variable} ${mono.variable}`

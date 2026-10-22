import { Geist, Geist_Mono } from "next/font/google"

// Lane's typeface is Geist with Geist Mono for code (decision 2026-10-13). next/font registers the
// faces under the family names "Geist" and "Geist Mono", which the theme file's tweakcn font
// stacks (src/styles/theme.css) name directly, so this module must stay imported by the layouts.
export const sans = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" })
// No screen renders mono text yet, so preloading it only made Chrome warn that the file went unused.
// The browser still fetches it on first use.
export const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap", preload: false })
export const fontVariables = `${sans.variable} ${mono.variable}`

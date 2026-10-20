import { Geist, Geist_Mono } from "next/font/google"

// Lane's typeface is Geist with Geist Mono for code (decision 2026-10-13). Supabase Studio uses
// Inter, Manrope and Source Code Pro; src/styles/supabase-tokens.css swaps in these two instead.
export const sans = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" })
// No screen renders mono text yet, so preloading it only made Chrome warn that the file went unused.
// The browser still fetches it on first use.
export const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap", preload: false })
export const fontVariables = `${sans.variable} ${mono.variable}`

import { Geist, Geist_Mono } from "next/font/google"

// Lane's typeface is Geist with Geist Mono for code (decision 2026-10-13). Supabase Studio uses
// Inter, Manrope and Source Code Pro; src/styles/supabase-tokens.css swaps in these two instead.
export const sans = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" })
export const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" })
export const fontVariables = `${sans.variable} ${mono.variable}`

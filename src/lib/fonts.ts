import { Geist, Inter, Geist_Mono } from "next/font/google"

// Arc's official typography: Geist for display headings, Inter for controls and body.
export const sans = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" })
export const display = Geist({ variable: "--font-geist", subsets: ["latin"], display: "swap" })
export const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" })
export const fontVariables = `${sans.variable} ${display.variable} ${mono.variable}`

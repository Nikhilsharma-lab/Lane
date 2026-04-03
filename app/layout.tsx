import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DesignQ',
  description: 'Multi-persona DesignOps platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
      </head>
      <body>{children}</body>
    </html>
  )
}

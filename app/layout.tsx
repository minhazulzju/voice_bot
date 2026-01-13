import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AuraVoice AI',
  description: 'A low-latency, speech-to-speech AI companion',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

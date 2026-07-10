import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tres Bandas – Pedidos',
  description: 'Plataforma operativa de pedidos Tres Bandas',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  )
}

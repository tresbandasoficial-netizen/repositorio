import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TR Original – Pedidos',
  description: 'Plataforma operativa de pedidos TR Original',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  )
}

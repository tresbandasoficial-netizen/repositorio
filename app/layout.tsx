import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

// Tipografía del sistema: Plus Jakarta Sans — sans redondeada y amable,
// el mismo estilo de Addi (títulos extra-gruesos, texto limpio).
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--fuente-app',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Tres Bandas – Pedidos',
  description: 'Plataforma operativa de pedidos Tres Bandas',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`h-full ${jakarta.variable}`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  pedidoId: string
  numeroOrden: string
}

type Dot = {
  id: number
  x: number
  y: number
  color: string
  size: number
  delay: number
  duration: number
  rect: boolean
}

const COLORS = ['#ffffff', '#bbf7d0', '#86efac', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa', '#fb923c', '#34d399']

export function PedidoSuccessOverlay({ pedidoId, numeroOrden }: Props) {
  const router = useRouter()
  const [dots, setDots] = useState<Dot[]>([])

  useEffect(() => {
    const generated: Dot[] = Array.from({ length: 65 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -(Math.random() * 30),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 7 + Math.random() * 11,
      delay: Math.random() * 900,
      duration: 1400 + Math.random() * 1200,
      rect: i % 3 === 0,
    }))
    setDots(generated)

    const t = setTimeout(() => router.push(`/pedidos/${pedidoId}`), 3200)
    return () => clearTimeout(t)
  }, [pedidoId, router])

  return (
    <>
      <style>{`
        @keyframes successExpand {
          from { clip-path: circle(0% at 50% 50%); }
          to   { clip-path: circle(160% at 50% 50%); }
        }
        @keyframes successPopIn {
          0%   { transform: scale(0) rotate(-8deg); opacity: 0; }
          65%  { transform: scale(1.18) rotate(2deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes successDrawCheck {
          to { stroke-dashoffset: 0; }
        }
        @keyframes successSlideUp {
          from { transform: translateY(36px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @keyframes successFall {
          0%   { transform: translateY(0) rotate(0deg);     opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(115vh) rotate(800deg); opacity: 0; }
        }
        @keyframes successPulse {
          0%   { transform: scale(1);    opacity: .45; }
          100% { transform: scale(1.9);  opacity: 0; }
        }
        @keyframes successFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* Full-screen green overlay */}
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #16a34a 0%, #15803d 60%, #14532d 100%)',
          animation: 'successExpand .55s cubic-bezier(.22,1,.36,1) both',
        }}
      >
        {/* Confetti */}
        {dots.map(d => (
          <div
            key={d.id}
            className="absolute pointer-events-none"
            style={{
              left: `${d.x}%`,
              top: `${d.y}%`,
              width: d.size,
              height: d.rect ? d.size * 0.5 : d.size,
              background: d.color,
              borderRadius: d.rect ? '2px' : '50%',
              opacity: 0,
              animation: `successFall ${d.duration}ms ease-in ${d.delay}ms forwards`,
            }}
          />
        ))}

        {/* Glow blobs in background */}
        <div className="absolute w-96 h-96 rounded-full bg-white/5 blur-3xl top-1/4 -left-20 pointer-events-none" />
        <div className="absolute w-80 h-80 rounded-full bg-white/5 blur-3xl bottom-1/4 -right-20 pointer-events-none" />

        {/* Circle + checkmark */}
        <div
          className="relative flex items-center justify-center"
          style={{ opacity: 0, animation: 'successPopIn .55s cubic-bezier(.34,1.56,.64,1) .45s forwards' }}
        >
          {/* Pulse rings */}
          <div
            className="absolute rounded-full border-4 border-white/40"
            style={{ width: 200, height: 200, animation: 'successPulse 1.4s ease-out 1s infinite' }}
          />
          <div
            className="absolute rounded-full border-4 border-white/25"
            style={{ width: 200, height: 200, animation: 'successPulse 1.4s ease-out 1.5s infinite' }}
          />

          {/* Inner white circle */}
          <div
            className="rounded-full bg-white/20 flex items-center justify-center"
            style={{ width: 160, height: 160, backdropFilter: 'blur(4px)' }}
          >
            <div className="rounded-full bg-white/30 flex items-center justify-center" style={{ width: 128, height: 128 }}>
              <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
                <path
                  d="M12 36 L28 54 L60 18"
                  stroke="white"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="110"
                  strokeDashoffset="110"
                  style={{ animation: 'successDrawCheck .45s ease .95s forwards' }}
                />
              </svg>
            </div>
          </div>
        </div>

        {/* "¡Pedido creado con éxito!" */}
        <div
          className="mt-10 text-center px-8"
          style={{ opacity: 0, animation: 'successSlideUp .4s ease 1s forwards' }}
        >
          <p className="text-white font-black leading-tight" style={{ fontSize: 38, letterSpacing: '-.02em' }}>
            ¡Pedido creado
          </p>
          <p className="text-white font-black leading-tight" style={{ fontSize: 38, letterSpacing: '-.02em' }}>
            con éxito!
          </p>
        </div>

        {/* Order number */}
        <div
          className="mt-5"
          style={{ opacity: 0, animation: 'successSlideUp .4s ease 1.15s forwards' }}
        >
          <span
            className="font-bold text-white/90 text-xl tracking-widest uppercase"
          >
            {numeroOrden}
          </span>
        </div>

        {/* Redirecting hint */}
        <div
          className="mt-8"
          style={{ opacity: 0, animation: 'successFadeIn .4s ease 1.6s forwards' }}
        >
          <p className="text-white/50 text-sm font-semibold tracking-wide">Abriendo el pedido…</p>
        </div>
      </div>
    </>
  )
}

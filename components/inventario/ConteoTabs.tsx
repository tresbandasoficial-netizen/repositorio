'use client'

import { useState } from 'react'
import { ConteoPanel } from './ConteoPanel'
import { CargaLotePanel } from './CargaLotePanel'
import { Barcode, Table } from 'lucide-react'

type Sede = { id: string; codigo: string; nombre: string }

// Dos formas de cargar el inventario:
// - Uno a uno: buscar/escanear, talla, cantidad (rápido con lector).
// - Planilla: tabla tipo Excel para digitar muchos productos (y crear los
//   que no existan) de una sola vez.
export function ConteoTabs({ sedes, sedeFijaId }: { sedes: Sede[]; sedeFijaId: string | null }) {
  const [tab, setTab] = useState<'uno' | 'lote'>('uno')

  const base = 'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors'

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setTab('uno')}
          className={`${base} ${tab === 'uno' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          <Barcode size={15} /> Contar uno a uno
        </button>
        <button
          onClick={() => setTab('lote')}
          className={`${base} ${tab === 'lote' ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          <Table size={15} /> Planilla (varios)
        </button>
      </div>

      {tab === 'uno'
        ? <ConteoPanel sedes={sedes} sedeFijaId={sedeFijaId} />
        : <CargaLotePanel sedes={sedes} sedeFijaId={sedeFijaId} />}
    </div>
  )
}

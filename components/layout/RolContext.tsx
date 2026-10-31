'use client'

import { createContext, useContext } from 'react'
import { MetodoPago, metodosDeSede, metodosParaRol } from '@/types'

const RolContext = createContext<string | null>(null)

export function RolProvider({ rol, children }: { rol: string; children: React.ReactNode }) {
  return <RolContext.Provider value={rol}>{children}</RolContext.Provider>
}

export function useRol() {
  return useContext(RolContext)
}

// Métodos de pago que el usuario conectado puede elegir en una sede.
export function useMetodosSede(sedeCodigo?: string | null): MetodoPago[] {
  return metodosParaRol(metodosDeSede(sedeCodigo), useRol())
}

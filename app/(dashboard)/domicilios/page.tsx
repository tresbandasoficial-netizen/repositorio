import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDomiciliosPorFecha, getCuadreDia, getCuadreSemana, getFechasConDomicilios } from '@/lib/queries/domicilios'
import { DomiciliosCliente } from '@/components/domicilios/DomiciliosCliente'

export default async function DomiciliosPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!usuario) redirect('/login')
  if (usuario.rol === 'visor') redirect('/pedidos')

  const { fecha: fechaParam } = await searchParams
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
  const fecha = fechaParam ?? hoy

  const [domicilios, cuadre, cuadreSemana, fechasDisponibles] = await Promise.all([
    getDomiciliosPorFecha(fecha),
    getCuadreDia(fecha),
    getCuadreSemana(fecha),
    getFechasConDomicilios(),
  ])

  // Asegurar que "hoy" siempre esté en el selector
  const todasFechas = [...new Set([hoy, ...fechasDisponibles])]

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Domicilios</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Registro diario de domicilios — Exneider y Servigo
        </p>
      </div>

      <DomiciliosCliente
        fecha={fecha}
        domicilios={domicilios}
        cuadre={cuadre}
        cuadreSemana={cuadreSemana}
        isAdmin={usuario.rol === 'admin'}
        fechasDisponibles={todasFechas}
      />
    </div>
  )
}

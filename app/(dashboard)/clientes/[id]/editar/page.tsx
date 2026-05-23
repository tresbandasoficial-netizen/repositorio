import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getClienteDetalle } from '@/lib/queries/clientes'
import { EditarClienteForm } from '@/components/clientes/EditarClienteForm'

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params
  const cliente = await getClienteDetalle(id)
  if (!cliente) notFound()

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/clientes/${id}`} className="text-gray-400 hover:text-gray-600 text-sm">
          ← {cliente.nombre}
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Editar cliente</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <EditarClienteForm cliente={cliente} />
      </div>
    </div>
  )
}

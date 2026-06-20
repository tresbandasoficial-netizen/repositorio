import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AsistenteCliente } from '@/components/asistente/AsistenteCliente'

export default async function AsistentePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!usuario || usuario.rol === 'visor') redirect('/pedidos')

  if (!process.env.ANTHROPIC_API_KEY) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
          <p className="font-bold text-amber-900 text-lg">Falta la API Key de Claude</p>
          <p className="text-amber-800 text-sm mt-2">
            Para activar el asistente, agrega <code className="bg-amber-100 px-1 rounded font-mono">ANTHROPIC_API_KEY</code> en las variables de entorno de Vercel.
          </p>
          <ol className="text-sm text-amber-800 mt-3 space-y-1 list-decimal ml-4">
            <li>Ve a <strong>console.anthropic.com</strong> y crea una API Key</li>
            <li>En Vercel → tu proyecto → Settings → Environment Variables</li>
            <li>Agrega <code className="bg-amber-100 px-1 rounded font-mono">ANTHROPIC_API_KEY</code> con el valor de la key</li>
            <li>Redeploy</li>
          </ol>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6 max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900">Asistente IA</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Revisa pedidos pendientes, recibe alertas y haz preguntas en lenguaje natural
        </p>
      </div>
      <AsistenteCliente />
    </div>
  )
}

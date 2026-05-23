import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { InvitarUsuarioForm } from '@/components/usuarios/InvitarUsuarioForm'
import { ToggleActivoButton } from '@/components/usuarios/ToggleActivoButton'
import { formatFecha } from '@/lib/utils/format'

export default async function UsuariosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuarioActual } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (usuarioActual?.rol !== 'admin') redirect('/dashboard')

  const [{ data: usuarios }, { data: sedes }] = await Promise.all([
    supabase
      .from('usuarios')
      .select('id, nombre, email, rol, activo, creado_en, sedes(codigo, nombre)')
      .order('creado_en', { ascending: true }),
    supabase
      .from('sedes')
      .select('id, codigo, nombre')
      .order('nombre'),
  ])

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Usuarios</h1>
        <p className="text-sm text-gray-500 mt-0.5">Gestiona los asesores y administradores</p>
      </div>

      {/* Lista de usuarios */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">
            Usuarios activos e inactivos
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Nombre</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Rol</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Sede</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Desde</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(usuarios ?? []).map((u: any) => (
                <tr key={u.id} className={u.activo ? '' : 'opacity-50'}>
                  <td className="px-6 py-3">
                    <p className="font-medium text-gray-900">{u.nombre}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.rol === 'admin'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {u.rol}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {u.sedes ? `${u.sedes.nombre} (${u.sedes.codigo})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {formatFecha(u.creado_en)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${u.activo ? 'text-green-600' : 'text-gray-400'}`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ToggleActivoButton
                      usuarioId={u.id}
                      activo={u.activo}
                      esMismoUsuario={u.id === user.id}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Invitar nuevo usuario */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">Invitar nuevo usuario</h2>
        </CardHeader>
        <CardContent>
          <InvitarUsuarioForm sedes={sedes ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}

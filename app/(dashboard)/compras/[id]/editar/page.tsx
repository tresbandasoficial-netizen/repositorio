import { notFound, redirect } from 'next/navigation'
import { BotonVolver } from '@/components/ui/BotonVolver'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { EditarCompraForm } from '@/components/compras/EditarCompraForm'

export default async function EditarCompraPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!usuario || usuario.rol !== 'admin') redirect('/dashboard')

  const { id } = await params

  const [{ data: compra }, { data: cuentasRaw }, { data: itemsRaw }] = await Promise.all([
    supabase
      .from('compras')
      .select('id, tipo, proveedor, fecha, numero_factura, total_usd, trm, total_cop, notas, cuenta_id')
      .eq('id', id)
      .single(),
    supabase
      .from('cuentas')
      .select('id, nombre')
      .eq('activa', true)
      .neq('tipo', 'credito')
      .order('orden'),
    supabase
      .from('compra_items')
      .select('id, codigo, descripcion, marca, talla, cantidad, costo_unitario_cop, destino, articulo_id, pedido_item_indice, pedidos(numero_orden)')
      .eq('compra_id', id)
      .order('creado_en'),
  ])

  if (!compra) notFound()

  const cuentas = (cuentasRaw ?? []) as Array<{ id: string; nombre: string }>

  const itemsIniciales = (itemsRaw ?? []).map((it: any) => {
    const pedido = Array.isArray(it.pedidos) ? it.pedidos[0] : it.pedidos
    const numeroOrden = pedido?.numero_orden ?? ''
    return {
      id:                 it.id as string,
      codigo:             (it.codigo as string) ?? '',
      descripcion:        (it.descripcion as string) ?? '',
      marca:              (it.marca as string) ?? '',
      talla:              (it.talla as string) ?? '',
      cantidad:           (it.cantidad as number) ?? 1,
      costo_unitario_cop: (it.costo_unitario_cop as number) ?? 0,
      destino:            it.destino as 'pedido' | 'contoda' | 'sin_asignar',
      articulo_id:        (it.articulo_id as string) ?? null,
      pedido_ref:         numeroOrden
        ? (it.pedido_item_indice ? `${numeroOrden}-${it.pedido_item_indice}` : numeroOrden)
        : '',
    }
  })

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <BotonVolver href={`/compras/${id}`}>Volver</BotonVolver>
        <h1 className="text-lg font-bold text-gray-900">
          Editar compra — {(compra as any).proveedor}
        </h1>
      </div>

      <EditarCompraForm
        compraId={id}
        inicial={{
          tipo:            (compra as any).tipo,
          proveedor:       (compra as any).proveedor,
          fecha:           (compra as any).fecha,
          numero_factura:  (compra as any).numero_factura ?? '',
          total_usd:       (compra as any).total_usd ?? null,
          trm:             (compra as any).trm ?? null,
          total_cop:       (compra as any).total_cop,
          notas:           (compra as any).notas ?? '',
          cuenta_id:       (compra as any).cuenta_id ?? null,
        }}
        itemsIniciales={itemsIniciales}
        cuentas={cuentas}
      />
    </div>
  )
}

import { redirect } from 'next/navigation'

export default async function CambiarEstadoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/pedidos/${id}`)
}

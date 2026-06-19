import { createClient } from '@/lib/supabase/client'

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/gif':  'gif',
  'image/webp': 'webp',
}

export async function uploadPedidoImage(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null
  const supabase = createClient()
  const ext  = EXT_MAP[file.type] ?? file.name.split('.').pop() ?? 'jpg'
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage.from('pedido-items').upload(path, file)
  if (error) return null
  const { data } = supabase.storage.from('pedido-items').getPublicUrl(path)
  return data.publicUrl
}

// Miniaturas de Supabase Storage: convierte la URL del archivo original al
// endpoint de transformación, que sirve la imagen reducida al ancho pedido.
// Una foto de ~700 KB baja a ~25 KB — clave para que la galería vuele.
export function miniaturaUrl(url: string | null, width = 300, quality = 60): string | null {
  if (!url) return null
  if (!url.includes('/storage/v1/object/public/')) return url
  const transformada = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  return `${transformada}${transformada.includes('?') ? '&' : '?'}width=${width}&quality=${quality}`
}

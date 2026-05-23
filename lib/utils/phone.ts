/**
 * Normaliza un teléfono colombiano al formato canónico +57XXXXXXXXXX
 * Acepta variantes como: 300 123 4567, 3001234567, +57 300 123 4567, 57-300-123-4567
 */
export function normalizarTelefono(raw: string): string | null {
  if (!raw) return null

  // Eliminar todo lo que no sea dígito o '+'
  const limpio = raw.replace(/[^\d+]/g, '')

  // Si empieza con +57 y tiene 12 chars totales → +57XXXXXXXXXX
  if (/^\+57\d{10}$/.test(limpio)) return limpio

  // Si empieza con 57 y tiene 12 dígitos → agregar '+'
  if (/^57\d{10}$/.test(limpio)) return `+${limpio}`

  // Si son 10 dígitos y empieza con 3 → número local colombiano
  if (/^3\d{9}$/.test(limpio)) return `+57${limpio}`

  return null
}

export function telefonoValido(raw: string): boolean {
  return normalizarTelefono(raw) !== null
}

export function formatearTelefono(normalizado: string): string {
  // +57XXXXXXXXXX → +57 300 123 4567
  const m = normalizado.match(/^\+57(\d{3})(\d{3})(\d{4})$/)
  if (m) return `+57 ${m[1]} ${m[2]} ${m[3]}`
  return normalizado
}

export function whatsappUrl(normalizado: string): string {
  // +57XXXXXXXXXX → https://wa.me/57XXXXXXXXXX
  return `https://wa.me/${normalizado.replace('+', '')}`
}

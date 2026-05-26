/**
 * Normaliza un teléfono colombiano al formato canónico +57XXXXXXXXXX
 * Acepta variantes como: 300 123 4567, 3001234567, +57 300 123 4567, 57-300-123-4567
 */
export function normalizarTelefono(raw: string): string | null {
  if (!raw) return null

  const limpio = raw.replace(/[^\d+]/g, '')
  if (!limpio) return null

  // Colombiano: +57XXXXXXXXXX
  if (/^\+57\d{10}$/.test(limpio)) return limpio
  if (/^57\d{10}$/.test(limpio)) return `+${limpio}`
  if (/^3\d{9}$/.test(limpio)) return `+57${limpio}`

  // Cualquier otro número: devolverlo limpio con + si lo tenía
  if (raw.trim().startsWith('+')) return `+${limpio.replace(/^\+/, '')}`
  return limpio
}

export function telefonoValido(raw: string): boolean {
  return normalizarTelefono(raw) !== null
}

export function formatearTelefono(normalizado: string): string {
  const m = normalizado.match(/^\+57(\d{3})(\d{3})(\d{4})$/)
  if (m) return `+57 ${m[1]} ${m[2]} ${m[3]}`
  return normalizado
}

export function whatsappUrl(normalizado: string): string {
  return `https://wa.me/${normalizado.replace(/\D/g, '')}`
}

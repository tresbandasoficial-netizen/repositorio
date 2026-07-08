/** Retorna la fecha de hoy en hora Bogotá (UTC−5) como string YYYY-MM-DD.
 *  new Date().toISOString() da UTC y entre 19:00–00:00 Bogotá ya marca el día siguiente. */
export function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date())
}

/** Formatea lo digitado en un campo de dinero con puntos de miles (es-CO):
 *  "1000000" → "1.000.000". Acepta el valor con o sin puntos previos. */
export function formatMiles(valor: string | number | null | undefined): string {
  const limpio = String(valor ?? '').replace(/\D/g, '')
  if (!limpio) return ''
  return parseInt(limpio, 10).toLocaleString('es-CO')
}

export function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatFecha(iso: string): string {
  // Fechas sin hora ('YYYY-MM-DD') se muestran tal cual: convertirlas de zona
  // las correría un día (new Date las interpreta como medianoche UTC).
  const soloFecha = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`
  // timeZone explícito: el servidor corre en UTC y sin esto las fechas
  // renderizadas en servidor pueden salir corridas.
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(new Date(iso))
}

export function formatFechaHora(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Bogota',
  }).format(new Date(iso))
}

export function formatHora(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Bogota',
  }).format(new Date(iso))
}

export function diasDesde(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

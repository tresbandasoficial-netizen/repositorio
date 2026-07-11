// Generador de código de barras Code 128 (subtipo B) sin dependencias.
// Devuelve las barras como anchos de módulo para dibujarlas en SVG.
// Se usa en las etiquetas de pedidos: el código codifica el numero_orden
// (ej. "TR6722"), así que cualquier lector devuelve el número tal cual.

// Tabla estándar de patrones Code 128 (valores 0–105 + patrón de parada).
// Cada dígito es el ancho en módulos, alternando barra/espacio desde barra.
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232',
]
const STOP_PATTERN = '2331112'
const START_B = 104

export type Code128 = {
  // Anchos consecutivos en módulos; el primero es barra, luego alterna espacio/barra.
  widths: number[]
  // Ancho total en módulos (para escalar el SVG).
  totalModules: number
}

export function code128(text: string): Code128 | null {
  if (!text) return null
  const values: number[] = [START_B]
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code < 32 || code > 126) return null // fuera del set B
    values.push(code - 32)
  }
  // Dígito de control: start + Σ(valor × posición) mod 103
  let checksum = values[0]
  for (let i = 1; i < values.length; i++) checksum += values[i] * i
  values.push(checksum % 103)

  const patterns = values.map(v => PATTERNS[v])
  patterns.push(STOP_PATTERN)

  const widths: number[] = []
  let totalModules = 0
  for (const p of patterns) {
    for (const d of p) {
      const w = Number(d)
      widths.push(w)
      totalModules += w
    }
  }
  return { widths, totalModules }
}

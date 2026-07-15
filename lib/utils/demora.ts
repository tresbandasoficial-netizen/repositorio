// "cuánto se demoró": diferencia legible entre dos fechas (ej. asignación y
// completado de una tarea). Seguro para cliente y servidor.
export function formatDemora(desdeIso: string, hastaIso: string): string {
  const ms = new Date(hastaIso).getTime() - new Date(desdeIso).getTime()
  if (ms < 0) return '—'
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `${horas} h ${min % 60} min`
  const dias = Math.floor(horas / 24)
  return `${dias} d ${horas % 24} h`
}

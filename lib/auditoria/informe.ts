import { createAdminClient } from '@/lib/supabase/admin'

// Informe del auditor diario (lo arma la función SQL generar_auditoria, mig. 216).
export type Hallazgo = {
  codigo: string
  severidad: 'alta' | 'media'
  titulo: string
  cantidad: number
  monto: number
  detalle: Array<Record<string, string | number | null>>
}

export type InformeAuditoria = {
  fecha: string
  generado: string
  resumen: {
    pedidos_n: number
    pedidos_total: number
    por_asesor: Array<{ asesor: string | null; pedidos: number; total: number }>
    facturas_n: number
    facturas_total: number
    cobros_total: number
    cobros_por_metodo: Record<string, number>
    deuda_total: number
    deuda_facturas: number
    deuda_0_7: number
    deuda_8_15: number
    deuda_16_30: number
    deuda_mas_30: number
    cierre: { existe: boolean; esperado: number | null; contado: number | null; diferencia: number | null; ingresos: number | null } | null
  }
  hallazgos: Hallazgo[]
}

// Fecha YYYY-MM-DD de ayer (hora Bogotá) a partir de la de hoy.
export function ayerBogota(hoy: string): string {
  const d = new Date(hoy + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// Genera (o regenera) el informe de una sede y fecha. Solo lee dinero y guarda
// el informe; no toca pedidos, facturas ni pagos.
export async function generarInformeSede(codigoSede: string, fecha: string): Promise<{ ok: true; informe: InformeAuditoria; sedeId: string } | { ok: false; error: string }> {
  const admin = createAdminClient()
  const { data: sede } = await admin.from('sedes').select('id').eq('codigo', codigoSede).maybeSingle()
  if (!sede) return { ok: false, error: `Sede ${codigoSede} no encontrada` }
  const { data, error } = await admin.rpc('generar_auditoria', { p_sede: sede.id, p_fecha: fecha })
  if (error) return { ok: false, error: error.message }
  return { ok: true, informe: data as InformeAuditoria, sedeId: sede.id }
}

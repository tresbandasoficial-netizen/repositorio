import { ESTADO_LABELS } from '@/types'

interface AlertaEmailData {
  destinatario: string
  pedidoNumero: string
  pedidoEstado: string
  alertaTipo: 'tiempo_excedido' | 'zombie'
}

const TIPO_LABELS = {
  tiempo_excedido: 'Tiempo excedido en estado',
  zombie: 'Pedido zombi sin actividad',
} as const

export function alertaEmailHtml({ destinatario, pedidoNumero, pedidoEstado, alertaTipo }: AlertaEmailData): string {
  const estadoLabel = ESTADO_LABELS[pedidoEstado as keyof typeof ESTADO_LABELS] ?? pedidoEstado
  const tipoLabel = TIPO_LABELS[alertaTipo]

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Alerta de pedido</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
        <!-- Header -->
        <tr>
          <td style="background:#111827;padding:20px 32px;">
            <span style="color:#ffffff;font-weight:700;font-size:16px;">TR Original</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 4px 0;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Alerta</p>
            <h1 style="margin:0 0 24px 0;font-size:20px;font-weight:700;color:#111827;">${tipoLabel}</h1>

            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;">
              <tr>
                <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
                  <span style="font-size:12px;color:#6b7280;">Pedido</span><br>
                  <span style="font-size:15px;font-weight:600;color:#111827;">${pedidoNumero}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 16px;">
                  <span style="font-size:12px;color:#6b7280;">Estado actual</span><br>
                  <span style="font-size:15px;font-weight:600;color:#111827;">${estadoLabel}</span>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0 0;font-size:13px;color:#6b7280;">
              Hola ${destinatario}, este pedido requiere atención.
              Ingresa a la plataforma para gestionarlo.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Enviado automáticamente por TR Original · No responder este correo.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function alertaEmailSubject(alertaTipo: string, pedidoNumero: string): string {
  return alertaTipo === 'zombie'
    ? `⚠️ Pedido zombi: ${pedidoNumero}`
    : `⚠️ Pedido requiere atención: ${pedidoNumero}`
}

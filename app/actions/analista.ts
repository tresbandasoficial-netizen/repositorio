'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion } from '@/lib/auth/acceso'
import { hoyBogota } from '@/lib/utils/format'
import type { MensajeChat } from '@/app/actions/asistente'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Esquema documentado para el agente ───────────────────────────────────────
const ESQUEMA = `
TABLAS PRINCIPALES (PostgreSQL):

pedidos: id, numero_orden (ej TR6492), cliente_id, sede_id, asesor_id, estado
  (pendiente|comprado|usa|bucaramanga|santa_rosa|entregado|cancelado), total (COP entero),
  tipo_entrega, factura_id, notas, fecha_creacion (timestamptz), fecha_actualizacion.
pedido_items: pedido_id, codigo (SKU), marca, descripcion, talla, color, sexo, categoria,
  cantidad, precio_venta, articulo_id.
pagos: pedido_id, monto, metodo, fecha (date), cuenta_id, asesor_id, anulado (bool), creado_en.
facturas: id, numero_factura, cliente_id, sede_id, asesor_id, total, estado
  (pendiente|pagada|vencida|anulada), fecha_factura, fecha_vencimiento, envio, descuento, creado_en.
pagos_factura: factura_id, monto, metodo, fecha, cuenta_id, anulado, creado_en.
gastos: fecha, valor, categoria (compras_mercancia|domicilios|publicidad|nomina|arriendo|transporte|otros...),
  sede_id, cuenta_id, observacion, origen, creado_en.
compras: proveedor, fecha, numero_factura, tipo (usa|colombia), total_usd, trm, total_cop, cuenta_id.
compra_items: compra_id, codigo, descripcion, marca, talla, cantidad, costo_unitario_cop,
  destino (pedido|contoda|sin_asignar), pedido_id, articulo_id.
articulos (catálogo): id, codigo (SKU), nombre, marca, color, sexo (hombre|mujer|nino),
  categoria (ropa|tenis|accesorios), activo, creado_en.
movimientos_inventario: articulo_id, talla, sede_id, delta, tipo, costo_unitario_cop, creado_en.
clientes: id, nombre, telefono_normalizado, cedula, creado_en.
domicilios: fecha, mensajeria (exneider|servigo), valor_pedido, valor_domicilio, estado,
  cliente_nombre, factura_id, creado_en.
pagos_mensajeria: mensajeria, tipo (deuda|pago), monto, fecha, estado, cuenta_id.
cuentas: id, nombre (ej 'Efectivo Bucaramanga', 'Bancolombia Carlos'), tipo, metodo_pago,
  sede_id, saldo_inicial, fecha_corte.
sedes: id, codigo (TR=Bucaramanga, SR=Santa Rosa, CR=Cúcuta), nombre.
usuarios: id, nombre, rol (admin|asesor|visor), sede_id.
traslados_caja: origen_cuenta_id, destino_cuenta_id, monto, fecha.
cierres_caja: fecha, sede_id, total_ingresos, total_egresos, neto, efectivo_esperado,
  efectivo_contado, diferencia.

VISTAS ÚTILES:
vista_pedidos_asesor: pedidos con cliente_nombre, sede_codigo, asesor_nombre, total_pagado, en_alerta, es_zombie.
vista_facturas: facturas con cliente_nombre, sede_codigo, total_abonado, saldo, dias_atraso.
vista_ganancia_pedidos: ganancia por pedido (ingreso vs costo de compra por item).
vista_cartera_clientes: saldo por cliente (total_comprado, total_pagado, saldo).
saldos_cuentas: total_ingresos/egresos/saldo_neto acumulados por cuenta.

REGLAS DE NEGOCIO (aplícalas SIEMPRE):
- Dinero real: excluir pagos con anulado = true y con metodo = 'credito'.
- Pedidos: excluir estado 'cancelado' en ventas.
- Facturas: excluir estado 'anulada'.
- Todos los montos son COP enteros (sin decimales).
- La fecha de negocio es hora Bogotá: usa hoy_bogota() para "hoy"; date_trunc con
  (creado_en at time zone 'America/Bogota') para agrupar timestamps por día/mes.
- Gastos con categoria 'compras_mercancia' son el costo de mercancía (no gasto operativo).
`

const SYSTEM = `Eres el analista de datos senior de Tres Bandas, una tienda colombiana de ropa,
tenis y accesorios con 3 sedes (Bucaramanga TR, Santa Rosa SR, Cúcuta CR) que vende por encargo
(pedidos), en tienda (ventas) y a crédito (facturas). Hoy es ${hoyBogota()} (hora Bogotá).

Tienes acceso de SOLO LECTURA a la base de datos con la herramienta consultar_base_datos.
${ESQUEMA}

CÓMO TRABAJAR:
1. Piensa qué datos necesitas y haz las consultas SQL necesarias (una por llamada, sin punto y coma).
2. Verifica los números antes de afirmarlos; si un resultado se ve raro, revisa con otra consulta.
3. Responde en español, claro y ejecutivo: primero la respuesta directa, luego el detalle.
4. Formatea el dinero con puntos de miles ($1.234.567) y redondea porcentajes a 1 decimal.
5. Cuando ayude, presenta tablas en markdown y cierra con una conclusión o recomendación accionable.
6. Si la pregunta es ambigua, asume lo más útil para un dueño de negocio y dilo.
7. Máximo 200 filas por consulta: agrega (GROUP BY) en vez de pedir listas gigantes.`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultar_base_datos',
    description: 'Ejecuta UNA consulta SQL de solo lectura (SELECT o WITH, sin punto y coma) sobre la base de datos del negocio y devuelve hasta 200 filas en JSON.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'La consulta SQL (solo SELECT/WITH, una sola sentencia)' },
      },
      required: ['query'],
    },
  },
]

export type RespuestaAnalista = { texto: string; consultas: number }

export async function analistaChatAction(
  pregunta: string,
  historial: MensajeChat[]
): Promise<RespuestaAnalista> {
  const sesion = await getSesion()
  if (sesion.rol !== 'admin') {
    return { texto: 'El analista de datos solo está disponible para administradores.', consultas: 0 }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { texto: 'Falta configurar ANTHROPIC_API_KEY.', consultas: 0 }
  }

  const admin = createAdminClient()

  const messages: Anthropic.MessageParam[] = [
    ...historial.slice(-12).map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: pregunta },
  ]

  let consultas = 0

  try {
    // Bucle de herramientas: el modelo consulta la BD las veces que necesite.
    for (let paso = 0; paso < 8; paso++) {
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 3000,
        system: SYSTEM,
        tools: TOOLS,
        messages,
      })

      const toolUses = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

      if (r.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const texto = r.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('\n')
        return { texto: texto || 'No obtuve respuesta. Intenta reformular la pregunta.', consultas }
      }

      messages.push({ role: 'assistant', content: r.content })

      const results: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUses) {
        const query = String((tu.input as { query?: string }).query ?? '')
        consultas++
        const { data, error } = await admin.rpc('analista_sql', { p_query: query })
        const contenido = error
          ? `ERROR: ${error.message}`
          : JSON.stringify(data).slice(0, 12000)
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: contenido, is_error: !!error })
      }
      messages.push({ role: 'user', content: results })
    }

    return { texto: 'La pregunta requirió demasiadas consultas. Intenta dividirla en partes más específicas.', consultas }
  } catch (e) {
    console.error('Error en analistaChatAction:', e)
    return { texto: 'Error consultando al analista. Intenta de nuevo en un momento.', consultas }
  }
}

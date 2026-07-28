'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion } from '@/lib/auth/acceso'
import { hoyBogota } from '@/lib/utils/format'
import { cambiarEstadoInlineAction } from '@/app/actions/pedidos'
import { marcarEtiquetadoAction } from '@/app/actions/clientes'
import type { EstadoPedido } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Agente de voz ────────────────────────────────────────────────────────────
//
// El micrófono manda el texto dicho y este agente decide qué hacer. Los permisos
// NO los decide el modelo: cada herramienta ejecuta acciones o consultas que ya
// verifican el rol y la sede por dentro (getSesion + RLS), así que un asesor no
// puede hacer por voz nada que no pueda hacer clicando. La lista de herramientas
// también se filtra por rol para no ofrecer lo que va a fallar.
//
// Las acciones que cambian datos exigen confirmación EN LA CONVERSACIÓN: el
// modelo primero dice qué va a hacer y solo ejecuta cuando el usuario confirma.

// Rutas a las que se puede navegar, espejo del menú y sus roles.
const RUTAS: Array<{ ruta: string; nombre: string; roles: string[] }> = [
  { ruta: '/dashboard',        nombre: 'dashboard / inicio',        roles: ['asesor', 'admin'] },
  { ruta: '/pedidos',          nombre: 'pedidos (lista)',           roles: ['asesor', 'admin', 'visor'] },
  { ruta: '/pedidos/galeria',  nombre: 'galería de pedidos',        roles: ['asesor', 'admin', 'visor'] },
  { ruta: '/pedidos/nuevo',    nombre: 'crear pedido',              roles: ['asesor', 'admin'] },
  { ruta: '/facturacion/nueva', nombre: 'facturar / vender',        roles: ['asesor', 'admin'] },
  { ruta: '/cuentas-por-cobrar', nombre: 'cuentas por cobrar',      roles: ['asesor', 'admin'] },
  { ruta: '/bonos',            nombre: 'bonos regalo',              roles: ['asesor', 'admin'] },
  { ruta: '/tareas',           nombre: 'tareas',                    roles: ['asesor', 'admin'] },
  { ruta: '/retos',            nombre: 'retos',                     roles: ['asesor', 'admin'] },
  { ruta: '/alertas',          nombre: 'alertas',                   roles: ['asesor', 'admin', 'visor'] },
  { ruta: '/clientes',         nombre: 'clientes',                  roles: ['asesor', 'admin', 'visor'] },
  { ruta: '/domicilios',       nombre: 'domicilios',                roles: ['asesor', 'admin'] },
  { ruta: '/envios',           nombre: 'envíos entre sedes',        roles: ['asesor', 'admin'] },
  { ruta: '/cuadre',           nombre: 'cuadre de caja',            roles: ['asesor', 'admin'] },
  { ruta: '/gastos',           nombre: 'gastos',                    roles: ['asesor', 'admin'] },
  { ruta: '/mensajerias',      nombre: 'mensajerías',               roles: ['asesor', 'admin'] },
  { ruta: '/inventario/conteo', nombre: 'conteo de inventario',     roles: ['asesor', 'admin'] },
  { ruta: '/flujo-caja',       nombre: 'flujo de caja',             roles: ['admin'] },
  { ruta: '/consignaciones',   nombre: 'consignaciones',            roles: ['admin'] },
  { ruta: '/ganancias',        nombre: 'ganancias',                 roles: ['admin'] },
  { ruta: '/inventario',       nombre: 'inventario',                roles: ['admin'] },
  { ruta: '/cartera',          nombre: 'cartera',                   roles: ['admin'] },
  { ruta: '/recompras',        nombre: 'recompra de clientes',      roles: ['admin'] },
  { ruta: '/estadisticas',     nombre: 'estadísticas',              roles: ['admin'] },
  { ruta: '/compras',          nombre: 'compras',                   roles: ['admin'] },
  { ruta: '/usuarios',         nombre: 'usuarios',                  roles: ['admin'] },
  { ruta: '/asistente',        nombre: 'asistente IA (chat)',       roles: ['asesor', 'admin'] },
]

export type MensajeVoz = { role: 'user' | 'assistant'; content: string }

export type RespuestaAgenteVoz = {
  texto: string          // lo que se muestra y se lee en voz alta
  navegarA?: string      // ruta a abrir en el navegador, si el agente navega
}

export async function agenteVozAction(
  dicho: string,
  historial: MensajeVoz[],
): Promise<RespuestaAgenteVoz> {
  const sesion = await getSesion()
  if (sesion.rol === 'visor') {
    return { texto: 'El agente de voz no está disponible para el rol visor.' }
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return { texto: 'Falta configurar la clave del agente.' }
  }

  const esAdmin = sesion.rol === 'admin'
  const rutasDelRol = RUTAS.filter(r => r.roles.includes(sesion.rol))

  const tools: Anthropic.Tool[] = [
    {
      name: 'navegar',
      description: 'Abre una página de la aplicación en el navegador del usuario. Úsala cuando pida ir a algún lado ("ábreme la galería", "vamos a cartera").',
      input_schema: {
        type: 'object',
        properties: {
          ruta: { type: 'string', description: `Una de: ${rutasDelRol.map(r => r.ruta).join(', ')}` },
        },
        required: ['ruta'],
      },
    },
    {
      name: 'buscar_pedido',
      description: 'Busca pedidos por número de orden (ej TR6492) o por nombre del cliente. Devuelve número, cliente, estado, total, pagado y sede.',
      input_schema: {
        type: 'object',
        properties: {
          busqueda: { type: 'string', description: 'Número de orden o nombre del cliente' },
        },
        required: ['busqueda'],
      },
    },
    {
      name: 'cambiar_estado_pedido',
      description: 'Cambia el estado de un pedido (pendiente, comprado, usa, bucaramanga, santa_rosa, entregado, cancelado). SOLO llamar después de que el usuario confirme explícitamente. La acción valida rol, sede y transición.',
      input_schema: {
        type: 'object',
        properties: {
          pedido_id: { type: 'string', description: 'El id (uuid) del pedido, obtenido con buscar_pedido' },
          nuevo_estado: { type: 'string', description: 'El estado destino' },
        },
        required: ['pedido_id', 'nuevo_estado'],
      },
    },
    ...(esAdmin ? [
      {
        name: 'consultar_base_datos',
        description: 'Ejecuta UNA consulta SQL de solo lectura (SELECT o WITH, sin punto y coma) y devuelve hasta 200 filas en JSON. Solo para responder preguntas de datos.',
        input_schema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string' as const, description: 'SQL de solo lectura, una sola sentencia' },
          },
          required: ['query'],
        },
      },
      {
        name: 'marcar_etiquetado_whatsapp',
        description: 'Marca o desmarca un cliente como ya etiquetado en WhatsApp (pantalla de recompras). SOLO tras confirmación del usuario.',
        input_schema: {
          type: 'object' as const,
          properties: {
            cliente_id: { type: 'string' as const, description: 'uuid del cliente' },
            listo: { type: 'boolean' as const },
          },
          required: ['cliente_id', 'listo'],
        },
      },
    ] : []),
  ]

  const system = `Eres el asistente de voz de Tres Bandas (tienda colombiana de ropa y tenis,
sedes Bucaramanga TR, Santa Rosa SR y Cúcuta CR). Hoy es ${hoyBogota()} (hora Bogotá).
Hablas con ${sesion.rol === 'admin' ? 'el administrador' : 'una asesora de ventas'}.

Lo que dices se LEE EN VOZ ALTA: responde en 1-3 frases cortas, sin markdown, sin
listas, sin símbolos. Números de dinero redondeados y en palabras naturales
("un millón doscientos mil pesos" está bien como "$1.200.000").

PÁGINAS DISPONIBLES para navegar (según su rol):
${rutasDelRol.map(r => `${r.ruta} = ${r.nombre}`).join('\n')}

REGLAS:
- Acción que CAMBIA datos (cambiar estado, marcar etiquetado): primero di qué vas a
  hacer y pregunta "¿confirmas?". Ejecuta solo cuando el usuario confirme en su
  siguiente mensaje. Nunca ejecutes sin confirmación.
- Navegar y buscar no necesitan confirmación.
- Si la herramienta devuelve error, dilo tal cual y no insistas.
- Dinero real: excluye pagos anulados y método crédito; pedidos cancelados no cuentan.
- Si piden algo que no puedes hacer con tus herramientas, dilo y sugiere dónde
  hacerlo en la aplicación.`

  const messages: Anthropic.MessageParam[] = [
    ...historial.slice(-10).map(m => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: dicho },
  ]

  let navegarA: string | undefined

  try {
    for (let paso = 0; paso < 6; paso++) {
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 1000,
        system,
        tools,
        messages,
      })

      const toolUses = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      if (r.stop_reason !== 'tool_use' || toolUses.length === 0) {
        const texto = r.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text).join(' ').trim()
        return { texto: texto || 'No te entendí, ¿me lo repites?', navegarA }
      }

      messages.push({ role: 'assistant', content: r.content })
      const results: Anthropic.ToolResultBlockParam[] = []

      for (const tu of toolUses) {
        const input = tu.input as Record<string, unknown>
        let contenido = ''
        let esError = false

        try {
          if (tu.name === 'navegar') {
            const ruta = String(input.ruta ?? '')
            const permitida = rutasDelRol.find(r => r.ruta === ruta)
            if (permitida) {
              navegarA = ruta
              contenido = `Abriendo ${permitida.nombre}.`
            } else {
              contenido = 'Esa página no existe o no está disponible para este rol.'
              esError = true
            }

          } else if (tu.name === 'buscar_pedido') {
            // Con el cliente del USUARIO: el RLS decide qué pedidos ve.
            const supabase = await createClient()
            const q = String(input.busqueda ?? '').trim()
            const { data } = await supabase
              .from('vista_pedidos_asesor')
              .select('id, numero_orden, estado, total, total_pagado, cliente_nombre, sede_codigo')
              .or(`numero_orden.ilike.%${q.replace(/[,()]/g, '')}%,cliente_nombre.ilike.%${q.replace(/[,()]/g, '')}%`)
              .order('fecha_creacion', { ascending: false })
              .limit(5)
            contenido = JSON.stringify(data ?? [])

          } else if (tu.name === 'cambiar_estado_pedido') {
            // La acción valida rol, sede y transición por dentro.
            const res = await cambiarEstadoInlineAction(
              String(input.pedido_id ?? ''),
              'pendiente' as EstadoPedido,   // ignorado: la acción relee el estado real
              String(input.nuevo_estado ?? '') as EstadoPedido,
            )
            contenido = res.ok ? 'Estado cambiado.' : `ERROR: ${res.error}`
            esError = !res.ok

          } else if (tu.name === 'consultar_base_datos' && esAdmin) {
            const admin = createAdminClient()
            const { data, error } = await admin.rpc('analista_sql', { p_query: String(input.query ?? '') })
            contenido = error ? `ERROR: ${error.message}` : JSON.stringify(data).slice(0, 8000)
            esError = !!error

          } else if (tu.name === 'marcar_etiquetado_whatsapp' && esAdmin) {
            const res = await marcarEtiquetadoAction(String(input.cliente_id ?? ''), Boolean(input.listo))
            contenido = res.ok ? 'Marcado.' : `ERROR: ${res.error}`
            esError = !res.ok

          } else {
            contenido = 'Herramienta no disponible para este rol.'
            esError = true
          }
        } catch (e) {
          contenido = `ERROR: ${e instanceof Error ? e.message : 'falló la herramienta'}`
          esError = true
        }

        results.push({ type: 'tool_result', tool_use_id: tu.id, content: contenido, is_error: esError })
      }
      messages.push({ role: 'user', content: results })
    }

    return { texto: 'Eso me tomó demasiados pasos. Intenta pedirlo de una forma más directa.', navegarA }
  } catch (e) {
    console.error('Error en agenteVozAction:', e)
    return { texto: 'Tuve un error procesando eso. Intenta de nuevo.' }
  }
}

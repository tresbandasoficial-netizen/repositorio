'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSesion } from '@/lib/auth/acceso'
import { hoyBogota } from '@/lib/utils/format'
import { cambiarEstadoInlineAction, crearPedidoDesdeDataAction } from '@/app/actions/pedidos'
import { marcarEtiquetadoAction, crearClienteAction, buscarClientesAction } from '@/app/actions/clientes'
import { abonarClienteAction } from '@/app/actions/abonos'
import { crearGastoAction } from '@/app/actions/gastos'
import { crearTareaAction } from '@/app/actions/tareas'
import { registrarEntradaAction, transferirStockAction, buscarArticulosAction } from '@/app/actions/articulos'
import type { EstadoPedido, MetodoPago, CategoriaGasto } from '@/types'
import { METODO_PAGO_LABELS, CATEGORIAS_GASTO } from '@/types'

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
    {
      name: 'crear_pedido',
      description: 'Crea un pedido (encargo) completo: cliente, artículos y abono opcional. SOLO tras confirmación del usuario repitiéndole cliente, artículos, precios y total. El número de orden lo asigna el sistema.',
      input_schema: {
        type: 'object',
        properties: {
          cliente_nombre: { type: 'string' },
          cliente_telefono: { type: 'string', description: 'Celular colombiano. Si no lo sabe, pedirlo: es obligatorio.' },
          productos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                marca: { type: 'string' },
                descripcion: { type: 'string' },
                talla: { type: 'string' },
                cantidad: { type: 'number' },
                precio_venta: { type: 'number', description: 'COP entero por unidad' },
              },
              required: ['descripcion', 'cantidad', 'precio_venta'],
            },
          },
          abono: { type: 'number', description: 'COP; 0 si no abona nada' },
          metodo_abono: { type: 'string', description: `Solo si hay abono. Métodos: ${Object.keys(METODO_PAGO_LABELS).join(', ')}` },
          sede_codigo: { type: 'string', description: 'TR, SR o CR; si no se dice, la sede del usuario' },
          notas: { type: 'string' },
        },
        required: ['cliente_nombre', 'cliente_telefono', 'productos'],
      },
    },
    {
      name: 'buscar_cliente',
      description: 'Busca clientes por nombre o teléfono. Devuelve id, nombre y teléfono. Úsala para obtener el cliente_id antes de abonar o crear algo para un cliente.',
      input_schema: {
        type: 'object',
        properties: { busqueda: { type: 'string' } },
        required: ['busqueda'],
      },
    },
    {
      name: 'crear_cliente',
      description: 'Crea un cliente nuevo. SOLO tras confirmación del usuario. El teléfono es obligatorio (formato colombiano).',
      input_schema: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          telefono: { type: 'string' },
          cedula: { type: 'string' },
        },
        required: ['nombre', 'telefono'],
      },
    },
    {
      name: 'registrar_abono',
      description: `Registra un abono (pago) de un cliente: se reparte automáticamente entre sus deudas. SOLO tras confirmación del usuario, repitiéndole monto, cliente y método. Métodos válidos: ${Object.keys(METODO_PAGO_LABELS).join(', ')}.`,
      input_schema: {
        type: 'object',
        properties: {
          cliente_id: { type: 'string', description: 'uuid obtenido con buscar_cliente' },
          monto: { type: 'number', description: 'COP entero, ej 200000' },
          metodo: { type: 'string' },
          notas: { type: 'string' },
        },
        required: ['cliente_id', 'monto', 'metodo'],
      },
    },
    {
      name: 'crear_gasto',
      description: `Registra un gasto. SOLO tras confirmación del usuario, repitiéndole valor, categoría y cuenta. Categorías: ${CATEGORIAS_GASTO.join(', ')}. Usa listar_opciones para conocer cuentas y sedes.`,
      input_schema: {
        type: 'object',
        properties: {
          valor: { type: 'number', description: 'COP entero' },
          categoria: { type: 'string' },
          cuenta_id: { type: 'string', description: 'uuid de la cuenta que pagó (de listar_opciones cuentas)' },
          sede_codigo: { type: 'string', description: 'TR, SR o CR' },
          observacion: { type: 'string', description: 'Qué fue el gasto' },
          fecha: { type: 'string', description: 'YYYY-MM-DD; si no se dice, hoy' },
        },
        required: ['valor', 'categoria', 'cuenta_id', 'observacion'],
      },
    },
    {
      name: 'listar_opciones',
      description: 'Lista referencias para otras herramientas: "cuentas" (id y nombre de las cuentas de dinero), "sedes" (id, código y nombre) o "usuarios" (id y nombre, para asignar tareas).',
      input_schema: {
        type: 'object',
        properties: { tipo: { type: 'string', description: 'cuentas | sedes | usuarios' } },
        required: ['tipo'],
      },
    },
    {
      name: 'buscar_articulo',
      description: 'Busca artículos del catálogo por código, nombre o marca. Devuelve id, código, nombre, marca y stock por talla.',
      input_schema: {
        type: 'object',
        properties: { busqueda: { type: 'string' } },
        required: ['busqueda'],
      },
    },
    ...(esAdmin ? [
      {
        name: 'crear_tarea',
        description: 'Asigna una tarea a una asesora. SOLO tras confirmación. asignado_a sale de listar_opciones usuarios.',
        input_schema: {
          type: 'object' as const,
          properties: {
            titulo: { type: 'string' as const },
            descripcion: { type: 'string' as const },
            asignado_a: { type: 'string' as const, description: 'uuid del usuario' },
          },
          required: ['titulo', 'asignado_a'],
        },
      },
      {
        name: 'entrada_stock',
        description: 'Registra una entrada de inventario (artículo + talla + cantidad + costo unitario COP). SOLO tras confirmación. articulo_id sale de buscar_articulo.',
        input_schema: {
          type: 'object' as const,
          properties: {
            articulo_id: { type: 'string' as const },
            talla: { type: 'string' as const },
            cantidad: { type: 'number' as const },
            costo_unitario_cop: { type: 'number' as const },
            sede_codigo: { type: 'string' as const, description: 'TR, SR o CR; si no se dice, TR' },
          },
          required: ['articulo_id', 'cantidad', 'costo_unitario_cop'],
        },
      },
      {
        name: 'transferir_stock',
        description: 'Transfiere stock de una sede a otra (artículo + talla + cantidad). SOLO tras confirmación.',
        input_schema: {
          type: 'object' as const,
          properties: {
            articulo_id: { type: 'string' as const },
            talla: { type: 'string' as const },
            cantidad: { type: 'number' as const },
            sede_origen_codigo: { type: 'string' as const },
            sede_destino_codigo: { type: 'string' as const },
          },
          required: ['articulo_id', 'cantidad', 'sede_origen_codigo', 'sede_destino_codigo'],
        },
      },
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
- Acción que CAMBIA datos (cambiar estado, abonos, gastos, clientes, tareas,
  stock, etiquetado): primero repite en voz alta LO QUE VAS A HACER con sus
  números ("voy a registrar un abono de doscientos mil pesos de María en
  efectivo, ¿confirmas?") y ejecuta SOLO cuando el usuario confirme en su
  siguiente mensaje. Nunca ejecutes sin confirmación.
- Los montos dichos en palabras conviértelos a número: "doscientos mil" = 200000.
- Si falta un dato para una acción (método de pago, cuenta, talla…), pregúntalo
  en vez de adivinarlo.
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
    // 8 pasos: una acción real puede necesitar buscar el cliente, listar
    // cuentas, y ejecutar — más las consultas del admin.
    for (let paso = 0; paso < 8; paso++) {
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

          } else if (tu.name === 'crear_pedido') {
            // La misma acción que usa la pantalla de crear pedido: valida
            // cliente, productos y abonos, y el consecutivo lo asigna el RPC
            // oficial. El total se calcula aquí — nunca de oído.
            const productos = (Array.isArray(input.productos) ? input.productos : []).map((p: any) => ({
              marca: String(p?.marca ?? '').trim(),
              descripcion: String(p?.descripcion ?? '').trim(),
              talla: p?.talla ? String(p.talla) : null,
              cantidad: Math.max(1, Math.round(Number(p?.cantidad ?? 1))),
              precio_venta: Math.round(Number(p?.precio_venta ?? 0)),
              color: null, sexo: null, categoria: null,
            }))
            const total = productos.reduce((s, p) => s + p.cantidad * p.precio_venta, 0)
            const abono = Math.max(0, Math.round(Number(input.abono ?? 0)))

            // Sede: la dicha, o la del usuario, o TR.
            const supabase = await createClient()
            let sedeCod = String(input.sede_codigo ?? '').toUpperCase() as 'TR' | 'SR' | 'CR'
            if (!['TR', 'SR', 'CR'].includes(sedeCod)) {
              const { data: s } = sesion.sede_id
                ? await supabase.from('sedes').select('codigo').eq('id', sesion.sede_id).maybeSingle()
                : { data: null }
              sedeCod = ((s?.codigo as 'TR' | 'SR' | 'CR') ?? 'TR')
            }

            const res = await crearPedidoDesdeDataAction({
              formato_version: 'voz',
              sede: sedeCod,
              cliente_nombre: String(input.cliente_nombre ?? '').trim(),
              cliente_doc: null,
              cliente_telefono: String(input.cliente_telefono ?? '').trim(),
              productos,
              total,
              abono,
              metodo_pago_abono: (String(input.metodo_abono ?? 'efectivo') || 'efectivo') as MetodoPago,
              tipo_entrega: 'sede',
              direccion: null,
              notas: input.notas ? String(input.notas) : null,
            }, '')
            contenido = res.ok
              ? `Pedido creado: ${res.numeroOrden}, total $${total.toLocaleString('es-CO')}.`
              : `ERROR: ${res.error}`
            esError = !res.ok

          } else if (tu.name === 'buscar_cliente') {
            const lista = await buscarClientesAction(String(input.busqueda ?? ''))
            contenido = JSON.stringify(lista.slice(0, 5).map(c => ({
              id: c.id, nombre: c.nombre, telefono: c.telefono_normalizado,
            })))

          } else if (tu.name === 'crear_cliente') {
            const res = await crearClienteAction({
              nombre: String(input.nombre ?? ''),
              telefono: String(input.telefono ?? ''),
              cedula: input.cedula ? String(input.cedula) : undefined,
            })
            contenido = res.ok ? `Cliente creado con id ${res.id}.` : `ERROR: ${res.error}`
            esError = !res.ok

          } else if (tu.name === 'registrar_abono') {
            // La acción valida rol, caja cerrada y reparte el abono en un RPC
            // transaccional; la cuenta se rutea sola según el método.
            const res = await abonarClienteAction({
              cliente_id: String(input.cliente_id ?? ''),
              monto: Math.round(Number(input.monto ?? 0)),
              metodo: String(input.metodo ?? '') as MetodoPago,
              cuenta_id: null,
              notas: String(input.notas ?? 'Registrado por voz'),
            })
            contenido = res.ok
              ? `Abono aplicado: $${res.aplicado.toLocaleString('es-CO')}${res.sobrante > 0 ? `, sobraron $${res.sobrante.toLocaleString('es-CO')} sin deuda que cubrir` : ''}.`
              : `ERROR: ${res.error}`
            esError = !res.ok

          } else if (tu.name === 'crear_gasto') {
            const sedeCod = String(input.sede_codigo ?? '').toUpperCase()
            const supabase = await createClient()
            const { data: sede } = sedeCod
              ? await supabase.from('sedes').select('id').eq('codigo', sedeCod).maybeSingle()
              : { data: null }
            const res = await crearGastoAction({
              fecha: String(input.fecha ?? '') || hoyBogota(),
              valor: Math.round(Number(input.valor ?? 0)),
              categoria: String(input.categoria ?? 'otros') as CategoriaGasto,
              sede_id: sede?.id ?? '',           // la acción usa la sede del asesor si no es admin
              cuenta_id: String(input.cuenta_id ?? '') || null,
              observacion: String(input.observacion ?? ''),
            })
            contenido = res.ok ? 'Gasto registrado.' : `ERROR: ${res.error}`
            esError = !res.ok

          } else if (tu.name === 'listar_opciones') {
            // Con el cliente del USUARIO: el RLS decide qué ve cada rol.
            const supabase = await createClient()
            const tipo = String(input.tipo ?? '')
            if (tipo === 'cuentas') {
              const { data } = await supabase.from('cuentas')
                .select('id, nombre, tipo').eq('activa', true).neq('tipo', 'credito').order('orden')
              contenido = JSON.stringify(data ?? [])
            } else if (tipo === 'sedes') {
              const { data } = await supabase.from('sedes').select('id, codigo, nombre').order('codigo')
              contenido = JSON.stringify(data ?? [])
            } else if (tipo === 'usuarios') {
              const { data } = await supabase.from('usuarios')
                .select('id, nombre, rol').eq('activo', true).order('nombre')
              contenido = JSON.stringify(data ?? [])
            } else {
              contenido = 'Tipo inválido: usa cuentas, sedes o usuarios.'
              esError = true
            }

          } else if (tu.name === 'buscar_articulo') {
            const arts = await buscarArticulosAction(String(input.busqueda ?? ''), null)
            contenido = JSON.stringify(arts.slice(0, 5).map(a => ({
              id: a.id, codigo: a.codigo, nombre: a.nombre, marca: a.marca,
              tallas: a.tallaStock,
            })))

          } else if (tu.name === 'crear_tarea' && esAdmin) {
            const res = await crearTareaAction({
              titulo: String(input.titulo ?? ''),
              descripcion: String(input.descripcion ?? ''),
              asignado_a: String(input.asignado_a ?? ''),
            })
            contenido = res.ok ? 'Tarea asignada.' : `ERROR: ${res.error}`
            esError = !res.ok

          } else if (tu.name === 'entrada_stock' && esAdmin) {
            const supabase = await createClient()
            const cod = String(input.sede_codigo ?? 'TR').toUpperCase()
            const { data: sede } = await supabase.from('sedes').select('id').eq('codigo', cod).maybeSingle()
            const res = await registrarEntradaAction({
              articulo_id: String(input.articulo_id ?? ''),
              talla: String(input.talla ?? ''),
              cantidad: Math.round(Number(input.cantidad ?? 0)),
              costo_unitario_cop: Math.round(Number(input.costo_unitario_cop ?? 0)),
              sede_id: sede?.id ?? null,
              notas: 'Registrado por voz',
            })
            contenido = res.ok ? 'Entrada registrada.' : `ERROR: ${res.error}`
            esError = !res.ok

          } else if (tu.name === 'transferir_stock' && esAdmin) {
            const supabase = await createClient()
            const [{ data: origen }, { data: destino }] = await Promise.all([
              supabase.from('sedes').select('id').eq('codigo', String(input.sede_origen_codigo ?? '').toUpperCase()).maybeSingle(),
              supabase.from('sedes').select('id').eq('codigo', String(input.sede_destino_codigo ?? '').toUpperCase()).maybeSingle(),
            ])
            const res = await transferirStockAction({
              articulo_id: String(input.articulo_id ?? ''),
              talla: String(input.talla ?? ''),
              cantidad: Math.round(Number(input.cantidad ?? 0)),
              sede_origen: origen?.id ?? null,
              sede_destino: destino?.id ?? null,
              notas: 'Transferido por voz',
            })
            contenido = res.ok ? 'Transferencia hecha.' : `ERROR: ${res.error}`
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

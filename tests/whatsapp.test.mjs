import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { verificarFirmaMeta, extraerMensaje } from '../lib/whatsapp/verify.ts'
import { enviarMensajeWhatsApp, marcarComoLeido } from '../lib/whatsapp/send.ts'
import { aFormatoWhatsApp } from '../lib/whatsapp/formato.ts'

const firmar = (body, secret) => 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')

describe('verificarFirmaMeta', () => {
  const body = JSON.stringify({ hola: 'mundo', ñ: 'áé' })
  beforeEach(() => { process.env.WHATSAPP_APP_SECRET = 'secreto-prueba' })
  afterEach(() => { delete process.env.WHATSAPP_APP_SECRET })

  test('acepta la firma correcta', () => {
    assert.equal(verificarFirmaMeta(body, firmar(body, 'secreto-prueba')), true)
  })
  test('rechaza cuerpo alterado', () => {
    assert.equal(verificarFirmaMeta(body + ' ', firmar(body, 'secreto-prueba')), false)
  })
  test('rechaza firma con otro secreto', () => {
    assert.equal(verificarFirmaMeta(body, firmar(body, 'otro')), false)
  })
  test('rechaza sin encabezado, algoritmo distinto o hex inválido', () => {
    assert.equal(verificarFirmaMeta(body, null), false)
    assert.equal(verificarFirmaMeta(body, firmar(body, 'secreto-prueba').replace('sha256', 'sha1')), false)
    assert.equal(verificarFirmaMeta(body, 'sha256=zzzz'), false)
  })
  test('sin WHATSAPP_APP_SECRET rechaza todo', () => {
    delete process.env.WHATSAPP_APP_SECRET
    assert.equal(verificarFirmaMeta(body, firmar(body, 'secreto-prueba')), false)
  })
})

describe('extraerMensaje', () => {
  const envolver = (value) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ value }] }] })

  test('mensaje de texto', () => {
    const m = extraerMensaje(envolver({
      messages: [{ id: 'wamid.1', from: '573001234567', type: 'text', text: { body: '¿cómo va TR6492?' } }],
    }))
    assert.deepEqual(m, { wamid: 'wamid.1', de: '573001234567', tipo: 'text', texto: '¿cómo va TR6492?' })
  })
  test('audio: tipo audio y texto vacío', () => {
    const m = extraerMensaje(envolver({ messages: [{ id: 'wamid.2', from: '57300', type: 'audio', audio: {} }] }))
    assert.equal(m?.tipo, 'audio')
    assert.equal(m?.texto, '')
  })
  test('evento de estado (sin messages) → null', () => {
    assert.equal(extraerMensaje(envolver({ statuses: [{ id: 'wamid.3', status: 'read' }] })), null)
  })
  test('payload basura → null', () => {
    assert.equal(extraerMensaje(null), null)
    assert.equal(extraerMensaje({ entry: 'x' }), null)
  })
})

describe('aFormatoWhatsApp', () => {
  test('convierte markdown a formato WhatsApp', () => {
    assert.equal(
      aFormatoWhatsApp('## Resumen\n**TR6492** está en *usa*\n- item uno\n* item dos'),
      '*Resumen*\n*TR6492* está en *usa*\n• item uno\n• item dos'
    )
  })
})

describe('enviarMensajeWhatsApp', () => {
  const fetchOriginal = globalThis.fetch
  let llamadas
  beforeEach(() => {
    process.env.WHATSAPP_TOKEN = 'tok'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '12345'
    llamadas = []
    globalThis.fetch = async (url, init) => {
      llamadas.push({ url, init, body: JSON.parse(init.body) })
      return new Response('{}', { status: 200 })
    }
  })
  afterEach(() => {
    globalThis.fetch = fetchOriginal
    delete process.env.WHATSAPP_TOKEN
    delete process.env.WHATSAPP_PHONE_NUMBER_ID
  })

  test('envía un texto corto con el payload de Meta', async () => {
    await enviarMensajeWhatsApp('573001234567', 'hola')
    assert.equal(llamadas.length, 1)
    assert.equal(llamadas[0].url, 'https://graph.facebook.com/v21.0/12345/messages')
    assert.equal(llamadas[0].init.headers.Authorization, 'Bearer tok')
    assert.deepEqual(llamadas[0].body, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '573001234567',
      type: 'text',
      text: { body: 'hola', preview_url: false },
    })
  })

  test('parte textos largos en trozos ≤ 4000 sin perder líneas', async () => {
    const lineas = Array.from({ length: 300 }, (_, i) => `Línea ${i} ` + 'x'.repeat(20))
    await enviarMensajeWhatsApp('57300', lineas.join('\n'))
    assert.ok(llamadas.length >= 2)
    for (const l of llamadas) assert.ok(l.body.text.body.length <= 4000)
    const reunido = llamadas.map(l => l.body.text.body).join('\n')
    for (const linea of lineas) assert.ok(reunido.includes(linea), `falta: ${linea}`)
  })

  test('lanza si Meta responde error', async () => {
    globalThis.fetch = async () => new Response('bad', { status: 400 })
    await assert.rejects(enviarMensajeWhatsApp('57300', 'hola'), /WhatsApp API error 400/)
  })

  test('lanza si faltan credenciales', async () => {
    delete process.env.WHATSAPP_TOKEN
    await assert.rejects(enviarMensajeWhatsApp('57300', 'hola'), /WHATSAPP_TOKEN/)
  })

  test('marcarComoLeido nunca lanza, ni sin credenciales', async () => {
    delete process.env.WHATSAPP_TOKEN
    await marcarComoLeido('wamid.x')
    globalThis.fetch = async () => { throw new Error('red caída') }
    process.env.WHATSAPP_TOKEN = 'tok'
    await marcarComoLeido('wamid.x')
  })
})

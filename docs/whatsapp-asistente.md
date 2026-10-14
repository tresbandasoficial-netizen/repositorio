# Asistente de WhatsApp (consultas)

El dueño escribe al WhatsApp del negocio y el sistema le contesta con cifras reales. **Solo lectura**:
ventas (total y por sede), gastos, stock por talla y sede, cartera, saldos de cuentas y últimas compras.

- Webhook: `app/api/whatsapp/route.ts` (ruta pública en el middleware, protegida con la firma HMAC de Meta).
- Lógica: `lib/whatsapp/` (`meta.ts` envío y firma, `consultas.ts` consultas, `asistente.ts` conversación).
- Solo responde a los números de `configuracion.whatsapp_autorizados` (con indicativo de país, sin +, separados por coma, ej. `573001234567`). A los demás no les contesta.
- Reglas de dinero: ventas = `pedidos.total`; saldo de cuenta = saldo inicial + movimientos desde su `fecha_corte`; Addi/Sistecrédito se muestran aparte (por cobrar).

## Variables de entorno (Vercel)
| Variable | Qué es |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Texto cualquiera que se inventa y se pega igual en Meta al verificar el webhook |
| `WHATSAPP_APP_SECRET` | "App Secret" de la app en Meta (Configuración → Básica) |
| `WHATSAPP_TOKEN` | Token de acceso permanente (usuario del sistema) con permiso `whatsapp_business_messaging` |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número en WhatsApp → Configuración de la API |
| `ANTHROPIC_API_KEY` | (ya existe) permite entender preguntas libres; sin ella responde por palabras clave |

## Configuración en Meta
1. developers.facebook.com → crear app tipo "Empresa" → agregar el producto **WhatsApp**.
2. Número: la API oficial NO funciona con un WhatsApp normal ya instalado en un celular; el número debe estar libre (o ser el número de prueba que da Meta) — ver nota abajo.
3. Webhook: URL `https://<dominio-de-la-app>/api/whatsapp`, token de verificación = `WHATSAPP_VERIFY_TOKEN`, suscribirse al campo `messages`.
4. Autorizar los números del dueño: en Supabase,
   `insert into configuracion (clave, valor) values ('whatsapp_autorizados', '573001234567') on conflict (clave) do update set valor = excluded.valor;`

## Nota sobre el número
Un WhatsApp "normal" (el de la app verde) no se puede conectar a la API. Opciones: usar un número nuevo que nunca haya tenido WhatsApp, o desvincular el número de la app (se pierden sus chats), o la app WhatsApp Business con la función de coexistencia de Meta.

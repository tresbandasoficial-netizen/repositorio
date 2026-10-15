// Página pública de política de privacidad (la pide Meta para publicar la app
// del asistente de WhatsApp). No requiere sesión: ver lib/supabase/middleware.ts.

export const metadata = {
  title: 'Política de privacidad – Tres Bandas',
}

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 text-gray-800">
      <h1 className="text-2xl font-bold mb-2">Política de privacidad</h1>
      <p className="text-sm text-gray-500 mb-6">Tres Bandas · Última actualización: octubre de 2026</p>

      <section className="space-y-3 mb-6">
        <h2 className="text-lg font-semibold">Quiénes somos</h2>
        <p>
          Tres Bandas es una tienda de ropa y tenis con sedes en Colombia. Esta política explica cómo
          tratamos la información en nuestro sistema de gestión y en el asistente de WhatsApp.
        </p>
      </section>

      <section className="space-y-3 mb-6">
        <h2 className="text-lg font-semibold">Asistente de WhatsApp</h2>
        <p>
          El asistente de WhatsApp es de uso interno: solo responde a un número de celular autorizado por
          el dueño del negocio. Recibe las preguntas escritas por esas personas (por ejemplo, ventas del
          día o inventario) y les contesta con información del sistema. No responde a otros números.
        </p>
      </section>

      <section className="space-y-3 mb-6">
        <h2 className="text-lg font-semibold">Qué datos tratamos</h2>
        <p>
          El número de celular de las personas autorizadas y el texto de las preguntas que envían al
          asistente. Para el funcionamiento de la tienda también tratamos datos de clientes (nombre,
          teléfono, historial de compras) que se usan únicamente para facturar, entregar pedidos y
          atender a quienes compran.
        </p>
      </section>

      <section className="space-y-3 mb-6">
        <h2 className="text-lg font-semibold">Cómo los usamos y protegemos</h2>
        <p>
          Usamos la información solo para operar el negocio. No la vendemos ni la compartimos con
          terceros, salvo los proveedores tecnológicos necesarios para prestar el servicio (alojamiento,
          base de datos y la plataforma de mensajería de WhatsApp). El acceso al sistema está protegido
          con usuario y contraseña, y los datos se guardan en servidores seguros.
        </p>
      </section>

      <section className="space-y-3 mb-6">
        <h2 className="text-lg font-semibold">Tus derechos</h2>
        <p>
          Puedes pedirnos conocer, corregir o eliminar tus datos personales, o dejar de recibir
          mensajes, escribiendo al correo de contacto.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Contacto</h2>
        <p>tresbandasoficial@gmail.com</p>
      </section>
    </main>
  )
}

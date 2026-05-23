import { Resend } from 'resend'

// Instancia compartida — se crea una vez por process.
// RESEND_API_KEY debe estar configurado en las variables de entorno.
export const resend = new Resend(process.env.RESEND_API_KEY)

export const EMAIL_FROM = process.env.RESEND_FROM_EMAIL ?? 'alertas@resend.dev'

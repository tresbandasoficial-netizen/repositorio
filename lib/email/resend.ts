import { Resend } from 'resend'

export const EMAIL_FROM = process.env.RESEND_FROM_EMAIL ?? 'alertas@resend.dev'

export function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

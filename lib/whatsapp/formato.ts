// Claude tiende a markdown; WhatsApp usa *negrita* simple y no tiene encabezados.
export function aFormatoWhatsApp(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim()
}

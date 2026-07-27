// Tope general de consignaciones al año, para no pasarse del umbral de la DIAN.
//
// Va aquí y no en la base porque el valor en UVT cambia cada año y así se
// corrige en un solo lugar. Cada cuenta puede tener el suyo propio en
// cuentas.limite_consignacion (migración 141), que manda sobre este.
//
// No está en app/actions porque un archivo 'use server' solo puede exportar
// funciones asíncronas.
export const LIMITE_CONSIGNACION_DEFECTO = 100_000_000

// La API de Supabase corta cada consulta en 1.000 filas (db max-rows) aunque se
// pida .limit(20000): los saldos y cuadres que suman miles de pagos quedaban
// incompletos sin ningún error. Esto trae la consulta por tandas con .range()
// hasta que no queden filas.
//
// Recibe el query SIN esperar (sin await) y con un .order() estable por una
// columna única (p. ej. id), para que las tandas no se solapen ni se salten
// filas. Devuelve la misma forma { data, error, count } que una consulta normal
// (count viene de la primera tanda cuando el query pidió { count: 'exact' }).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function traerTodo<T = any>(
  consulta: {
    range: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }>
  },
  tanda = 1000
): Promise<{ data: T[]; error: { message: string } | null; count: number | null }> {
  const filas: T[] = []
  let count: number | null = null
  for (let desde = 0; ; ) {
    const r = await consulta.range(desde, desde + tanda - 1)
    if (desde === 0) count = r.count ?? null
    if (r.error) return { data: filas, error: r.error, count }
    const pagina = (r.data ?? []) as T[]
    if (pagina.length === 0) break
    filas.push(...pagina)
    desde += pagina.length
  }
  return { data: filas, error: null, count }
}

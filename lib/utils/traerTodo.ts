// La API de Supabase corta cada consulta en 1.000 filas (db max-rows) aunque se
// pida .limit(20000): los saldos y cuadres que suman miles de pagos quedaban
// incompletos sin ningún error. Esto trae la consulta por tandas con .range()
// hasta que no queden filas.
//
// Recibe el query SIN esperar (sin await) y con un .order() estable (p. ej. por
// id), para que las tandas no se solapen ni se salten filas. Devuelve la misma
// forma { data, error } que una consulta normal.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function traerTodo<T = any>(
  consulta: { range: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
  tanda = 1000
): Promise<{ data: T[]; error: { message: string } | null }> {
  const filas: T[] = []
  for (let desde = 0; ; ) {
    const { data, error } = await consulta.range(desde, desde + tanda - 1)
    if (error) return { data: filas, error }
    const pagina = (data ?? []) as T[]
    if (pagina.length === 0) break
    filas.push(...pagina)
    desde += pagina.length
  }
  return { data: filas, error: null }
}

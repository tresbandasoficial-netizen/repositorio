// PostgREST interpreta las comas y los paréntesis como parte de la gramática
// de .or(); si el término de búsqueda los contiene, la consulta entera falla
// con "failed to parse logic tree" y la página se cae. Se reemplazan por
// espacio antes de interpolar (el usuario igual busca por fragmentos).
export function terminoBusquedaSeguro(q: string): string {
  return q.replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim()
}

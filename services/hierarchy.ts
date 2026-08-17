/**
 * Las reglas de forma del árbol de líneas.
 *
 * Colgar una línea de otra parece inofensivo hasta que el árbol deja de ser un árbol: si A cuelga de
 * B y B cuelga de A, el prorrateo del avance —que sube de las hojas al resumen— gira para siempre y
 * se lleva por delante todas las pantallas que lo calculan. Por eso el movimiento se juzga **antes**
 * de escribirlo.
 *
 * Aquí no se consulta la base: se recibe el árbol ya cargado y se responde sobre su forma. La
 * existencia del padre y su pertenencia al proyecto son consulta, y viven en el servicio.
 */

export interface NodoJerarquia {
  readonly id: string
  readonly parentId: string | null
}

/**
 * Devuelve null si el movimiento es válido, o el mensaje de por qué no lo es.
 *
 * El mensaje sale redactado para pantalla: quien mueve una línea necesita saber qué regla rompió,
 * no un código.
 */
export function validarPadre(
  nodos: readonly NodoJerarquia[],
  hijaId: string,
  padreNuevoId: string | null,
): string | null {
  // Subir una línea a la raíz nunca puede crear un ciclo: se queda sin ancestros.
  if (padreNuevoId === null) return null

  if (hijaId === padreNuevoId) {
    return 'Una línea no puede colgar de sí misma.'
  }

  const padreDe = new Map<string, string | null>()
  for (const nodo of nodos) {
    padreDe.set(nodo.id, nodo.parentId)
  }

  // Se sube desde el padre candidato hacia la raíz. Si en ese camino aparece la línea que se está
  // moviendo, el padre elegido es una de sus descendientes y el movimiento cerraría el ciclo.
  const visitados = new Set<string>()
  let actual: string | null = padreNuevoId

  while (actual !== null) {
    if (actual === hijaId) {
      return 'No se puede colgar una línea de una de sus propias descendientes: el árbol dejaría de serlo.'
    }

    // Blindaje contra un ciclo que YA esté guardado en la base —importación a medias, migración
    // vieja, edición directa en SQL—. Sin el Set, este while no termina nunca y la petición se
    // cuelga sin responder: el peor final posible, porque ni siquiera deja un error que leer.
    // Al reencontrar un nodo se corta y se deja pasar: el ciclo preexistente no lo causó este
    // movimiento y no es este el lugar donde se repara.
    if (visitados.has(actual)) return null
    visitados.add(actual)

    actual = padreDe.get(actual) ?? null
  }

  return null
}

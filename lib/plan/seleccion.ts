/**
 * Selección múltiple de filas del plan (§4.6, conmutador 1).
 *
 * ## Lo que parece trivial y no lo es
 *
 * Marcar casillas es fácil. Lo que se equivoca es todo lo demás:
 *
 * - **El rango con Mayúsculas** tiene que ir sobre lo que se está VIENDO, no sobre el plan entero.
 *   Si alguien pliega una etapa, marca una fila, y con Mayúsculas marca otra veinte más abajo, lo
 *   que espera es las veinte filas que ve — no las trescientas que hay dentro de las ramas
 *   plegadas. Un rango que arrastra lo invisible borra cosas que nadie miró.
 * - **Filtrar no puede desmarcar.** Quien marca cuarenta líneas, filtra para revisar, y quita el
 *   filtro, espera sus cuarenta. Pero tampoco puede operar sobre lo que no ve, así que la selección
 *   se conserva y las operaciones se aplican a la **intersección** con lo visible — y se dice
 *   cuántas quedaron fuera, en lugar de callarlo.
 * - **Marcar todo** es marcar todo lo visible, nunca el plan entero. «Todo» en una pantalla
 *   filtrada significa lo que hay en la pantalla.
 *
 * Vive aparte porque las tres reglas se prueban sin navegador y porque equivocarse en ellas no da
 * error: da una operación en lote sobre las líneas equivocadas.
 */

export interface Seleccion {
  /** Las líneas marcadas. */
  readonly marcadas: ReadonlySet<string>
  /**
   * Desde dónde cuenta el próximo rango con Mayúsculas.
   *
   * Es la última fila que se marcó a mano, no la primera de la selección: es lo que hace que
   * marcar, mayús-marcar, y volver a mayús-marcar más arriba se comporte como en una hoja de
   * cálculo en lugar de dar saltos.
   */
  readonly ancla: string | null
}

export const SIN_SELECCION: Seleccion = Object.freeze({ marcadas: new Set<string>(), ancla: null })

/** Marca o desmarca una fila, y la deja como ancla del próximo rango. */
export function alternar(seleccion: Seleccion, id: string): Seleccion {
  const marcadas = new Set(seleccion.marcadas)
  if (marcadas.has(id)) marcadas.delete(id)
  else marcadas.add(id)
  // El ancla se mueve incluso al desmarcar: es «lo último que tocaste», no «lo último que marcaste».
  return { marcadas, ancla: id }
}

/**
 * Marca el rango entre el ancla y `id`, **sobre las filas visibles**.
 *
 * Sin ancla se comporta como un clic normal: no hay desde dónde contar, y adivinar un extremo es
 * peor que marcar una sola.
 *
 * El rango se **suma** a lo que ya había en lugar de sustituirlo. Es lo que hace una hoja de
 * cálculo con Ctrl+Mayús, y aquí es la única lectura razonable: quien ya tenía cuarenta marcadas y
 * añade un rango no quiere perder las cuarenta.
 */
export function marcarRango(
  seleccion: Seleccion,
  visibles: readonly string[],
  id: string,
): Seleccion {
  if (seleccion.ancla === null) return alternar(seleccion, id)

  const desde = visibles.indexOf(seleccion.ancla)
  const hasta = visibles.indexOf(id)
  // Si el ancla ya no está a la vista —se plegó su rama, la escondió un filtro— no hay rango que
  // trazar. Marcar solo la pulsada es lo predecible; trazar desde una fila invisible, no.
  if (desde < 0 || hasta < 0) return alternar(seleccion, id)

  const marcadas = new Set(seleccion.marcadas)
  const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde]
  for (let i = a; i <= b; i += 1) marcadas.add(visibles[i]!)
  return { marcadas, ancla: id }
}

/** Marca todas las filas visibles. «Todo» en una pantalla filtrada es lo que hay en la pantalla. */
export function marcarTodas(seleccion: Seleccion, visibles: readonly string[]): Seleccion {
  const marcadas = new Set(seleccion.marcadas)
  for (const id of visibles) marcadas.add(id)
  return { marcadas, ancla: seleccion.ancla }
}

/** Quita la marca de las visibles y conserva las que no se ven. */
export function desmarcarVisibles(seleccion: Seleccion, visibles: readonly string[]): Seleccion {
  const marcadas = new Set(seleccion.marcadas)
  for (const id of visibles) marcadas.delete(id)
  return { marcadas, ancla: null }
}

/** Vacía la selección entera. */
export function limpiar(): Seleccion {
  return SIN_SELECCION
}

export interface Alcance {
  /** Las marcadas que además se ven: sobre estas se opera. */
  readonly sobreLasQueOperar: readonly string[]
  /** Cuántas marcadas quedaron fuera de la vista. */
  readonly fueraDeLaVista: number
}

/**
 * Sobre qué líneas se aplica una operación en lote.
 *
 * Solo sobre las marcadas que además se ven. Operar sobre lo que la persona no tiene delante es
 * cómo un filtro puesto hace media hora acaba borrando líneas que nadie volvió a mirar.
 *
 * `fueraDeLaVista` no es un detalle: es lo que permite decir «se van a mover 12 de las 40 que
 * tienes marcadas» en lugar de mover doce en silencio y dejar a alguien contando por qué faltan.
 */
export function alcanceDe(seleccion: Seleccion, visibles: readonly string[]): Alcance {
  const aLaVista = new Set(visibles)
  const dentro: string[] = []
  let fuera = 0
  for (const id of seleccion.marcadas) {
    if (aLaVista.has(id)) dentro.push(id)
    else fuera += 1
  }
  // En el orden de la pantalla, no en el de marcado: una operación que recorre líneas de arriba
  // abajo es la que se puede seguir con la vista mientras ocurre.
  dentro.sort((a, b) => visibles.indexOf(a) - visibles.indexOf(b))
  return { sobreLasQueOperar: dentro, fueraDeLaVista: fuera }
}

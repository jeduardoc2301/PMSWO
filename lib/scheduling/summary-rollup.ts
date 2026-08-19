/**
 * Qué abarca cada resumen: el caso 11 de la batería del §12.
 *
 * ## Por qué hace falta
 *
 * Hasta aquí las fechas de un resumen salían de la base igual que las de cualquier otra línea. Eso
 * funciona el día que se importa el plan y deja de funcionar en cuanto alguien mueve un hijo: el
 * resumen se queda donde estaba y sigue diciendo una duración que ya no es la de su rama. Nada
 * falla, nada avisa — la barra simplemente miente, y miente en la fila que más se mira, porque es
 * la que se lee cuando el plan está plegado.
 *
 * El §3.6 lo dice sin rodeos y el §12 lo convierte en caso de prueba: un resumen con hijos del 1 al
 * 10 y del 5 al 20 abarca del 1 al 20.
 *
 * ## Qué NO hace
 *
 * No programa. El motor sigue sin programar resúmenes —no consumen recursos, no empujan a nadie por
 * sí mismos, y darles duración propia sería inventarse trabajo que no existe—. Aquí solo se
 * contesta qué abarcan una vez programados sus hijos, que es una pregunta de dibujo y de informe.
 *
 * Vive aparte del motor por eso mismo: quien programa no necesita esto, y quien dibuja sí.
 */

import type { IsoDate } from './date'

/** Lo mínimo que hace falta saber de una línea para resolver la jerarquía. */
export interface LineaConPadre {
  readonly id: string
  readonly parentId?: string
  readonly kind?: string
}

export interface Tramo {
  readonly start: IsoDate
  readonly finish: IsoDate
}

/**
 * Calcula el tramo que abarca cada resumen a partir de las fechas ya programadas de sus hijos.
 *
 * Solo devuelve entrada para los resúmenes que tienen al menos un descendiente programado. Un
 * resumen vacío no aparece: darle un rango de un día en el arranque del plan dibujaría una barra
 * donde no hay nada, y eso es peor que no dibujar ninguna.
 *
 * Las fechas se comparan como cadenas. Son fechas civiles `AAAA-MM-DD`, y en ese formato el orden
 * alfabético **es** el cronológico — convertirlas a `Date` para compararlas metería un huso por
 * medio sin ganar nada.
 *
 * @param lineas todas las líneas del plan, con su padre.
 * @param programadas las fechas que el motor calculó, por identificador. Los resúmenes pueden
 *   faltar: son justamente lo que se está resolviendo.
 */
export function fechasDeResumen(
  lineas: readonly LineaConPadre[],
  programadas: ReadonlyMap<string, Tramo>,
): ReadonlyMap<string, Tramo> {
  const hijosDe = new Map<string, string[]>()
  const porId = new Map<string, LineaConPadre>()
  for (const l of lineas) {
    porId.set(l.id, l)
    if (l.parentId === undefined) continue
    const lista = hijosDe.get(l.parentId)
    if (lista) lista.push(l.id)
    else hijosDe.set(l.parentId, [l.id])
  }

  const resultado = new Map<string, Tramo>()

  /**
   * El tramo de una línea: el suyo si está programada, o el que abarcan sus hijos.
   *
   * Recursiva y con memoria porque un abuelo necesita a su nieto ya resuelto. `enCurso` corta los
   * ciclos: la jerarquía no debería tener ninguno —hay una guardia al capturar el padre— pero esto
   * se ejecuta al dibujar, y colgar la vista es peor que devolver una rama corta.
   */
  const enCurso = new Set<string>()
  function tramoDe(id: string): Tramo | undefined {
    const propio = programadas.get(id)
    if (propio) return propio
    const ya = resultado.get(id)
    if (ya) return ya
    if (enCurso.has(id)) return undefined
    enCurso.add(id)

    let inicio: string | undefined
    let fin: string | undefined
    for (const hijo of hijosDe.get(id) ?? []) {
      const t = tramoDe(hijo)
      if (!t) continue
      if (inicio === undefined || t.start < inicio) inicio = t.start
      if (fin === undefined || t.finish > fin) fin = t.finish
    }

    enCurso.delete(id)
    if (inicio === undefined || fin === undefined) return undefined
    const tramo: Tramo = { start: inicio as IsoDate, finish: fin as IsoDate }
    resultado.set(id, tramo)
    return tramo
  }

  for (const l of lineas) {
    // Un resumen es el que tiene hijos. El `kind` lo confirma cuando está, pero no manda: una línea
    // marcada RESUMEN sin hijos no abarca nada, y una con hijos abarca su rama la marquen o no.
    if (!hijosDe.has(l.id)) continue
    tramoDe(l.id)
  }

  return resultado
}

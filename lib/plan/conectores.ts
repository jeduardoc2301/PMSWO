/**
 * Crear una dependencia arrastrando de una barra a otra (§4.4).
 *
 * ## De qué extremo a qué extremo
 *
 * El tipo de vínculo no se elige en un desplegable: sale de **por dónde se agarra y dónde se
 * suelta**. Es la parte del gesto que la gente no verbaliza pero sí entiende, porque cada tipo dice
 * literalmente qué extremo amarra a qué extremo:
 *
 * | Se agarra de | Se suelta en | Tipo | Se lee                                    |
 * |--------------|--------------|------|-------------------------------------------|
 * | fin          | inicio       | `FS` | «cuando termine A, empieza B»             |
 * | inicio       | inicio       | `SS` | «empiezan juntas»                         |
 * | fin          | fin          | `FF` | «terminan juntas»                         |
 * | inicio       | fin          | `SF` | «B no puede terminar antes de que A empiece» |
 *
 * `FS` es el noventa y tantos por ciento de los planes reales y es el que sale del gesto natural
 * —del final de una barra al principio de la siguiente—, que es exactamente como debe ser.
 *
 * ## Lo que se rechaza aquí y no en el servidor
 *
 * El servidor comprueba los ciclos y debe seguir haciéndolo: es quien responde de la integridad. Lo
 * que se comprueba aquí es lo que se sabe sin preguntar —una línea consigo misma, un vínculo que ya
 * existe—, porque enseñar un gesto que sale bien y luego un error es peor que no dejar hacerlo.
 */

import type { Dependency, LinkType } from '@/lib/scheduling/types'

/** Por qué extremo de la barra se agarra o se suelta. */
export type ExtremoDeBarra = 'INICIO' | 'FIN'

/** El tipo de vínculo que produce arrastrar de un extremo a otro. */
export function tipoDeVinculo(desde: ExtremoDeBarra, hasta: ExtremoDeBarra): LinkType {
  if (desde === 'FIN') return hasta === 'INICIO' ? 'FS' : 'FF'
  return hasta === 'INICIO' ? 'SS' : 'SF'
}

/** Cómo se lee el vínculo, para poder confirmarlo antes de escribirlo. */
export const COMO_SE_LEE: Readonly<Record<LinkType, string>> = Object.freeze({
  FS: 'cuando termine la primera, empieza la segunda',
  SS: 'las dos empiezan a la vez',
  FF: 'las dos terminan a la vez',
  SF: 'la segunda no puede terminar antes de que empiece la primera',
})

export interface VinculoPropuesto {
  readonly predecessorId: string
  readonly successorId: string
  readonly type: LinkType
  readonly lag: number
}

/**
 * ¿Se puede crear este vínculo?
 *
 * Devuelve `null` si se puede, o el motivo si no. El motivo se enseña: «no se puede» a secas
 * convierte un gesto en un misterio.
 *
 * No comprueba ciclos. Eso lo hace el servidor con el plan entero delante, y duplicarlo aquí daría
 * dos respuestas a la misma pregunta el día que una de las dos se quede atrás.
 */
export function porQueNo(
  propuesto: VinculoPropuesto,
  existentes: readonly Dependency[],
): string | null {
  if (propuesto.predecessorId === propuesto.successorId) {
    return 'Una línea no puede depender de sí misma.'
  }

  const yaEsta = existentes.find(
    (d) =>
      d.predecessorId === propuesto.predecessorId && d.successorId === propuesto.successorId,
  )
  if (yaEsta) {
    // Se nombra el tipo que ya hay: «ya existe» sin decir cuál obliga a ir a buscarlo.
    return `Ya existe un vínculo ${yaEsta.type} entre esas dos líneas.`
  }

  // El vínculo inverso también se rechaza aquí, aunque el servidor lo llamaría ciclo: el mensaje
  // que puede dar el servidor es «esto haría un ciclo», y para dos líneas la explicación útil es
  // más concreta.
  const alReves = existentes.find(
    (d) =>
      d.predecessorId === propuesto.successorId && d.successorId === propuesto.predecessorId,
  )
  if (alReves) {
    return 'Esas dos ya están vinculadas al revés: la segunda depende de la primera.'
  }

  return null
}

/**
 * La frase que se enseña antes de escribir.
 *
 * Se confirma porque un vínculo cambia las fechas de todo lo que cuelgue de la sucesora, y un gesto
 * de ratón es fácil de hacer sin querer — soltar en la barra de al lado en un plan denso pasa. El
 * arrastre horizontal ya previsualiza por la misma razón.
 */
export function comoSeLee(
  propuesto: VinculoPropuesto,
  nombres: ReadonlyMap<string, string>,
): string {
  const a = nombres.get(propuesto.predecessorId) ?? propuesto.predecessorId
  const b = nombres.get(propuesto.successorId) ?? propuesto.successorId
  return `«${a}» → «${b}» (${propuesto.type}): ${COMO_SE_LEE[propuesto.type]}.`
}

import type { WorkItemSummary } from '@/types'

export const SIN_FASE = '__NO_PHASE__'

/**
 * De qué fase es cada línea, **según el árbol** y no según un campo aparte.
 *
 * El Esquema llama «Etapa» al nivel 0 del plan y «Fase» al nivel 1 (§6.1), y hasta ahora el Tablero
 * y la lista llamaban fase a lo que dijera la columna `phase`, un texto libre que se escribe a mano
 * en el alta. Dos cosas con el mismo nombre en dos pestañas, que es justo lo que el §9.3 pide que no
 * pase: se podía crear una fase llamada «Fase» que no aparecía donde el Esquema decía que estaba.
 *
 * Medido sobre el plan de referencia antes de cambiar nada: de las 1 366 líneas con `phase`, **1 341
 * llevan por fase el título de uno de sus antepasados**, y las 25 restantes son los propios nodos de
 * fase, que se nombran a sí mismos. Los 25 viven **todos en el nivel 1**, y sólo 11 empiezan por
 * «Ola», así que era el nivel y no un patrón de nombre. El campo era una copia desnormalizada de
 * esto mismo: no eran dos ideas, era una guardada dos veces.
 *
 * Vive aquí y no dentro de una vista porque lo usan dos, y una regla de agrupación escrita dos veces
 * es una regla que en algún momento dirá dos cosas distintas sobre la misma línea.
 */

/** Lo mínimo que hace falta saber de una línea para colocarla en su rama. */
export type LineaDelArbol = Pick<WorkItemSummary, 'id' | 'title'> & {
  parentId?: string | null
  templateOrder?: number | null
}

export interface FasesDelArbol {
  /** El título de la fase de una línea, o `null` si no tiene (niveles 0 y 1 sin hijas). */
  faseDe: (id: string) => string | null
  /** De qué etapa cuelga cada fase, para que la cabecera se lea como una rama y no como una etiqueta. */
  etapaDeLaFase: Map<string, string>
  /** El orden en que van las bandas: el del propio nodo de fase dentro del plan. */
  rangoDeFases: Map<string, number>
}

/**
 * **Se le pasa el plan entero, nunca lo filtrado.**
 *
 * Con un filtro puesto el antepasado de nivel 1 puede no estar en la lista, el ascenso se corta
 * creyendo que llegó a la raíz, y la tarjeta aparece en «Sin fase» —lejos de sus hermanas— justo
 * cuando el filtro se puso para no perderla de vista.
 */
export function construirFases(lineas: readonly LineaDelArbol[]): FasesDelArbol {
  const padreDe = new Map(lineas.map((l) => [l.id, l.parentId ?? null]))
  const nombreDe = new Map(lineas.map((l) => [l.id, l.title]))
  const ordenDe = new Map(lineas.map((l) => [l.id, l.templateOrder ?? Number.MAX_SAFE_INTEGER]))
  const esRaiz = (id: string) => (padreDe.get(id) ?? null) === null

  // «Encabezar algo» es *tener hijas*, nunca `kind`. En el plan real hay 125 líneas con hijas y 121
  // marcadas RESUMEN: mirar el campo se equivoca en cuatro de cada cinco discrepancias.
  const conHijas = new Set<string>()
  for (const l of lineas) if (l.parentId) conHijas.add(l.parentId)

  /** Qué línea de nivel 1 manda sobre cada una. `null` en los niveles 0 y 1. */
  const memoria = new Map<string, string | null>()

  /*
    Se sube guardando el camino, porque en un plan de cinco niveles y mil trescientas líneas
    resolverlas una a una repetiría el mismo tramo cientos de veces.

    Y sólo se memoriza a los que **de verdad comparten la respuesta**: los del camino están todos a
    profundidad dos o más —se apilan después de comprobar que tienen abuela— y por eso su antepasado
    de nivel 1 es el mismo. Guardar también la raíz le pegaría a la etapa la fase de la descendiente
    que pasó por ahí primero, y entonces la etapa saldría dentro de la banda de una de sus nietas
    según en qué orden se hubiera preguntado.
  */
  const nivel1De = (id: string): string | null => {
    const camino: string[] = []
    let actual: string | null = id
    let resultado: string | null = null
    const visto = new Set<string>()
    while (actual !== null && !visto.has(actual)) {
      const yaEsta = memoria.get(actual)
      if (yaEsta !== undefined) { resultado = yaEsta; break }
      if (esRaiz(actual)) { resultado = null; break }
      const padre = padreDe.get(actual) as string
      if (esRaiz(padre)) { resultado = actual; break }
      visto.add(actual)
      camino.push(actual)
      actual = padre
    }
    if (actual !== null) memoria.set(actual, resultado)
    for (const paso of camino) memoria.set(paso, resultado)
    return resultado
  }

  /*
    Una línea de nivel 1 **se nombra a sí misma**, que es literalmente lo que hacía el importador
    (`plan-import.service.ts`: `if (fila.level === 1) return fila.name`), pero sólo si encabeza algo.
    Un nivel 1 sin hijas no es una fase: es una tarea colgada derecho de la etapa, y darle banda
    propia repetiría la misma frase en la cabecera y en la única tarjeta.
  */
  const idDeLaFase = (id: string): string | null => {
    const n1 = nivel1De(id)
    if (n1 === null) return null
    if (n1 === id && !conHijas.has(id)) return null
    return n1
  }

  const faseDe = (id: string): string | null => {
    const n1 = idDeLaFase(id)
    return n1 === null ? null : nombreDe.get(n1) ?? null
  }

  const raizDe = (id: string): string | null => {
    let actual = id
    const visto = new Set<string>()
    for (;;) {
      const padre = padreDe.get(actual) ?? null
      if (padre === null || visto.has(actual)) return nombreDe.get(actual) ?? null
      visto.add(actual)
      actual = padre
    }
  }

  const etapaDeLaFase = new Map<string, string>()
  /*
    El orden de las bandas es el del **propio nodo** de fase, no el mínimo de sus hijas.

    Antes salía de recorrer las líneas buscando el `templateOrder` más bajo de cada texto de fase, y
    eso funcionaba sólo porque la madre venía delante en el plan. En cuanto una fase se queda sin
    hijas visibles, o una línea capturada a mano hereda un orden raro, el mínimo deja de ser el sitio
    de la fase. El nodo sabe dónde está: no hace falta deducirlo.
  */
  const rangoDeFases = new Map<string, number>()
  for (const l of lineas) {
    const n1 = idDeLaFase(l.id)
    if (n1 === null) continue
    const nombre = nombreDe.get(n1)
    if (nombre === undefined) continue
    if (!rangoDeFases.has(nombre)) rangoDeFases.set(nombre, ordenDe.get(n1) ?? Number.MAX_SAFE_INTEGER)
    if (!etapaDeLaFase.has(nombre)) {
      const etapa = raizDe(n1)
      // Sólo si la etapa no es la fase misma: repetir el nombre encima no informa de nada.
      if (etapa !== null && etapa !== nombre) etapaDeLaFase.set(nombre, etapa)
    }
  }

  return { faseDe, etapaDeLaFase, rangoDeFases }
}

/**
 * Comparador de bandas por su sitio en el plan. «Sin fase» va al final, y el nombre desempata
 * las que se capturaron a mano y no tienen orden.
 */
export function compararFases(rango: Map<string, number>, sinFase: string = SIN_FASE) {
  return (a: string, b: string): number => {
    if (a === sinFase) return 1
    if (b === sinFase) return -1
    const ra = rango.get(a) ?? Number.MAX_SAFE_INTEGER
    const rb = rango.get(b) ?? Number.MAX_SAFE_INTEGER
    if (ra !== rb) return ra - rb
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  }
}

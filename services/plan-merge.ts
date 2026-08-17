/**
 * El plan del refresco: qué cambia, qué se conserva y qué se retira al reimportar.
 *
 * Reimportar un plan no puede ser borrar y volver a crear: entre una importación y la siguiente, la
 * plataforma acumuló trabajo propio —avance capturado línea por línea, tarjetas movidas en el
 * kanban, el corte congelado— y pisarlo convertiría cada refresco del archivo en una pérdida. Este
 * módulo decide el destino de cada línea **sin tocar la base**: es una función pura que recibe lo
 * que trae el archivo y lo que hay en la plataforma, y devuelve las operaciones. Quien la llama las
 * ejecuta; quien la prueba no necesita base de datos.
 *
 * ## La llave del emparejamiento es `sourceId`
 *
 * El número de fila del archivo (1..N) se persistió en cada elemento justamente para esto: es la
 * identidad estable entre versiones del archivo. Los UUID de la plataforma no viajan al Excel y los
 * nombres se editan; el número de línea es lo que el archivo mismo usa para referirse a sus filas
 * (las predecesoras se escriben con él).
 *
 * ## La política del avance: el archivo manda cuando dice algo
 *
 * Hoy el avance se captura en el Excel; mañana, en la plataforma. Durante la transición van a
 * convivir, y la regla es una y está escrita:
 *
 *   - Si la celda del archivo trae avance **mayor que cero**, ese valor gana. El archivo es la
 *     captura de registro cuando habla.
 *   - Si la celda trae cero —o nada—, se conserva lo capturado en la plataforma. Un cero del
 *     archivo no distingue «no ha empezado» de «no lo he capturado aquí», y ante esa ambigüedad
 *     destruir la captura local es el error caro.
 *
 * Bajar un avance a cero desde el archivo, por tanto, **no es posible por reimportación** — se hace
 * en la plataforma, donde la intención es inequívoca.
 */

import type { ImportedRow } from '@/lib/scheduling/import-plan'

/** Lo que el merge necesita saber de un elemento que ya vive en la plataforma. */
export interface ElementoExistente {
  readonly id: string
  /** El número de fila del archivo con el que se importó. Nulo en elementos creados a mano. */
  readonly sourceId: string | null
  readonly progressPct: number
  readonly status: string
}

export interface LineaResuelta {
  /** El renglón del archivo, con todo lo que trae. */
  readonly fila: ImportedRow
  /** El avance que debe quedar, ya resuelta la política. */
  readonly progress: number
  /** De dónde salió ese avance, para poder reportarlo. */
  readonly avanceDe: 'ARCHIVO' | 'PLATAFORMA'
}

export interface PlanDeRefresco {
  /** Filas del archivo que ya existen: se actualizan sobre su UUID. */
  readonly actualizar: readonly (LineaResuelta & { readonly elementoId: string })[]
  /** Filas nuevas del archivo: se crean. */
  readonly crear: readonly LineaResuelta[]
  /**
   * Elementos importados cuya fila ya no está en el archivo: se retiran, y se reportan uno por uno
   * — un renglón que desaparece del plan es una decisión de alguien, no un detalle.
   */
  readonly retirar: readonly ElementoExistente[]
  /**
   * Elementos creados a mano en la plataforma (sin `sourceId`): el refresco no los toca. El archivo
   * no sabe de ellos y no le corresponde decidir su destino.
   */
  readonly ajenos: readonly ElementoExistente[]
  /** Cuántas líneas conservaron avance capturado en la plataforma. */
  readonly avancesConservados: number
}

export function planDeRefresco(
  filas: readonly ImportedRow[],
  existentes: readonly ElementoExistente[],
): PlanDeRefresco {
  const porSourceId = new Map<string, ElementoExistente>()
  const ajenos: ElementoExistente[] = []
  for (const elemento of existentes) {
    if (elemento.sourceId === null) ajenos.push(elemento)
    else porSourceId.set(elemento.sourceId, elemento)
  }

  const actualizar: (LineaResuelta & { elementoId: string })[] = []
  const crear: LineaResuelta[] = []
  let avancesConservados = 0
  const vistas = new Set<string>()

  for (const fila of filas) {
    vistas.add(fila.source.id)
    const existente = porSourceId.get(fila.source.id)
    const delArchivo = fila.progress ?? 0

    if (!existente) {
      crear.push({ fila, progress: delArchivo, avanceDe: 'ARCHIVO' })
      continue
    }

    const conservaPlataforma = delArchivo <= 0 && existente.progressPct > 0
    if (conservaPlataforma) avancesConservados += 1

    actualizar.push({
      fila,
      elementoId: existente.id,
      progress: conservaPlataforma ? existente.progressPct : delArchivo,
      avanceDe: conservaPlataforma ? 'PLATAFORMA' : 'ARCHIVO',
    })
  }

  const retirar = [...porSourceId.values()].filter((elemento) => !vistas.has(elemento.sourceId!))

  return { actualizar, crear, retirar, ajenos, avancesConservados }
}

/**
 * Avance ponderado por trabajo real.
 *
 * El error que este módulo existe para evitar: ponderar el avance de un resumen por su **duración**.
 * La duración de un resumen no es trabajo — es el lapso de calendario que abarca, desde que empieza
 * la primera de sus hijas hasta que termina la última. Un bloque de tres tareas estirado sobre tres
 * meses tiene una duración de tres meses; uno de ochenta y dos tareas concentrado en tres semanas
 * tiene una de tres semanas. Ponderado por duración, el primero pesa cuatro veces más que el
 * segundo, y el plan reporta un avance que no se parece a nada.
 *
 * El peso correcto es el **trabajo**: la suma de los días hábiles de las hojas que cuelgan. Una hoja
 * pesa lo que dura; un resumen pesa lo que pesan sus hijas. Nada más.
 *
 *     avance(resumen) = Σ(peso_i × avance_i) / Σ(peso_i)
 */

import type { PlanTask } from './types'

/** Error en la jerarquía del plan. */
export class HierarchyError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'HierarchyError'
    this.code = code
  }
}

export interface WeightedTask {
  readonly id: string
  readonly name: string
  readonly parentId: string | null
  /** Verdadero si de esta línea cuelga alguna otra. */
  readonly isSummary: boolean
  /** Qué tan hondo está: cero en la raíz. */
  readonly depth: number
  readonly children: readonly string[]
  /**
   * Peso en días hábiles de trabajo.
   *
   * Una hoja pesa su duración. Un resumen pesa la suma de sus hijas. Un hito pesa cero: marca un
   * momento, no consume trabajo.
   */
  readonly weight: number
  /** Avance de 0 a 1. En un resumen, el de sus hijas ponderado por peso. */
  readonly progress: number
  /** Días hábiles ya cubiertos: peso por avance. Es lo que se suma hacia arriba. */
  readonly earnedDays: number
}

export interface ProgressRollup {
  readonly tasks: readonly WeightedTask[]
  readonly byId: ReadonlyMap<string, WeightedTask>
  /** Líneas que no cuelgan de ninguna otra. */
  readonly roots: readonly string[]
  /** Avance del plan completo, ponderado por trabajo. */
  readonly progress: number
  /** Días hábiles de trabajo que tiene el plan. */
  readonly totalWeight: number
  /** Días hábiles ya cubiertos. */
  readonly earnedDays: number
}

/**
 * Calcula el peso y el avance ponderado de todas las líneas del plan.
 *
 * @throws HierarchyError si una línea cuelga de otra que no existe, de sí misma, o si la jerarquía
 *   se cierra sobre sí misma.
 */
export function rollUpProgress(tasks: readonly PlanTask[]): ProgressRollup {
  const byId = new Map<string, PlanTask>()
  for (const task of tasks) {
    if (byId.has(task.id)) {
      throw new HierarchyError('TAREA_DUPLICADA', `Hay más de una línea con el identificador «${task.id}».`)
    }
    byId.set(task.id, task)
  }

  const children = new Map<string, string[]>()
  const roots: string[] = []

  for (const task of tasks) {
    children.set(task.id, [])
  }

  for (const task of tasks) {
    const parentId = task.parentId
    if (parentId === undefined || parentId === null) {
      roots.push(task.id)
      continue
    }
    if (parentId === task.id) {
      throw new HierarchyError('AUTORREFERENCIA', `La línea «${task.name}» cuelga de sí misma.`)
    }
    const parent = byId.get(parentId)
    if (!parent) {
      throw new HierarchyError(
        'PADRE_INEXISTENTE',
        `La línea «${task.name}» cuelga de «${parentId}», que no está en el plan.`,
      )
    }
    children.get(parentId)!.push(task.id)
  }

  const depth = computeDepths(tasks, byId, roots, children)

  // De abajo hacia arriba: una línea se resuelve cuando sus hijas ya están resueltas. Se recorre en
  // orden de profundidad descendente, que garantiza justo eso sin recursión.
  const order = [...tasks].map((task) => task.id).sort((a, b) => depth.get(b)! - depth.get(a)!)

  const weight = new Map<string, number>()
  const earned = new Map<string, number>()
  const progress = new Map<string, number>()

  for (const id of order) {
    const task = byId.get(id)!
    const kids = children.get(id)!

    if (kids.length === 0) {
      const own = clampProgress(task.progress ?? 0, task.name)
      const ownWeight = leafWeight(task)
      weight.set(id, ownWeight)
      earned.set(id, ownWeight * own)
      progress.set(id, own)
      continue
    }

    let totalWeight = 0
    let totalEarned = 0
    for (const kid of kids) {
      totalWeight += weight.get(kid)!
      totalEarned += earned.get(kid)!
    }

    weight.set(id, totalWeight)
    earned.set(id, totalEarned)
    // Un bloque que solo agrupa hitos no pesa nada, y no se puede ponderar por cero. Ahí el avance
    // es el promedio simple de las hijas: si las tres ocurrieron, el bloque ocurrió.
    progress.set(id, totalWeight > 0 ? totalEarned / totalWeight : simpleMean(kids, progress))
  }

  const weighted: WeightedTask[] = tasks.map((task) => ({
    id: task.id,
    name: task.name,
    parentId: task.parentId ?? null,
    isSummary: children.get(task.id)!.length > 0,
    depth: depth.get(task.id)!,
    children: Object.freeze([...children.get(task.id)!]),
    weight: weight.get(task.id)!,
    progress: progress.get(task.id)!,
    earnedDays: earned.get(task.id)!,
  }))

  let planWeight = 0
  let planEarned = 0
  for (const id of roots) {
    planWeight += weight.get(id)!
    planEarned += earned.get(id)!
  }

  return Object.freeze({
    tasks: Object.freeze(weighted),
    byId: new Map(weighted.map((task) => [task.id, task])),
    roots: Object.freeze(roots),
    progress: planWeight > 0 ? planEarned / planWeight : simpleMean(roots, progress),
    totalWeight: planWeight,
    earnedDays: planEarned,
  })
}

/**
 * Deriva la jerarquía a partir de una columna de nivel.
 *
 * Es como llega un plan exportado de MS Project: no trae identificador de padre, trae un número de
 * sangría por línea. El padre de una línea es la anterior de nivel menor.
 *
 * @throws HierarchyError si el nivel salta más de uno hacia abajo — una línea de nivel 3 después de
 *   una de nivel 1 no tiene padre posible, y adivinarlo sería inventar estructura.
 */
export function parentsFromLevels(
  rows: ReadonlyArray<{ id: string; name: string; level: number }>,
): Map<string, string | null> {
  const parents = new Map<string, string | null>()
  /** Último identificador visto en cada nivel. */
  const lastAtLevel: string[] = []

  for (const row of rows) {
    if (!Number.isInteger(row.level) || row.level < 0) {
      throw new HierarchyError(
        'NIVEL_INVALIDO',
        `La línea «${row.name}» tiene nivel ${row.level}. El nivel es un entero de cero en adelante.`,
      )
    }
    if (row.level > lastAtLevel.length) {
      throw new HierarchyError(
        'SALTO_DE_NIVEL',
        `La línea «${row.name}» está en el nivel ${row.level}, pero la anterior no pasa del ` +
          `${lastAtLevel.length - 1}. Falta la línea que debería contenerla.`,
      )
    }

    parents.set(row.id, row.level === 0 ? null : lastAtLevel[row.level - 1])
    lastAtLevel.length = row.level
    lastAtLevel.push(row.id)
  }

  return parents
}

/** El peso propio de una hoja: lo que dura. Un hito no consume trabajo. */
function leafWeight(task: PlanTask): number {
  return task.duration > 0 ? task.duration : 0
}

function clampProgress(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new HierarchyError(
      'AVANCE_FUERA_DE_RANGO',
      `La línea «${name}» tiene un avance de ${value}. El avance va de 0 a 1.`,
    )
  }
  return value
}

function simpleMean(ids: readonly string[], progress: ReadonlyMap<string, number>): number {
  if (ids.length === 0) return 0
  let total = 0
  for (const id of ids) total += progress.get(id) ?? 0
  return total / ids.length
}

/**
 * Profundidad de cada línea, y de paso la comprobación de que la jerarquía no se cierra sobre sí
 * misma: si al recorrer desde las raíces no se llegó a todas, las que faltan forman un ciclo.
 */
function computeDepths(
  tasks: readonly PlanTask[],
  byId: ReadonlyMap<string, PlanTask>,
  roots: readonly string[],
  children: ReadonlyMap<string, readonly string[]>,
): Map<string, number> {
  const depth = new Map<string, number>()
  const pending: Array<{ id: string; level: number }> = roots.map((id) => ({ id, level: 0 }))

  while (pending.length > 0) {
    const { id, level } = pending.pop()!
    depth.set(id, level)
    for (const kid of children.get(id)!) {
      pending.push({ id: kid, level: level + 1 })
    }
  }

  if (depth.size !== tasks.length) {
    const loose = tasks.filter((task) => !depth.has(task.id)).map((task) => `«${task.name}»`)
    throw new HierarchyError(
      'JERARQUIA_CIRCULAR',
      `Estas líneas cuelgan unas de otras en círculo y ninguna llega a la raíz: ${loose.join(', ')}.`,
    )
  }

  return depth
}

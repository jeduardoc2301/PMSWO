/**
 * Dependencias entre tareas: cómo se leen de un texto, cómo se validan y en qué orden se recorren.
 *
 * Aquí no se calculan fechas. Este módulo solo garantiza que el grafo sobre el que va a trabajar el
 * motor es coherente: que toda predecesora existe, que ninguna tarea depende de sí misma y que no
 * hay ciclos. Un ciclo no se puede programar, y descubrirlo a la mitad de un recálculo daría un
 * plan a medias en lugar de un error claro.
 */

import { type Dependency, type LinkType, type PlanTask, type PredecessorRef, isLinkType } from './types'

/** Error del motor de planeación. `code` es estable; el mensaje es para leerse. */
export class SchedulingError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'SchedulingError'
    this.code = code
  }
}

/**
 * El plan tiene un ciclo de dependencias.
 *
 * El error nombra las tareas del ciclo, porque saber que «hay un ciclo» no sirve de nada: lo que se
 * necesita es cuál vínculo hay que cortar.
 */
export class DependencyCycleError extends SchedulingError {
  /** Identificadores de las tareas del ciclo, en orden. La última vuelve sobre la primera. */
  readonly cycle: readonly string[]

  constructor(cycle: readonly string[], names: readonly string[]) {
    const trail = [...names, names[0]].join(' → ')
    super(
      'CICLO_DE_DEPENDENCIAS',
      `El plan tiene un ciclo de dependencias: ${trail}. Ninguna de estas tareas puede empezar, ` +
        'porque cada una espera a otra del mismo grupo. Hay que quitar uno de esos vínculos.',
    )
    this.name = 'DependencyCycleError'
    this.cycle = Object.freeze([...cycle])
  }
}

/** Unidades que se aceptan en el desfase. Todas significan días hábiles. */
const BUSINESS_DAY_UNITS = new Set(['', 'd', 'day', 'days', 'dia', 'dias'])

/** Unidades de días corridos. Se rechazan a propósito: ver `parsePredecessors`. */
const ELAPSED_DAY_UNITS = new Set(['ed', 'eday', 'edays', 'dc'])

const PREDECESSOR_PATTERN = /^(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+)\s*(\p{L}*\.?)\s*)?$/iu

export interface ParsePredecessorsOptions {
  /** Tipo que se asume cuando el texto no lo dice. En MS Project es fin-comienzo. */
  readonly defaultType?: LinkType
}

/**
 * Lee una celda de predecesoras en la notación de MS Project.
 *
 * Acepta las dos formas que aparecen en la práctica, porque Project escribe en el idioma de quien
 * lo tenga instalado: separadas por coma o por punto y coma, con la unidad en inglés o en español.
 * Estas dos líneas significan lo mismo:
 *
 *     288,302FF,258FS+3 days
 *     288; 302FF; 258FS+3 días
 *
 * Un identificador solo, sin sufijo, es fin-comienzo con desfase cero.
 *
 * @throws SchedulingError si un tramo no se entiende, o si trae días corridos. Los días corridos
 *   («edays» en Project) atraviesan fines de semana, y tratarlos como hábiles correría las fechas
 *   sin avisar. Es preferible negarse a leerlos que adivinar.
 */
export function parsePredecessors(
  text: string | null | undefined,
  options: ParsePredecessorsOptions = {},
): PredecessorRef[] {
  if (text === null || text === undefined) return []

  const defaultType = options.defaultType ?? 'FS'
  const refs: PredecessorRef[] = []

  for (const rawToken of text.split(/[,;]/)) {
    const token = rawToken.trim()
    if (token === '') continue

    const match = PREDECESSOR_PATTERN.exec(token)
    if (!match) {
      throw new SchedulingError(
        'PREDECESORA_ILEGIBLE',
        `No se entiende la predecesora «${token}». Se esperaba algo como «12», «12FF» o «12FS+3 días».`,
      )
    }

    const [, id, rawType, sign, amount, rawUnit] = match
    const unit = normalizeUnit(rawUnit ?? '')

    if (ELAPSED_DAY_UNITS.has(unit)) {
      throw new SchedulingError(
        'DESFASE_EN_DIAS_CORRIDOS',
        `La predecesora «${token}» declara el desfase en días corridos. El plan se mide en días ` +
          'hábiles; hay que convertirlo antes de cargarlo.',
      )
    }
    if (!BUSINESS_DAY_UNITS.has(unit)) {
      throw new SchedulingError(
        'UNIDAD_DE_DESFASE_DESCONOCIDA',
        `No se reconoce la unidad «${rawUnit}» en la predecesora «${token}». El desfase se expresa ` +
          'en días hábiles.',
      )
    }

    const magnitude = amount === undefined ? 0 : Number(amount)

    refs.push({
      predecessorId: id,
      type: rawType ? (rawType.toUpperCase() as LinkType) : defaultType,
      lag: sign === '-' ? -magnitude : magnitude,
    })
  }

  return refs
}

/** Escribe una lista de predecesoras en la notación de MS Project, en español. */
export function formatPredecessors(refs: readonly PredecessorRef[]): string {
  return refs
    .map((ref) => {
      const type = ref.type === 'FS' ? '' : ref.type
      if (ref.lag === 0) return `${ref.predecessorId}${type}`
      const sign = ref.lag > 0 ? '+' : '-'
      const magnitude = Math.abs(ref.lag)
      const unit = magnitude === 1 ? 'día' : 'días'
      return `${ref.predecessorId}${type || 'FS'}${sign}${magnitude} ${unit}`
    })
    .join('; ')
}

/** Convierte las referencias de una tarea en dependencias completas. */
export function toDependencies(successorId: string, refs: readonly PredecessorRef[]): Dependency[] {
  return refs.map((ref) => ({
    predecessorId: ref.predecessorId,
    successorId,
    type: ref.type,
    lag: ref.lag,
  }))
}

export interface DependencyGraph {
  readonly tasks: readonly PlanTask[]
  readonly taskById: ReadonlyMap<string, PlanTask>
  readonly dependencies: readonly Dependency[]
  /** Vínculos que entran a cada tarea, es decir los que la pueden retrasar. */
  readonly incoming: ReadonlyMap<string, readonly Dependency[]>
  /** Vínculos que salen de cada tarea. */
  readonly outgoing: ReadonlyMap<string, readonly Dependency[]>
  /** Orden en que se pueden recorrer las tareas sin visitar ninguna antes que sus predecesoras. */
  readonly order: readonly string[]
}

/**
 * Valida el conjunto de tareas y vínculos, y devuelve el grafo listo para recorrer.
 *
 * @throws SchedulingError ante identificadores repetidos, duraciones imposibles, predecesoras que
 *   no existen, autorreferencias o vínculos duplicados.
 * @throws DependencyCycleError si hay un ciclo, con las tareas nombradas.
 */
export function buildDependencyGraph(
  tasks: readonly PlanTask[],
  dependencies: readonly Dependency[],
): DependencyGraph {
  const taskById = new Map<string, PlanTask>()

  for (const task of tasks) {
    if (taskById.has(task.id)) {
      throw new SchedulingError(
        'TAREA_DUPLICADA',
        `Hay más de una tarea con el identificador «${task.id}»: «${taskById.get(task.id)!.name}» y «${task.name}».`,
      )
    }
    if (!Number.isInteger(task.duration) || task.duration < 0) {
      throw new SchedulingError(
        'DURACION_INVALIDA',
        `La tarea «${task.name}» tiene una duración de ${task.duration}. La duración se cuenta en ` +
          'días hábiles enteros y no puede ser negativa.',
      )
    }
    taskById.set(task.id, task)
  }

  const incoming = new Map<string, Dependency[]>()
  const outgoing = new Map<string, Dependency[]>()
  for (const task of tasks) {
    incoming.set(task.id, [])
    outgoing.set(task.id, [])
  }

  const seenPairs = new Set<string>()

  for (const dependency of dependencies) {
    const predecessor = taskById.get(dependency.predecessorId)
    const successor = taskById.get(dependency.successorId)

    if (!successor) {
      throw new SchedulingError(
        'SUCESORA_INEXISTENTE',
        `Un vínculo apunta a la tarea «${dependency.successorId}», que no está en el plan.`,
      )
    }
    if (!predecessor) {
      throw new SchedulingError(
        'PREDECESORA_INEXISTENTE',
        `La tarea «${successor.name}» depende de «${dependency.predecessorId}», que no está en el plan.`,
      )
    }
    if (dependency.predecessorId === dependency.successorId) {
      throw new SchedulingError(
        'AUTORREFERENCIA',
        `La tarea «${successor.name}» aparece como predecesora de sí misma.`,
      )
    }
    if (!isLinkType(dependency.type)) {
      throw new SchedulingError(
        'TIPO_DE_VINCULO_DESCONOCIDO',
        `El vínculo entre «${predecessor.name}» y «${successor.name}» declara el tipo ` +
          `«${String(dependency.type)}». Los tipos válidos son FS, SS, FF y SF.`,
      )
    }
    if (!Number.isInteger(dependency.lag)) {
      throw new SchedulingError(
        'DESFASE_INVALIDO',
        `El vínculo entre «${predecessor.name}» y «${successor.name}» tiene un desfase de ` +
          `${dependency.lag}. El desfase se cuenta en días hábiles enteros.`,
      )
    }

    const pair = `${dependency.predecessorId} ${dependency.successorId}`
    if (seenPairs.has(pair)) {
      throw new SchedulingError(
        'VINCULO_DUPLICADO',
        `Hay más de un vínculo entre «${predecessor.name}» y «${successor.name}». Dos tareas se ` +
          'relacionan de una sola forma; con dos vínculos no se sabe cuál manda.',
      )
    }
    seenPairs.add(pair)

    incoming.get(dependency.successorId)!.push(dependency)
    outgoing.get(dependency.predecessorId)!.push(dependency)
  }

  const order = topologicalOrder(tasks, outgoing, incoming, taskById)

  return Object.freeze({
    tasks: Object.freeze([...tasks]),
    taskById,
    dependencies: Object.freeze([...dependencies]),
    incoming,
    outgoing,
    order,
  })
}

/** Ordena las tareas de modo que ninguna aparezca antes que sus predecesoras. */
function topologicalOrder(
  tasks: readonly PlanTask[],
  outgoing: ReadonlyMap<string, readonly Dependency[]>,
  incoming: ReadonlyMap<string, readonly Dependency[]>,
  taskById: ReadonlyMap<string, PlanTask>,
): readonly string[] {
  const pending = new Map<string, number>()
  const ready: string[] = []

  for (const task of tasks) {
    const count = incoming.get(task.id)!.length
    pending.set(task.id, count)
    if (count === 0) ready.push(task.id)
  }

  const order: string[] = []
  let cursor = 0

  while (cursor < ready.length) {
    const id = ready[cursor]
    cursor += 1
    order.push(id)

    for (const dependency of outgoing.get(id)!) {
      const left = pending.get(dependency.successorId)! - 1
      pending.set(dependency.successorId, left)
      if (left === 0) ready.push(dependency.successorId)
    }
  }

  if (order.length !== tasks.length) {
    const cycle = findCycle(tasks, outgoing)
    throw new DependencyCycleError(
      cycle,
      cycle.map((id) => taskById.get(id)!.name),
    )
  }

  return Object.freeze(order)
}

/**
 * Encuentra un ciclo concreto y lo devuelve en orden.
 *
 * Se recorre en profundidad con una pila explícita en lugar de recursión: un plan real puede tener
 * cadenas de miles de tareas y la recursión se quedaría sin pila justo en los planes que importan.
 */
function findCycle(
  tasks: readonly PlanTask[],
  outgoing: ReadonlyMap<string, readonly Dependency[]>,
): readonly string[] {
  const UNVISITED = 0
  const IN_PROGRESS = 1
  const DONE = 2

  const state = new Map<string, number>()
  for (const task of tasks) state.set(task.id, UNVISITED)

  for (const task of tasks) {
    if (state.get(task.id) !== UNVISITED) continue

    const stack: Array<{ id: string; edge: number }> = [{ id: task.id, edge: 0 }]
    state.set(task.id, IN_PROGRESS)

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]
      const edges = outgoing.get(frame.id)!

      if (frame.edge >= edges.length) {
        state.set(frame.id, DONE)
        stack.pop()
        continue
      }

      const nextId = edges[frame.edge].successorId
      frame.edge += 1

      if (state.get(nextId) === IN_PROGRESS) {
        const cycle: string[] = []
        for (let i = stack.length - 1; i >= 0; i -= 1) {
          cycle.push(stack[i].id)
          if (stack[i].id === nextId) break
        }
        return cycle.reverse()
      }
      if (state.get(nextId) === UNVISITED) {
        state.set(nextId, IN_PROGRESS)
        stack.push({ id: nextId, edge: 0 })
      }
    }
  }

  // Kahn solo deja tareas sin ordenar cuando hay un ciclo, así que aquí no se llega.
  throw new SchedulingError('CICLO_NO_LOCALIZADO', 'El plan no se puede ordenar y no se localizó el ciclo.')
}

/** Quita acentos y pasa a minúsculas, para comparar unidades escritas de cualquier forma. */
function normalizeUnit(unit: string): string {
  return unit
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.$/, '')
}

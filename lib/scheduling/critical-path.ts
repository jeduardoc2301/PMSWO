/**
 * Ruta crítica y Ruta Súper Crítica.
 *
 * La ruta crítica clásica —holgura cero— es necesaria pero insuficiente. En un plan construido
 * desde una fecha de compromiso hacia atrás casi todo sale crítico: en el plan de referencia, tres
 * de cada cuatro tareas. Una ruta crítica que abarca tres cuartas partes del proyecto no le sirve a
 * nadie, porque no permite decidir dónde poner la atención.
 *
 * La segunda clasificación responde una pregunta distinta sobre esas mismas tareas sin holgura:
 * **¿esto se recupera metiendo más recursos?** Donde la respuesta es no, meter gente no arregla
 * nada y el atraso se vuelve fecha de cierre.
 *
 * La intersección «sin holgura» ∩ «no recuperable» es la **Ruta Súper Crítica**. Y sobre ella, el
 * dato que cambia una conversación de comité: cuánto de eso depende del cliente y cuánto del
 * proveedor. En el plan de referencia, casi la mitad es del cliente.
 *
 * ## Marcar a mano y sugerir por regla
 *
 * Las sugerencias salen de la **estructura** del plan, no de leer los nombres de las tareas:
 *
 * - una línea que el cliente aprueba o entrega la decide un tercero;
 * - un punto de control es un Go/No-Go, y también lo decide un tercero;
 * - una tarea con fecha impuesta es una fecha pactada, por definición;
 * - el tiempo transcurrido no se deduce de nada: se declara.
 *
 * Buscar palabras en el nombre de la tarea sería más cómodo y se rompería en cuanto alguien
 * redactara distinto. La marca a mano siempre gana sobre la sugerencia, porque quien conoce el
 * proyecto sabe cosas que el modelo no.
 */

import type { AnalyzedTask, CriticalPathAnalysis } from './cpm'
import type { PlanTask, Recoverability, ResponsibleParty, TaskKind } from './types'

export interface ClassifiedTask extends AnalyzedTask {
  readonly kind: TaskKind
  readonly party: ResponsibleParty
  readonly recoverability: Recoverability
  /** Sin holgura y además no recuperable. */
  readonly isSuperCritical: boolean
  /** De dónde salió la clasificación. */
  readonly classifiedBy: 'MANUAL' | 'REGLA'
  /** Por qué la regla sugirió eso, en una línea que se puede mostrar. */
  readonly reason: string
}

export interface SuperCriticalAnalysis {
  readonly tasks: readonly ClassifiedTask[]
  readonly byId: ReadonlyMap<string, ClassifiedTask>
  /** Tareas con holgura cero o negativa: la ruta crítica clásica. */
  readonly criticalCount: number
  /** Tareas con holgura exactamente cero. */
  readonly zeroFloatCount: number
  /** La intersección: sin holgura y no recuperable. */
  readonly superCriticalCount: number
  /** Reparto de la ruta súper crítica por familia de irrecuperabilidad. */
  readonly superCriticalByReason: Readonly<Record<Recoverability, number>>
  /** Reparto de la ruta súper crítica por responsable. Es el dato de comité. */
  readonly superCriticalByParty: Readonly<Record<ResponsibleParty, number>>
  /** Universo sobre el que se calcularon los porcentajes. */
  readonly total: number
  readonly finish: string
}

export interface ClassifyOptions {
  /**
   * Aplicar las reglas de sugerencia. Apagarlo deja solo lo marcado a mano, que es lo que conviene
   * cuando el plan ya viene clasificado desde su origen y no se quiere que el motor opine.
   */
  readonly suggest?: boolean
  /**
   * Excluir las líneas de resumen del conteo. Un resumen no se ejecuta: hereda las fechas de sus
   * hijas, y contarlo infla la ruta crítica con líneas que nadie puede acelerar ni atrasar.
   */
  readonly excludeSummaries?: boolean
}

/**
 * Clasifica la ruta crítica y extrae la Ruta Súper Crítica.
 *
 * @param analysis resultado del pase atrás.
 * @param tasks las tareas del plan con su clase, responsable y marcas a mano.
 */
export function classifySuperCritical(
  analysis: CriticalPathAnalysis,
  tasks: readonly PlanTask[],
  options: ClassifyOptions = {},
): SuperCriticalAnalysis {
  const suggest = options.suggest ?? true
  const excludeSummaries = options.excludeSummaries ?? false

  const source = new Map(tasks.map((task) => [task.id, task]))

  const classified: ClassifiedTask[] = []
  const byReason: Record<Recoverability, number> = {
    RECUPERABLE: 0,
    DECIDE_UN_TERCERO: 0,
    TIEMPO_TRANSCURRIDO: 0,
    FECHA_PACTADA: 0,
  }
  const byParty: Record<ResponsibleParty, number> = { PROVEEDOR: 0, CLIENTE: 0, AMBOS: 0 }

  let criticalCount = 0
  let zeroFloatCount = 0
  let superCriticalCount = 0
  let total = 0

  for (const analyzed of analysis.tasks) {
    const task = source.get(analyzed.id)
    const kind = task?.kind ?? 'ACTIVIDAD'

    if (excludeSummaries && kind === 'RESUMEN') continue
    total += 1

    const party = partyOf(task, kind)
    const { recoverability, classifiedBy, reason } = recoverabilityOf(task, kind, suggest)

    const isSuperCritical = analyzed.isCritical && recoverability !== 'RECUPERABLE'

    if (analyzed.isCritical) criticalCount += 1
    if (analyzed.totalFloat === 0) zeroFloatCount += 1
    if (isSuperCritical) {
      superCriticalCount += 1
      byReason[recoverability] += 1
      byParty[party] += 1
    }

    classified.push({ ...analyzed, kind, party, recoverability, isSuperCritical, classifiedBy, reason })
  }

  return Object.freeze({
    tasks: Object.freeze(classified),
    byId: new Map(classified.map((task) => [task.id, task])),
    criticalCount,
    zeroFloatCount,
    superCriticalCount,
    superCriticalByReason: Object.freeze(byReason),
    superCriticalByParty: Object.freeze(byParty),
    total,
    finish: analysis.finish,
  })
}

/** Solo la Ruta Súper Crítica, en el orden del plan. Es lo que alimenta el filtro del Gantt. */
export function superCriticalPath(analysis: SuperCriticalAnalysis): readonly ClassifiedTask[] {
  return analysis.tasks.filter((task) => task.isSuperCritical)
}

/** Quién responde: lo declarado, o lo que la clase de línea implica. */
function partyOf(task: PlanTask | undefined, kind: TaskKind): ResponsibleParty {
  if (task?.party) return task.party
  if (kind === 'APROBACION_CLIENTE' || kind === 'ENTREGA_CLIENTE') return 'CLIENTE'
  return 'PROVEEDOR'
}

interface RecoverabilityVerdict {
  readonly recoverability: Recoverability
  readonly classifiedBy: 'MANUAL' | 'REGLA'
  readonly reason: string
}

function recoverabilityOf(
  task: PlanTask | undefined,
  kind: TaskKind,
  suggest: boolean,
): RecoverabilityVerdict {
  if (task?.recoverability) {
    return {
      recoverability: task.recoverability,
      classifiedBy: 'MANUAL',
      reason: 'Marcada a mano.',
    }
  }

  if (!suggest) {
    return { recoverability: 'RECUPERABLE', classifiedBy: 'REGLA', reason: 'Sin marca a mano.' }
  }

  // El orden importa: la fecha pactada es la más fuerte porque está impuesta por escrito, y una
  // tarea puede cumplir dos condiciones a la vez.
  if (task?.constraint?.type === 'DEBE_EMPEZAR_EL') {
    return {
      recoverability: 'FECHA_PACTADA',
      classifiedBy: 'REGLA',
      reason: 'Tiene fecha impuesta: la fecha se pactó y moverla es otra conversación.',
    }
  }

  if (task?.elapsedTime === true) {
    return {
      recoverability: 'TIEMPO_TRANSCURRIDO',
      classifiedBy: 'REGLA',
      reason: 'Consume tiempo que pasa, no esfuerzo: más gente no la acorta.',
    }
  }

  if (kind === 'APROBACION_CLIENTE' || kind === 'ENTREGA_CLIENTE') {
    return {
      recoverability: 'DECIDE_UN_TERCERO',
      classifiedBy: 'REGLA',
      reason: 'La decide o la entrega el cliente: no está en manos del proveedor.',
    }
  }

  if (kind === 'PUNTO_DE_CONTROL') {
    return {
      recoverability: 'DECIDE_UN_TERCERO',
      classifiedBy: 'REGLA',
      reason: 'Es un punto de control: alguien tiene que decidir si se sigue.',
    }
  }

  return {
    recoverability: 'RECUPERABLE',
    classifiedBy: 'REGLA',
    reason: 'Se puede acelerar con más recursos.',
  }
}

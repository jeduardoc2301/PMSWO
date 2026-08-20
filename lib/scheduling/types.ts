/**
 * El vocabulario del motor de planeación.
 *
 * Estas estructuras son planas y propias: no son modelos de Prisma ni dependen de la base. El motor
 * recibe tareas y vínculos en memoria y devuelve fechas; traducir entre la base y estas estructuras
 * es trabajo de la capa de servicio. Así el motor se puede probar entero sin base de datos.
 */

import type { IsoDate } from './date'

/**
 * Tipo de vínculo entre dos tareas.
 *
 * Una dependencia no es «A antes que B». Dice qué extremo de la predecesora amarra qué extremo de
 * la sucesora:
 *
 * - `FS` fin-comienzo: la sucesora empieza el día hábil siguiente al fin de la predecesora.
 * - `SS` comienzo-comienzo: las dos empiezan el mismo día.
 * - `FF` fin-fin: las dos terminan el mismo día.
 * - `SF` comienzo-fin: la sucesora termina justo antes de que la predecesora empiece.
 */
export type LinkType = 'FS' | 'SS' | 'FF' | 'SF'

export const LINK_TYPES: readonly LinkType[] = Object.freeze(['FS', 'SS', 'FF', 'SF'] as const)

export function isLinkType(value: unknown): value is LinkType {
  return typeof value === 'string' && (LINK_TYPES as readonly string[]).includes(value)
}

/** Un vínculo entre dos tareas, con su tipo y su desfase. */
export interface Dependency {
  readonly predecessorId: string
  readonly successorId: string
  readonly type: LinkType
  /**
   * Desfase en días hábiles, con signo.
   *
   * Positivo es una espera: «empieza tres días después de que termine la otra». Negativo es un
   * solapamiento declarado a propósito: «empieza dos días antes de que la otra termine». El signo
   * se guarda tal cual; no se normaliza ni se recorta.
   */
  readonly lag: number
}

/** Una predecesora tal como viene escrita en una celda, antes de saber a qué sucesora pertenece. */
export interface PredecessorRef {
  readonly predecessorId: string
  readonly type: LinkType
  readonly lag: number
}

/** Restricción de fecha sobre una tarea. */
export type ConstraintType =
  /** No puede empezar antes de la fecha, pero sí después. Es la restricción normal de un plan. */
  | 'NO_ANTES_DE'
  /** Empieza exactamente en la fecha, la empujen o no sus predecesoras. */
  | 'DEBE_EMPEZAR_EL'
  /**
   * Debe terminar el día indicado (MFO). **No mueve la tarea**: es un compromiso, no un empujón.
   *
   * Si la cadena la lleva más allá, la tarea se queda donde la cadena la puso y su holgura sale
   * negativa — que es el aviso. Adelantarla para que cuadre sería inventarse capacidad que nadie
   * tiene, y decir que se cumple algo que no se cumple.
   */
  | 'DEBE_TERMINAR_EL'
  /**
   * No puede terminar antes de la fecha (FNET). Empuja hacia adelante, como `NO_ANTES_DE` pero
   * amarrando el fin en lugar del arranque.
   *
   * Es la restricción de lo que no sirve antes de tiempo: una entrega que el cliente no puede
   * recibir hasta que abra su ventana de cambios, un permiso que no se emite antes de una fecha.
   */
  | 'NO_TERMINA_ANTES_DE'
  /**
   * No puede empezar después de la fecha (SNLT). **No mueve la tarea**, igual que MFO: si la cadena
   * la empuja más allá, sale con holgura negativa.
   */
  | 'NO_EMPIEZA_DESPUES_DE'
  /**
   * No puede terminar después de la fecha (FNLT). Es lo mismo que un `dueDate`, dicho como
   * restricción, y se comporta igual: cota superior de la fecha tardía, sin mover nada.
   */
  | 'NO_TERMINA_DESPUES_DE'

export interface Constraint {
  readonly type: ConstraintType
  readonly date: IsoDate
}

/**
 * Qué clase de línea es.
 *
 * No es decoración: de esto salen las sugerencias de criticidad y el filtro de lo que el cliente
 * debe entregar o decidir. Una aprobación del cliente y una actividad del proveedor se comportan
 * distinto aunque las dos ocupen días en el calendario.
 */
export type TaskKind =
  /** Trabajo que ejecuta el proveedor. */
  | 'ACTIVIDAD'
  /** Duración cero: marca un momento, no consume calendario. */
  | 'HITO'
  /** Punto Go/No-Go: alguien decide si se sigue. */
  | 'PUNTO_DE_CONTROL'
  /** El cliente aprueba o firma. */
  | 'APROBACION_CLIENTE'
  /** El cliente entrega información, accesos o insumos. */
  | 'ENTREGA_CLIENTE'
  /** Ventana de compuerta: se abre cuando se cumplen sus condiciones. */
  | 'COMPUERTA'
  /** Línea de resumen: agrupa a otras y no se ejecuta por sí misma. */
  | 'RESUMEN'

/** Quién responde por la línea. */
export type ResponsibleParty = 'PROVEEDOR' | 'CLIENTE' | 'AMBOS'

/**
 * Si el atraso de la tarea se recupera metiendo más gente.
 *
 * Es la pregunta que separa la ruta crítica de la que de verdad importa. Tres familias donde la
 * respuesta es no:
 *
 * - `DECIDE_UN_TERCERO` — firmas, aprobaciones, decisiones del cliente, puntos Go/No-Go. Poner el
 *   doble de consultores no hace que el comité sesione antes.
 * - `TIEMPO_TRANSCURRIDO` — copiar datos, estabilizar, acompañar. Ninguna cantidad de gente
 *   acelera una transferencia de dos terabytes.
 * - `FECHA_PACTADA` — cortes acordados con usuarios finales, ventanas de cambio. La fecha se
 *   negoció; moverla es otra conversación, no un problema de capacidad.
 */
export type Recoverability = 'RECUPERABLE' | 'DECIDE_UN_TERCERO' | 'TIEMPO_TRANSCURRIDO' | 'FECHA_PACTADA'

/** Una tarea del plan, con lo que el motor necesita para programarla y para clasificarla. */
export interface PlanTask {
  readonly id: string
  /** Nombre visible. El motor lo usa para poder nombrar las tareas en los mensajes de error. */
  readonly name: string
  /**
   * Duración en días hábiles.
   *
   * Cero significa que la línea no consume calendario: un hito o el cierre de una compuerta. Una
   * tarea de un día empieza y termina el mismo día.
   */
  readonly duration: number
  /**
   * Restricción de fecha que **mueve** la tarea: `NO_ANTES_DE`, `DEBE_EMPEZAR_EL`,
   * `NO_TERMINA_ANTES_DE`.
   */
  readonly constraint?: Constraint
  /**
   * Restricción que solo **compromete**: `DEBE_TERMINAR_EL`, `NO_EMPIEZA_DESPUES_DE`,
   * `NO_TERMINA_DESPUES_DE`.
   *
   * Va en su propio campo y no en `constraint` por una razón que se vio en pantalla: el plan que
   * llega del servidor ancla cada línea en su fecha guardada —así reproduce las fechas negociadas
   * del archivo en vez de comprimir todo al arranque más temprano— y ese ancla ocupa `constraint`.
   * Con un solo campo, una promesa capturada por alguien desaparecía sin dejar rastro: la columna
   * existía en la base, la pantalla la escribía, y el motor no la veía nunca.
   *
   * Separarlas es además lo correcto por sí mismo: son dos cosas distintas —dónde puede ocurrir
   * algo y qué se prometió— y una tarea puede tener las dos a la vez.
   */
  readonly compromiso?: Constraint
  /**
   * `ALAP` (§3.4): la tarea va lo más tarde que quepa sin mover el cierre del plan.
   *
   * Es booleano y no un valor más de `ConstraintType` porque no lleva fecha: las otras siete
   * restricciones se responden mirando una fecha, y esta se responde haciendo el pase atrás. Meterla
   * en la unión obligaría a inventarle una `date` que nadie escribe y que todo el que lee tendría
   * que aprender a ignorar.
   *
   * Y va en su propio campo, no en `constraint`, por la misma razón que `compromiso`: el plan que
   * llega del servidor ancla cada línea en su fecha guardada y ese ancla ocupa `constraint`.
   *
   * Lo aplica `programarConALAP` en `alap.ts`, no `schedulePlan`. Un plan programado con
   * `schedulePlan` a secas la ignora, que es lo correcto: sin pase atrás no hay dónde ponerla.
   */
  readonly alap?: boolean
  /**
   * La restricción **tal como se guardó**, para poder enseñarla.
   *
   * No la usa el motor: para programar están `constraint`, `compromiso` y `alap`, que son la misma
   * información repartida según lo que cada una hace. Este campo existe porque de esos tres no se
   * puede reconstruir lo que alguien eligió: el plan que llega del servidor ancla **todas** las
   * líneas con un `NO_ANTES_DE` en su fecha guardada, así que un `constraint` de ese tipo puede ser
   * el ancla o puede ser la elección de una persona, y las dos se ven igual.
   *
   * Enseñar el ancla como si fuera una restricción pondría «No empieza antes del…» en las 1368
   * líneas del plan de referencia, donde nadie ha elegido ninguna.
   */
  readonly restriccionGuardada?: { readonly tipo: string; readonly fecha?: IsoDate }
  /** Clase de línea. Por omisión, actividad del proveedor. */
  readonly kind?: TaskKind
  /** Quién responde. Si se omite, se deduce de la clase de línea. */
  readonly party?: ResponsibleParty
  /**
   * Clasificación puesta a mano. Siempre gana sobre la que sugiere la regla, porque quien conoce el
   * proyecto sabe cosas que el modelo no.
   */
  readonly recoverability?: Recoverability
  /**
   * La tarea consume tiempo que pasa, no esfuerzo: replicar, estabilizar, acompañar. Es la única de
   * las tres familias que no se puede deducir de la estructura del plan, así que se declara.
   */
  readonly elapsedTime?: boolean
  /**
   * Nombre de quien responde por la línea.
   *
   * Es un nombre, no una cuenta del sistema. Quien entrega del lado del cliente casi nunca tiene
   * usuario en la herramienta del proveedor, y exigirle uno es la forma más rápida de que esas
   * líneas terminen asignadas a alguien del proveedor que no las controla.
   */
  readonly owner?: string
  /**
   * Fecha límite comprometida, cuando es distinta de la que calcula el plan.
   *
   * Sin ella, el compromiso vence cuando el plan diga; con ella, vence cuando se pactó.
   */
  readonly dueDate?: IsoDate
  /** Avance de 0 a 1. Uno significa cumplida. */
  readonly progress?: number
  /**
   * Estado de seguimiento de la línea.
   *
   * El motor no programa con él —una tarea terminada ocupó los días que ocupó— pero sí hace falta
   * para saber qué está atrasado: una línea cerrada con la fecha pasada **no** está atrasada,
   * terminó. Sin esto, el Gantt tenía que conformarse con «avance por debajo del 100 %», que es una
   * frontera parecida y no la misma, y el §9.3 pide que su conmutador de atrasadas coincida
   * **exactamente** con la cifra del Panel.
   */
  readonly status?: string
  /**
   * Esfuerzo capturado, en minutos (§3.5).
   *
   * En minutos y no en horas porque el módulo entero opera en enteros: «ocho horas y media» entre
   * tres personas da 2,8333… en horas, y al volver a sumar no da 8,5. En minutos sí.
   */
  readonly estimacionMin?: number
  /**
   * Minutos de trabajo que aporta al día toda la gente asignada a esta línea.
   *
   * Ya viene con la dedicación aplicada: dos personas a media jornada de ocho horas son 480, no 960.
   */
  readonly capacidadDiariaMin?: number
  /**
   * Línea de la que cuelga esta, si cuelga de alguna.
   *
   * De aquí sale el avance ponderado: un resumen no tiene avance propio, hereda el de sus hijas
   * pesado por el trabajo de cada una.
   */
  readonly parentId?: string
}

/** Una tarea ya programada por el pase adelante. */
export interface ScheduledTask {
  readonly id: string
  readonly name: string
  readonly duration: number
  /** Fecha temprana de inicio. */
  readonly start: IsoDate
  /**
   * Fecha temprana de fin.
   *
   * En una tarea con duración es el último día trabajado, no el siguiente: una tarea de cinco días
   * que empieza el lunes termina el viernes. En un hito coincide con el inicio.
   */
  readonly finish: IsoDate
  /** Verdadero cuando la duración es cero. */
  readonly isMilestone: boolean
  /**
   * El vínculo que fijó el inicio de esta tarea, o `null` si arranca en la fecha del plan o por
   * una restricción. Es lo que permite explicar después por qué una tarea está donde está.
   */
  readonly drivingDependency: Dependency | null
}

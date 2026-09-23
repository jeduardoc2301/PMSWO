/**
 * La fecha en que el plan cerraría si arrancara hoy lo que todavía no ha arrancado.
 *
 * ## Por qué hace falta
 *
 * El motor no sabe qué día es hoy. El pase adelante programa el plan tal como está capturado, con
 * cada línea anclada en la fecha que trae guardada, y no mira el avance. En un plan armado hacia
 * atrás desde la fecha comprometida eso tiene una consecuencia que engaña:
 *
 *     `schedule.finish` === la fecha comprometida, y `margin` === 0, SIEMPRE.
 *
 * Y «siempre» es literal: con cero avance capturado devolvería lo mismo. Ninguna cantidad de
 * atraso real mueve ese número, porque ninguna fecha guardada se pasa del compromiso. Publicar ese
 * margen como respuesta a «¿llegamos?» le dice al comité «vamos justos pero en fecha» mientras el
 * proyecto arrastra meses de deuda. Es la forma más cara de tener razón técnicamente.
 *
 * ## Qué hace esto
 *
 * Reancla a hoy lo que demostrablemente no puede haber empezado antes —líneas abiertas cuyo
 * arranque programado ya quedó en el pasado— y vuelve a programar. Lo que sale es un **suelo
 * mecánico**: la fecha más temprana en que el plan puede cerrar si desde hoy todo corre según lo
 * planeado y nadie recupera nada.
 *
 * ## Qué NO es
 *
 * No es un pronóstico ni un compromiso nuevo. No modela recuperación, ni recursos extra, ni
 * recortes de alcance, ni que dos cosas se solapen mejor de lo que dice el plan. Es la aritmética
 * de arrastrar el atraso que ya ocurrió. Se publica **con el supuesto escrito al lado**, porque un
 * número así sin su método es munición para la primera persona que lo quiera desarmar.
 *
 * El avance parcial sí se descuenta: una línea al 40 % se reprograma con el 60 % de su duración.
 * Sin eso la proyección castigaría dos veces el trabajo ya hecho.
 */
import { programarConALAP } from './alap'
import { type WorkCalendar } from './calendar'
import { type IsoDate, toDayNumber } from './date'
import { type OrdinalesNoDisponibles } from './availability'
import { type Dependency, type PlanTask } from './types'
import { type Schedule } from './schedule'

/** Estados en los que una línea ya no consume calendario. */
const TERMINALES = new Set(['DONE', 'CLOSED', 'CANCELLED'])

export interface EntradaDeProyeccion {
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  readonly calendar: WorkCalendar
  /** Primer día del plan, el mismo que se le pasó al pase adelante original. */
  readonly start: IsoDate
  /** El pase adelante del plan tal como está capturado. */
  readonly base: Schedule
  /** Fecha de corte. Entra por parámetro: este módulo no lee el reloj. */
  readonly hoy: IsoDate
  /** Avance por línea, de 0 a 1. Lo que no esté en el mapa se toma como 0. */
  readonly avance: ReadonlyMap<string, number>
  /** Estado por línea, para no reanclar lo que ya está cerrado. */
  readonly estado: ReadonlyMap<string, string>
  /** La fecha comprometida, si la hay, para medir la deuda contra ella. */
  readonly compromiso?: IsoDate
  /**
   * Las mismas ausencias con las que se programó el plan base.
   *
   * Sin ellas la proyección programa contra un calendario más generoso que el del plan y las dos
   * fechas dejan de ser comparables: el corrimiento saldría más corto de lo real, que es
   * exactamente el error que no se puede cometer en este número.
   */
  readonly noDisponible?: ReadonlyMap<string, OrdinalesNoDisponibles>
}

export interface Proyeccion {
  /** Lo que dice el plan tal como está capturado. Casi siempre, el compromiso. */
  readonly cierreDelPlan: IsoDate
  /** Lo que sale al arrastrar el atraso que ya ocurrió. */
  readonly cierreProyectado: IsoDate
  /** Cuánto se corre el cierre, en días hábiles. Cero o positivo. */
  readonly corrimientoDiasHabiles: number
  /** Cuántas líneas se tuvieron que reanclar a hoy. */
  readonly lineasReancladas: number
  readonly compromiso: IsoDate | null
  /**
   * Días hábiles entre el cierre proyectado y el compromiso.
   * Negativo significa que cierra después del compromiso — que es deuda.
   */
  readonly margenProyectadoDiasHabiles: number | null
  /** Verdadero cuando la proyección se pasa del compromiso. */
  readonly enDeuda: boolean
  /**
   * El fin proyectado de cada línea, por identificador.
   *
   * El cierre del proyecto es una sola fecha; para decir cuándo se corta CADA ola, o cuándo cierra
   * cada frente, hace falta la fecha de cada línea. Sólo trae las líneas ejecutables: la fecha de un
   * resumen en el motor no se deriva de sus hijas, así que la de un grupo se calcula como la mayor
   * de sus hojas, y eso lo hace quien la pide.
   */
  readonly finPorLinea: ReadonlyMap<string, IsoDate>
}

/**
 * Lo que queda por hacer de una línea, en su propia unidad de duración.
 *
 * Un hito tiene duración cero y se queda en cero: no es trabajo, es una fecha. Para lo demás se
 * redondea hacia arriba y nunca baja de uno, porque una línea abierta que todavía consume algo de
 * calendario no puede consumir cero — eso la haría desaparecer del pase adelante.
 */
function duracionRestante(duracion: number, avance: number): number {
  if (duracion <= 0) return 0
  const pendiente = Math.max(0, Math.min(1, 1 - avance))
  if (pendiente === 0) return 0
  return Math.max(1, Math.ceil(duracion * pendiente))
}

export function proyectarCierre(entrada: EntradaDeProyeccion): Proyeccion {
  const { tasks, dependencies, calendar, start, base, hoy, avance, estado, compromiso } = entrada

  const diaDeHoy = toDayNumber(hoy)
  let lineasReancladas = 0

  /**
   * Quién tiene hijas.
   *
   * Un renglón de agrupación no se ejecuta: su barra es el envoltorio de las de abajo y su duración
   * puede abarcar el proyecto entero. Reanclarlo a hoy con su duración completa empuja el cierre
   * por una línea que nadie trabaja — y en la base están TODOS en avance cero, porque el acumulado
   * se calcula al dibujar, así que ninguno se salva por el filtro de progreso. Sus fechas salen de
   * sus hijas; dejarlos quietos es lo correcto.
   */
  const conHijas = new Set(
    tasks.map((t) => t.parentId).filter((id): id is string => id !== undefined && id !== null)
  )

  const reprogramadas = tasks.map((task) => {
    if (conHijas.has(task.id)) return task

    const progreso = avance.get(task.id) ?? 0
    const estatus = estado.get(task.id) ?? ''

    // Lo cerrado se queda donde está: ya ocurrió, y moverlo reescribiría el pasado.
    if (progreso >= 1 || TERMINALES.has(estatus)) return task

    const programada = base.byId.get(task.id)
    if (!programada) return task

    // Solo se toca lo que el plan decía que ya debió arrancar. Lo que arranca en el futuro sigue
    // donde el plan lo puso; adelantarlo o atrasarlo sería inventar información que no tenemos.
    if (toDayNumber(programada.start) >= diaDeHoy) return task

    lineasReancladas += 1
    return {
      ...task,
      duration: duracionRestante(task.duration, progreso),
      constraint: { type: 'NO_ANTES_DE' as const, date: hoy },
      // La restricción nueva manda sobre la guardada. Dejar las dos conviviendo haría que el motor
      // respetara la vieja y la proyección no se movería.
      restriccionGuardada: undefined,
      // ALAP empuja las líneas a su arranque más tardío, que es justo lo contrario de lo que esta
      // proyección pregunta: cuándo cierra si todo arranca en cuanto puede.
      alap: false,
    }
  })

  const proyectado = programarConALAP({
    tasks: reprogramadas,
    dependencies,
    calendar,
    // El plan proyectado no puede arrancar antes de hoy, pero tampoco después del arranque
    // original: las líneas ya cerradas viven en el pasado y el motor necesita poder colocarlas.
    start,
    noDisponible: entrada.noDisponible,
  })

  const ordinalBase = calendar.ordinalOf(toDayNumber(base.finish))
  const ordinalProyectado = calendar.ordinalOf(toDayNumber(proyectado.finish))
  const corrimiento = Math.max(0, ordinalProyectado - ordinalBase)

  const margen =
    compromiso === undefined
      ? null
      : calendar.ordinalOf(calendar.previous(toDayNumber(compromiso))) - ordinalProyectado

  const finPorLinea = new Map<string, IsoDate>()
  for (const t of tasks) {
    if (conHijas.has(t.id)) continue
    const p = proyectado.byId.get(t.id)
    if (p) finPorLinea.set(t.id, p.finish)
  }

  return Object.freeze({
    finPorLinea,
    cierreDelPlan: base.finish,
    cierreProyectado: proyectado.finish,
    corrimientoDiasHabiles: corrimiento,
    lineasReancladas,
    compromiso: compromiso ?? null,
    margenProyectadoDiasHabiles: margen,
    enDeuda: margen !== null && margen < 0,
  })
}

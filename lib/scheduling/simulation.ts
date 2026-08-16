/**
 * Simulación de feriados: «¿y si estos días no se trabajaran?».
 *
 * La pregunta se hace antes de decidir, no después. Un cliente pregunta si conviene parar la semana
 * de Navidad, o un país acaba de decretar un día de duelo, y lo que hace falta saber es a qué fecha
 * se movería el cierre. Responder eso editando el plan y luego deshaciéndolo es una forma segura de
 * dejarlo a medias.
 *
 * Por eso la simulación **no toca el plan**. Construye un calendario aparte con los feriados
 * añadidos, vuelve a programar sobre él y compara. El plan original sigue igual, y lo que se
 * devuelve es un informe.
 */

import { type WorkCalendar, createWorkCalendar } from './calendar'
import { type IsoDate, toDayNumber } from './date'
import { type SchedulePlanInput, schedulePlan } from './schedule'

export interface HolidaySimulationInput {
  /** El plan tal como está hoy. No se modifica. */
  readonly plan: SchedulePlanInput
  /** Los feriados que se quieren probar, además de los que el calendario ya tenga. */
  readonly holidays: readonly IsoDate[]
  /** Fecha de compromiso, para reportar cuánto margen queda antes y después. */
  readonly deadline?: IsoDate
}

export interface MovedTask {
  readonly id: string
  readonly name: string
  readonly start: IsoDate
  readonly finish: IsoDate
  readonly simulatedStart: IsoDate
  readonly simulatedFinish: IsoDate
  /** Días hábiles que se corre el fin de la tarea, medidos en el calendario original. */
  readonly shiftInWorkingDays: number
}

export interface HolidaySimulation {
  /** Fecha en que cierra el plan hoy. */
  readonly baselineFinish: IsoDate
  /** Fecha en que cerraría si esos días no se trabajaran. */
  readonly simulatedFinish: IsoDate
  /**
   * Días hábiles que se corre el cierre, contados en el calendario original.
   *
   * Cero significa que el cierre no se mueve, lo que ocurre cuando los feriados caen fuera de la
   * ruta crítica o en días que ya no eran laborables.
   */
  readonly shiftInWorkingDays: number
  /** Los feriados que sí quitaron un día de trabajo. */
  readonly appliedHolidays: readonly IsoDate[]
  /** Los que no cambiaron nada, porque caían en día no laborable o ya estaban en el calendario. */
  readonly ignoredHolidays: readonly IsoDate[]
  /** Tareas cuyo inicio o fin se mueve, en el orden del plan. */
  readonly movedTasks: readonly MovedTask[]
  /** Margen en días hábiles contra la fecha de compromiso, si se dio una. Negativo es deuda. */
  readonly baselineMargin?: number
  readonly simulatedMargin?: number
  /** El calendario que se usó para simular. Sirve para volver a calcular sin rearmarlo. */
  readonly simulatedCalendar: WorkCalendar
}

/**
 * Recalcula el plan como si los feriados dados fueran no laborables y reporta el corrimiento.
 *
 * El plan de entrada no se modifica: se construye un calendario nuevo y se programa sobre él.
 */
export function simulateHolidays(input: HolidaySimulationInput): HolidaySimulation {
  const { plan, holidays } = input
  const baselineCalendar = plan.calendar

  const simulatedCalendar = createWorkCalendar({
    workingWeekdays: baselineCalendar.workingWeekdays,
    holidays: [...baselineCalendar.holidays, ...holidays],
  })

  const applied: IsoDate[] = []
  const ignored: IsoDate[] = []
  const seen = new Set<IsoDate>()

  for (const holiday of holidays) {
    if (seen.has(holiday)) {
      ignored.push(holiday)
      continue
    }
    seen.add(holiday)
    // Solo quita trabajo si el día era laborable antes. Un feriado en domingo no mueve nada.
    if (baselineCalendar.isWorkingDay(toDayNumber(holiday))) {
      applied.push(holiday)
    } else {
      ignored.push(holiday)
    }
  }

  const baseline = schedulePlan(plan)
  const simulated = schedulePlan({ ...plan, calendar: simulatedCalendar })

  const ordinal = (fecha: IsoDate) => baselineCalendar.ordinalOf(toDayNumber(fecha))
  const shiftInWorkingDays = ordinal(simulated.finish) - ordinal(baseline.finish)

  const movedTasks: MovedTask[] = []
  for (const task of baseline.tasks) {
    const after = simulated.byId.get(task.id)!
    if (after.start === task.start && after.finish === task.finish) continue

    movedTasks.push({
      id: task.id,
      name: task.name,
      start: task.start,
      finish: task.finish,
      simulatedStart: after.start,
      simulatedFinish: after.finish,
      shiftInWorkingDays: ordinal(after.finish) - ordinal(task.finish),
    })
  }

  const result: HolidaySimulation = {
    baselineFinish: baseline.finish,
    simulatedFinish: simulated.finish,
    shiftInWorkingDays,
    appliedHolidays: Object.freeze(applied),
    ignoredHolidays: Object.freeze(ignored),
    movedTasks: Object.freeze(movedTasks),
    simulatedCalendar,
    ...(input.deadline === undefined
      ? {}
      : {
          baselineMargin: marginAgainst(baselineCalendar, baseline.finish, input.deadline),
          simulatedMargin: marginAgainst(baselineCalendar, simulated.finish, input.deadline),
        }),
  }

  return Object.freeze(result)
}

/**
 * Días hábiles que sobran entre el cierre y el compromiso.
 *
 * Se mide siempre en el calendario original, para que las dos cifras del informe —antes y después—
 * estén en la misma unidad y se puedan restar.
 */
function marginAgainst(calendar: WorkCalendar, finish: IsoDate, deadline: IsoDate): number {
  return calendar.ordinalOf(calendar.previous(toDayNumber(deadline))) - calendar.ordinalOf(toDayNumber(finish))
}

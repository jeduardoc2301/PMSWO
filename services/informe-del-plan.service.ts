/**
 * El informe del plan, calculado del lado del servidor.
 *
 * Toda esta cadena —cargar, programar, analizar la ruta crítica, clasificar, acumular el avance,
 * medir los compromisos del cliente y resumir— existía solo dentro de un `useMemo` en
 * `components/plan/plan-workspace.tsx`. Un job sin sesión no puede entrar ahí, así que vive aquí,
 * con la organización explícita y sin tocar el reloj: la fecha de corte entra por parámetro.
 *
 * Programar las 1 368 líneas del plan real cuesta unos 50 ms. No hay razón de rendimiento para no
 * hacerlo en el servidor.
 *
 * ## Dos diferencias deliberadas con la pantalla
 *
 * **La fecha de corte es hoy, no el arranque del proyecto.** La pantalla pasa `asOf` = inicio del
 * plan para que diga lo mismo hoy que mañana y se pueda comparar contra una captura de la semana
 * pasada. Un reporte diario necesita exactamente lo contrario: con el arranque como corte,
 * `clientOverdue` y `clientAtRisk` salen en cero siempre, y el reporte diría que el cliente no
 * debe nada cuando debe treinta y tres cosas.
 *
 * **Se proyecta el cierre.** La pantalla publica `schedule.finish`, que en un plan armado hacia
 * atrás desde el compromiso es siempre el compromiso. Ver `lib/scheduling/proyeccion.ts`.
 */
import { ordinalesNoDisponibles } from '@/lib/scheduling/availability'
import { classifySuperCritical } from '@/lib/scheduling/critical-path'
import { clientCommitments } from '@/lib/scheduling/client-commitments'
import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { toDayNumber } from '@/lib/scheduling/date'
import { programarConALAP } from '@/lib/scheduling/alap'
import { calendarioDesde } from '@/lib/scheduling/project-calendar'
import type { WorkCalendar } from '@/lib/scheduling/calendar'
import { rollUpProgress } from '@/lib/scheduling/progress'
import { summarizePlan } from '@/lib/scheduling/plan-summary'
import { proyectarCierre, type Proyeccion } from '@/lib/scheduling/proyeccion'
import { loadProjectPlan } from '@/services/schedule.service'
import { logWarning } from '@/lib/logger'
/**
 * Alias obligatorio: hay DOS cosas llamadas `ExecutiveBrief` en este repo y son incompatibles.
 * La del motor (esta) es determinista y contesta cuatro preguntas con prosa ya escrita; la de
 * `lib/reports/project-report-docx.ts` es lo que devuelve el modelo. Importar la equivocada
 * compila sin quejarse y produce basura en tiempo de ejecución.
 */
import {
  executiveBrief as informeDeterminista,
  type ExecutiveBrief as InformeDelMotor,
} from '@/lib/scheduling/executive-brief'
import type { ClientCommitmentsView } from '@/lib/scheduling/client-commitments'
import type { PlanSummary } from '@/lib/scheduling/plan-summary'

export interface InformeDelPlan {
  readonly resumen: PlanSummary
  readonly informe: InformeDelMotor
  readonly compromisosDelCliente: ClientCommitmentsView
  readonly proyeccion: Proyeccion
  /** Avance ponderado por duración sobre hojas, de 0 a 1. */
  readonly avancePonderado: number
  /**
   * El calendario laborable del proyecto, ya construido.
   *
   * Viaja con el informe para que quien mida atrasos en días hábiles use **el mismo** que usó el
   * motor para programar. Montarlo por separado sería contar unos días aquí y otros allá.
   */
  readonly calendar: WorkCalendar
}

/**
 * Corre el motor completo sobre un proyecto.
 *
 * Devuelve `null` en vez de lanzar. El correo tiene que salir aunque la proyección no se pueda
 * calcular: un reporte con cifras y sin fecha proyectada sirve; uno que no llega porque el plan
 * tiene un ciclo de dependencias no sirve para nada, y encima el ciclo lleva semanas ahí.
 */
export async function construirInformeDelPlan(
  projectId: string,
  organizationId: string,
  /** Fecha civil de corte, `AAAA-MM-DD`, ya resuelta en la zona de quien la pidió. */
  corte: string
): Promise<InformeDelPlan | null> {
  try {
    const plan = await loadProjectPlan(projectId, organizationId)
    if (!plan) return null

    const calendar = calendarioDesde(plan.calendar)

    const noDisponible = ordinalesNoDisponibles(plan.ausencias, calendar, toDayNumber)

    const schedule = programarConALAP({
      tasks: plan.tasks,
      dependencies: plan.dependencies,
      calendar,
      start: plan.start,
      noDisponible,
    })

    const analysis = analyzeCriticalPath(schedule)

    // Dos clasificaciones y la diferencia importa, igual que en la pantalla: la primera incluye
    // los resúmenes porque los compromisos necesitan alcanzar cada fila; la segunda los excluye
    // porque un resumen no se ejecuta por sí mismo y contarlo infla las cifras del informe.
    const clasificadas = classifySuperCritical(analysis, plan.tasks)
    const paraContar = classifySuperCritical(analysis, plan.tasks, { excludeSummaries: true })

    const rollup = rollUpProgress(plan.tasks, plan.progressRollup)
    const compromisos = clientCommitments(clasificadas, schedule.graph, plan.tasks, { asOf: corte })

    const resumen = summarizePlan({
      tasks: plan.tasks,
      dependencies: plan.dependencies,
      schedule,
      classified: paraContar,
      rollup,
      commitments: compromisos,
      calendar,
      deadline: plan.deadline,
      computedAt: corte,
    })

    const avance = new Map<string, number>()
    const estado = new Map<string, string>()
    for (const t of plan.tasks) {
      avance.set(t.id, typeof t.progress === 'number' ? t.progress : 0)
      estado.set(t.id, t.status ?? '')
    }

    const proyeccion = proyectarCierre({
      tasks: plan.tasks,
      dependencies: plan.dependencies,
      calendar,
      start: plan.start,
      base: schedule,
      hoy: corte,
      avance,
      estado,
      compromiso: plan.deadline,
      // Las mismas ausencias que el plan base, o las dos fechas no serían comparables.
      noDisponible,
    })

    return {
      resumen,
      informe: informeDeterminista(resumen, compromisos),
      compromisosDelCliente: compromisos,
      proyeccion,
      avancePonderado: resumen.progress,
      calendar,
    }
  } catch (error) {
    // El motor lanza `HierarchyError`, `SchedulingError` y `DependencyCycleError` ante planes mal
    // formados. Ninguno de esos debe impedir que el correo salga.
    logWarning('[Informe del plan] el motor no pudo con este plan; el correo sale sin proyección', {
      projectId,
      organizationId,
      error: (error as Error).message,
    })
    return null
  }
}

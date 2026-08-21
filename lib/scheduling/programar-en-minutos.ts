/**
 * El pase adelante en minutos laborables (§2 y §3.3).
 *
 * Es el mismo cálculo que hace `schedulePlan`, contado en la otra unidad: dónde puede empezar cada
 * línea lo antes posible, respetando lo que la amarra. La diferencia es que aquí una tarea puede
 * empezar a las dos de la tarde.
 *
 * ## Por qué vive al lado del de días y no en su lugar
 *
 * Cambiar de unidad el motor que calcula las fechas de 1 368 líneas no es una refactorización: es
 * volver a escribir la pieza de la que cuelgan la ruta crítica, las holguras, el roll-up y las seis
 * vistas. Hacerlo de golpe y comprobarlo después es cómo se rompe un plan sin que nadie se entere
 * hasta la reunión de seguimiento.
 *
 * Así que se escribe al lado, se **demuestra que dice lo mismo** sobre el plan real —1 368 líneas,
 * 1 665 vínculos, 394 de ellos con desfase— y sólo entonces tiene sentido plantearse el cambio. Es
 * el mismo camino que siguieron las columnas de minutos: primero al lado, luego encima.
 *
 * ## Las cuatro reglas, y el `+1` que aquí no está
 *
 * El motor de días dice que un `FS` empieza en `finDeLaPredecesora + 1`, porque su fin es el
 * **último día** que se trabaja y el sucesor arranca al siguiente. En minutos ese `+1` no existe y
 * ponerlo sería un día entero de más: el fin es el instante en que se deja de trabajar, y el
 * sucesor empieza en el primer minuto laborable a partir de ahí —que es el lunes a las nueve cuando
 * la predecesora cierra el viernes a las seis, y las dos de la tarde cuando cierra a la una—.
 *
 * ## Las restricciones que empujan
 *
 * Las tres del §3.4 que mueven una fecha —`NO_ANTES_DE`, `DEBE_EMPEZAR_EL` y `NO_TERMINA_ANTES_DE`—
 * se aplican igual que en el motor de días y por la misma razón: sin ellas, este módulo no puede
 * compararse con el otro sobre el plan real, donde las 1 368 líneas van ancladas a la fecha que
 * declara el archivo. Las tres que sólo **comprometen** no aparecen, tampoco allí: son promesas, no
 * empujones, y quien las cobra es el pase atrás con holgura negativa.
 *
 * ## Lo que todavía no hace
 *
 * No hay pase atrás, así que no calcula holguras ni ruta crítica, y no tiene en cuenta las
 * ausencias de quien lleva cada línea. Las dos cosas están en el motor de días y ahí siguen. Se
 * dice aquí porque un módulo a medio camino que no anuncia dónde está es una trampa para el
 * siguiente que lo lea.
 */

import { type DependencyGraph, buildDependencyGraph } from './dependencies'
import { type IsoDate } from './date'
import { type Instante, type Reloj, fechaDe, instanteDe } from './reloj'
import { type Dependency, type PlanTask } from './types'

export interface EntradaEnMinutos {
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  /** El reloj laborable del proyecto: su calendario y su jornada. */
  readonly reloj: Reloj
  /** Primer día del plan. */
  readonly comienzo: IsoDate
}

export interface LineaEnMinutos {
  readonly comienzo: Instante
  readonly fin: Instante
  /** Minutos laborables que dura. Cero en un hito. */
  readonly duracion: number
}

export interface ProgramaEnMinutos {
  readonly porId: ReadonlyMap<string, LineaEnMinutos>
  /** El primer instante laborable del plan. */
  readonly comienzo: Instante
  /** El último instante en que se trabaja: el fin más tardío de todas las líneas. */
  readonly fin: Instante
}

/**
 * Minutos que dura una línea.
 *
 * Los suyos cuando los tiene, y la duración en días llevada a minutos cuando no. Es lo que permite
 * programar un plan a medio migrar sin que las líneas sin minutos se queden en cero.
 */
export function duracionEnMinutos(task: PlanTask, minutosPorJornada: number): number {
  if (task.duracionMin !== undefined) return Math.max(task.duracionMin, 0)
  return Math.max(task.duration, 0) * minutosPorJornada
}

export function programarEnMinutos(entrada: EntradaEnMinutos): ProgramaEnMinutos {
  const { reloj, tasks, dependencies } = entrada
  const jornada = reloj.jornada.minutos
  const graph: DependencyGraph = buildDependencyGraph(tasks, dependencies)

  const arranque = reloj.abrir(instanteDe(entrada.comienzo))
  const porId = new Map<string, LineaEnMinutos>()

  for (const id of graph.order) {
    const task = graph.taskById.get(id)!
    const duracion = duracionEnMinutos(task, jornada)

    let comienzo = arranque
    for (const vinculo of graph.incoming.get(id)!) {
      const pedido = comienzoQuePide(vinculo, porId, duracion, jornada, reloj)
      if (pedido > comienzo) comienzo = pedido
    }

    // La restricción se aplica al final, sobre lo que pidieron las predecesoras, igual que en el
    // motor de días.
    if (task.constraint) {
      const fijada = reloj.abrir(instanteDe(task.constraint.date))
      if (task.constraint.type === 'DEBE_EMPEZAR_EL') {
        // La única que pisa hacia atrás: quien la pone dice «este día y no otro». Lo que no puede
        // pisar es el arranque del plan, o el plan empezaría antes que él mismo.
        comienzo = Math.max(arranque, fijada)
      } else if (task.constraint.type === 'NO_TERMINA_ANTES_DE') {
        // Amarra el fin: se retrocede la duración desde el cierre de ese día para saber cuándo
        // habría que empezar. Una tarea de cinco jornadas que no puede cerrar antes del viernes
        // abre el lunes.
        const desdeElFin = reloj.restar(reloj.sumar(fijada, jornada), duracion)
        if (desdeElFin > comienzo) comienzo = desdeElFin
      } else if (task.constraint.type === 'NO_ANTES_DE' && fijada > comienzo) {
        comienzo = fijada
      }
    }

    /**
     * Normalizar el comienzo convierte «el instante en que la predecesora dejó de trabajar» en «el
     * primer minuto en que se puede empezar»: el lunes a las nueve, o las dos de la tarde si la
     * predecesora cerró a la una.
     *
     * Salvo en un hito, que no es trabajo sino una marca. Si cae justo donde el trabajo se detiene
     * —un `FF+0` contra una tarea que cierra el miércoles a las seis— se queda ahí, porque lo que
     * marca es ese fin. Abrirlo lo mandaría al jueves por la mañana: el mismo instante de trabajo
     * acumulado y otro día en el calendario, que es el que la gente lee. Son 47 hitos del plan de
     * referencia, y cada uno un día de más.
     */
    const enUnCierre = reloj.cerrar(comienzo) === comienzo
    comienzo = duracion === 0 && enUnCierre ? comienzo : reloj.abrir(comienzo)
    // El fin de un hito es su comienzo, sin volver a normalizar: el comienzo ya se normalizó arriba
    // con la regla del hito, y `sumar(t, 0)` abriría otra vez lo que se acaba de decidir cerrar.
    porId.set(id, { comienzo, fin: duracion === 0 ? comienzo : reloj.sumar(comienzo, duracion), duracion })
  }

  let fin = arranque
  for (const linea of porId.values()) if (linea.fin > fin) fin = linea.fin

  return { porId, comienzo: arranque, fin }
}

/**
 * Qué comienzo pide un vínculo, en minutos.
 *
 * `FF` y `SF` amarran el fin, así que se retrocede la duración desde el fin exigido. Se retrocede
 * con el reloj y no restando un número de días: entre el fin y el comienzo puede haber fines de
 * semana, festivos y horas de comida, y ninguno de los tres se cuenta.
 */
function comienzoQuePide(
  vinculo: Dependency,
  porId: ReadonlyMap<string, LineaEnMinutos>,
  duracion: number,
  jornada: number,
  reloj: Reloj,
): Instante {
  const predecesora = porId.get(vinculo.predecessorId)
  // Una predecesora que no está en el plan no puede empujar a nadie. El grafo ya rechaza los
  // vínculos colgando de nada, así que esto es un cinturón, no una regla.
  if (!predecesora) return Number.NEGATIVE_INFINITY

  // El desfase viaja en días mientras el modelo lo guarde así (§2.2 lo quiere en minutos con
  // signo). Se convierte aquí, en un solo sitio, para que el día que la columna cambie de unidad
  // haya que tocar una línea.
  const desfase = vinculo.lag * jornada

  /**
   * El comienzo de la predecesora, visto por quien se ata a él.
   *
   * Un hito no consume tiempo, así que su instante cae donde lo dejó lo que lo empuja —a menudo el
   * cierre de una jornada, si lo ata un `FF`—. Para quien se ata a su **comienzo** eso sería el
   * final del día, y una tarea que arranca «cuando se cierra la fase» arrancaría a la mañana
   * siguiente. No es lo que dice el archivo de MS Project del que sale el plan de referencia, ni lo
   * que hace MS Project: un hito marca un punto del día, y quien arranca con él arranca ese día.
   *
   * Así que para un hito se toma la apertura de su propio día. Para todo lo demás, su comienzo tal
   * cual: una tarea que empieza a las dos de la tarde arrastra a su `SS` a las dos de la tarde, que
   * es justo la precisión que este motor viene a dar.
   */
  const comienzoDeLaPredecesora =
    predecesora.duracion === 0
      ? reloj.abrir(instanteDe(fechaDe(predecesora.comienzo)))
      : predecesora.comienzo

  switch (vinculo.type) {
    case 'FS':
      return reloj.sumar(predecesora.fin, desfase)
    case 'SS':
      return reloj.sumar(comienzoDeLaPredecesora, desfase)
    case 'FF':
      return reloj.restar(reloj.sumar(predecesora.fin, desfase), duracion)
    case 'SF':
      return reloj.restar(reloj.sumar(comienzoDeLaPredecesora, desfase), duracion)
  }
}

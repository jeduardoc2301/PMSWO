/**
 * Mover una línea y empujar lo que quede en falso (§3.0 `rescheduleFrom`, §7.2, §4.4).
 *
 * ## Por qué esto no es «volver a programar el plan»
 *
 * En este sistema cada línea está **anclada** a su fecha: el plan viene negociado, y sus fechas
 * codifican decisiones que la red de dependencias no conoce —ventanas del cliente, disponibilidad
 * de gente, paradas de mantenimiento—. Se midió sobre el plan real: quitar el ancla y dejar que el
 * motor programe todo lo antes posible adelantaría **540 de 1 368 líneas**, alguna hasta 117 días
 * hábiles. El cierre no cambiaría —sigue el 2026-11-30— pero el plan que se enseñaría no sería el
 * que nadie acordó.
 *
 * Por eso mover una barra no recalcula: **empuja**. La línea que se arrastra va exactamente donde
 * se suelta, y de ahí en adelante sólo se mueve lo que quedaría en falso.
 *
 * ## Sólo empuja, nunca tira
 *
 * Una sucesora con holgura se queda donde está. Si se arrastra una línea hacia atrás, sus
 * sucesoras **no** se adelantan: tenían margen y ese margen es información, no un hueco que haya
 * que cerrar. Tirar de ellas sería reprogramar el plan a espaldas de quien lo negoció.
 *
 * ## Devuelve cambios, no escribe
 *
 * Es puro. Quien llama decide si los persiste, los enseña como previsualización o los apunta en la
 * pila de deshacer — que es justo lo que hace falta para que arrastrar una barra se pueda deshacer
 * con un Ctrl+Z.
 */

import { type WorkCalendar } from '@/lib/scheduling/calendar'
import { type DayNumber, type IsoDate, toDayNumber, toIsoDate } from '@/lib/scheduling/date'
import { type Dependency, type PlanTask } from '@/lib/scheduling/types'

export interface CambioDeFechas {
  readonly id: string
  readonly name: string
  readonly desde: { readonly start: IsoDate; readonly finish: IsoDate }
  readonly hasta: { readonly start: IsoDate; readonly finish: IsoDate }
  /** Días hábiles que se corre. Positivo es más tarde. */
  readonly diasHabiles: number
  /** `true` en la línea que alguien arrastró; el resto son consecuencia. */
  readonly arrastrada: boolean
}

export interface ResultadoDeReprogramacion {
  readonly cambios: readonly CambioDeFechas[]
  /** Cuántas se movieron por arrastre de la cascada, sin contar la arrastrada. */
  readonly empujadas: number
  /** El cierre del plan antes y después: es la cifra que importa de una reprogramación. */
  readonly cierreAntes: IsoDate
  readonly cierreDespues: IsoDate
}

export interface EntradaDeReprogramacion {
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  readonly calendar: WorkCalendar
  /** Las fechas vigentes de cada línea, tal como están ancladas hoy. */
  readonly fechas: ReadonlyMap<string, { readonly start: IsoDate; readonly finish: IsoDate }>
  /** La línea que se arrastró y a dónde. */
  readonly movida: { readonly id: string; readonly start: IsoDate }
}

/**
 * El día hábil en que una sucesora puede empezar, como muy pronto, dado su vínculo.
 *
 * Trabaja en ordinales de día hábil —no en fechas— porque la aritmética con enteros no se equivoca
 * al cruzar fines de semana ni cambios de horario.
 */
function arranqueMinimo(
  vinculo: Dependency,
  ordinalInicioPredecesora: number,
  ordinalFinPredecesora: number,
  duracionSucesora: number,
): number {
  const lag = vinculo.lag
  switch (vinculo.type) {
    case 'FS':
      // Fin a inicio: empieza el día hábil siguiente al fin, más el desfase.
      return ordinalFinPredecesora + 1 + lag
    case 'SS':
      return ordinalInicioPredecesora + lag
    case 'FF':
      // Fin a fin: su fin no puede ser antes; se traduce a inicio restando su duración.
      return ordinalFinPredecesora + lag - duracionSucesora
    case 'SF':
      return ordinalInicioPredecesora + lag - duracionSucesora
    default:
      return ordinalFinPredecesora + 1 + lag
  }
}

export function reprogramarDesde(entrada: EntradaDeReprogramacion): ResultadoDeReprogramacion {
  const { tasks, dependencies, calendar, fechas, movida } = entrada

  const porId = new Map(tasks.map((t) => [t.id, t]))
  const sucesorasDe = new Map<string, Dependency[]>()
  for (const v of dependencies) {
    const lista = sucesorasDe.get(v.predecessorId)
    if (lista) lista.push(v)
    else sucesorasDe.set(v.predecessorId, [v])
  }

  /** Duración en días hábiles, contando los dos extremos. Un hito mide cero. */
  const duracionDe = (id: string): number => {
    const tarea = porId.get(id)
    if (!tarea) return 0
    if (tarea.duration === 0) return 0
    const f = fechas.get(id)
    if (!f) return Math.max(0, tarea.duration - 1)
    return Math.max(0, calendar.countBetween(toDayNumber(f.start), toDayNumber(f.finish)) - 1)
  }

  const ordinal = (iso: IsoDate): number => calendar.ordinalOf(calendar.next(toDayNumber(iso)))
  const desdeOrdinal = (o: number): IsoDate => toIsoDate(calendar.dayOfOrdinal(o))

  // Los arranques vigentes, en ordinales; sobre esta copia se empuja.
  const arranque = new Map<string, number>()
  for (const t of tasks) {
    const f = fechas.get(t.id)
    if (f) arranque.set(t.id, ordinal(f.start))
  }

  const original = new Map(arranque)

  // La arrastrada va exactamente donde se soltó, aunque sus predecesoras pidieran otra cosa: es una
  // decisión explícita de quien la movió, no una sugerencia.
  arranque.set(movida.id, ordinal(movida.start))

  // Cascada hacia delante. La cola vuelve a visitar una línea si un empujón posterior la mueve
  // más: con mil seiscientos vínculos, el orden de llegada no garantiza que la primera vez sea la
  // definitiva.
  const cola: string[] = [movida.id]
  const tope = tasks.length * 8
  let vueltas = 0

  while (cola.length > 0) {
    if (vueltas++ > tope) break
    const id = cola.shift()!
    const inicio = arranque.get(id)
    if (inicio === undefined) continue
    const fin = inicio + duracionDe(id)

    for (const vinculo of sucesorasDe.get(id) ?? []) {
      const sucesora = vinculo.successorId
      const actual = arranque.get(sucesora)
      if (actual === undefined) continue

      const minimo = arranqueMinimo(vinculo, inicio, fin, duracionDe(sucesora))
      // Sólo empuja: una sucesora con holgura se queda donde está. Tirar de ella sería
      // reprogramar el plan a espaldas de quien lo negoció.
      if (minimo > actual) {
        arranque.set(sucesora, minimo)
        cola.push(sucesora)
      }
    }
  }

  const cambios: CambioDeFechas[] = []
  for (const t of tasks) {
    const antes = original.get(t.id)
    const despues = arranque.get(t.id)
    if (antes === undefined || despues === undefined || antes === despues) continue

    const f = fechas.get(t.id)!
    const duracion = duracionDe(t.id)
    cambios.push({
      id: t.id,
      name: t.name,
      desde: f,
      hasta: { start: desdeOrdinal(despues), finish: desdeOrdinal(despues + duracion) },
      diasHabiles: despues - antes,
      arrastrada: t.id === movida.id,
    })
  }

  const cierre = (mapa: ReadonlyMap<string, number>): IsoDate => {
    let mayor = -Infinity
    for (const t of tasks) {
      const o = mapa.get(t.id)
      if (o === undefined) continue
      const fin = o + duracionDe(t.id)
      if (fin > mayor) mayor = fin
    }
    return mayor === -Infinity ? ('' as IsoDate) : desdeOrdinal(mayor)
  }

  return {
    cambios,
    empujadas: cambios.filter((c) => !c.arrastrada).length,
    cierreAntes: cierre(original),
    cierreDespues: cierre(arranque),
  }
}

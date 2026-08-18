/**
 * La comparación contra una línea base (§4.6).
 *
 * Pura y sin base de datos: entra la foto y entra el plan de hoy, sale cuánto se ha movido cada
 * línea. Es la pregunta que un jefe de proyecto hace en toda reunión de seguimiento —«¿cuánto nos
 * desviamos de lo que prometimos?»— y la respuesta tiene que ser la misma en la rejilla, en el
 * Gantt y en cualquier informe, así que se calcula en un solo sitio.
 *
 * ## Todo en días hábiles
 *
 * Una tarea que se corre del viernes al lunes se movió **un** día de trabajo, no tres. Medir en días
 * naturales convertiría cada fin de semana en un atraso inventado, y en un plan de seis meses los
 * fines de semana suman más que cualquier retraso real.
 *
 * ## El signo
 *
 * Positivo es tarde. `driftFinish = +3` se lee «tres días hábiles más tarde de lo prometido», que es
 * como se dice en voz alta. La alternativa —positivo es bueno— obliga a traducir mentalmente cada
 * vez, y a la tercera reunión alguien se equivoca de signo delante del cliente.
 *
 * ## Las líneas que no estaban en la foto
 *
 * Una línea creada después de tomar la línea base no tiene contra qué compararse, y decir que se
 * desvió cero sería mentir: no es que no se haya movido, es que no existía. Salen marcadas como
 * `nueva`, y las que estaban en la foto y ya no están, como `eliminada`.
 */

import { type WorkCalendar } from '@/lib/scheduling/calendar'
import { type IsoDate, toDayNumber } from '@/lib/scheduling/date'

/** El estado de una línea en la foto. */
export interface LineaDeLaFoto {
  readonly workItemId: string
  readonly start: IsoDate
  readonly finish: IsoDate
  readonly durationDays: number
  readonly progressBp: number
}

/** El estado de una línea hoy. */
export interface LineaDeHoy {
  readonly id: string
  readonly name: string
  readonly start: IsoDate
  readonly finish: IsoDate
  readonly progressBp: number
}

export type EstadoContraLaBase = 'igual' | 'movida' | 'nueva' | 'eliminada'

export interface DesvioDeLinea {
  readonly id: string
  readonly name: string
  readonly estado: EstadoContraLaBase
  /** Lo que decía la foto. `null` en una línea que no estaba. */
  readonly base: { readonly start: IsoDate; readonly finish: IsoDate; readonly durationDays: number } | null
  /** Lo que dice hoy. `null` en una línea que se borró. */
  readonly hoy: { readonly start: IsoDate; readonly finish: IsoDate; readonly durationDays: number } | null
  /** Días hábiles que se corrió el arranque. Positivo es más tarde. */
  readonly driftStart: number
  /** Días hábiles que se corrió el cierre. Positivo es más tarde. */
  readonly driftFinish: number
  /** Días hábiles que creció la línea. Positivo es más larga. */
  readonly driftDuration: number
  /** Puntos base que subió el avance desde la foto. */
  readonly driftProgressBp: number
}

export interface ResumenContraLaBase {
  readonly lineas: readonly DesvioDeLinea[]
  readonly movidas: number
  readonly nuevas: number
  readonly eliminadas: number
  /** Cuántas cierran más tarde de lo prometido. */
  readonly masTarde: number
  /** Cuántas cierran antes. */
  readonly masTemprano: number
  /**
   * El corrimiento del cierre del proyecto, en días hábiles.
   *
   * Es la diferencia entre la última fecha de la foto y la última de hoy — no la suma ni la media de
   * los desvíos. Diez tareas que se corren tres días cada una dentro de la misma holgura no mueven
   * el cierre ni un día, y sumarlas daría treinta.
   */
  readonly driftDelCierre: number
}

/** Días hábiles entre dos fechas, con signo. Positivo si `b` va después de `a`. */
function distanciaHabil(calendar: WorkCalendar, a: IsoDate, b: IsoDate): number {
  return calendar.ordinalOf(toDayNumber(b)) - calendar.ordinalOf(toDayNumber(a))
}

export function compararContraLaBase(
  foto: readonly LineaDeLaFoto[],
  hoy: readonly LineaDeHoy[],
  calendar: WorkCalendar,
): ResumenContraLaBase {
  const fotoPorId = new Map(foto.map((f) => [f.workItemId, f]))
  const hoyPorId = new Map(hoy.map((h) => [h.id, h]))

  const lineas: DesvioDeLinea[] = []

  for (const actual of hoy) {
    const original = fotoPorId.get(actual.id)
    const duracionDeHoy = calendar.countBetween(toDayNumber(actual.start), toDayNumber(actual.finish))

    if (!original) {
      lineas.push({
        id: actual.id,
        name: actual.name,
        estado: 'nueva',
        base: null,
        hoy: { start: actual.start, finish: actual.finish, durationDays: duracionDeHoy },
        driftStart: 0,
        driftFinish: 0,
        driftDuration: 0,
        driftProgressBp: 0,
      })
      continue
    }

    const driftStart = distanciaHabil(calendar, original.start, actual.start)
    const driftFinish = distanciaHabil(calendar, original.finish, actual.finish)
    const driftDuration = duracionDeHoy - original.durationDays

    lineas.push({
      id: actual.id,
      name: actual.name,
      // «Movida» mira sólo las fechas. Que el avance suba es lo que se espera que pase; lo que hay
      // que ver de un vistazo es qué se salió del calendario prometido.
      estado: driftStart === 0 && driftFinish === 0 ? 'igual' : 'movida',
      base: { start: original.start, finish: original.finish, durationDays: original.durationDays },
      hoy: { start: actual.start, finish: actual.finish, durationDays: duracionDeHoy },
      driftStart,
      driftFinish,
      driftDuration,
      driftProgressBp: actual.progressBp - original.progressBp,
    })
  }

  for (const original of foto) {
    if (hoyPorId.has(original.workItemId)) continue
    lineas.push({
      id: original.workItemId,
      name: '(línea eliminada del plan)',
      estado: 'eliminada',
      base: {
        start: original.start,
        finish: original.finish,
        durationDays: original.durationDays,
      },
      hoy: null,
      driftStart: 0,
      driftFinish: 0,
      driftDuration: 0,
      driftProgressBp: 0,
    })
  }

  const cierreDeLaFoto = foto.reduce<IsoDate | null>(
    (max, f) => (max === null || f.finish > max ? f.finish : max),
    null,
  )
  const cierreDeHoy = hoy.reduce<IsoDate | null>(
    (max, h) => (max === null || h.finish > max ? h.finish : max),
    null,
  )

  return {
    lineas,
    movidas: lineas.filter((l) => l.estado === 'movida').length,
    nuevas: lineas.filter((l) => l.estado === 'nueva').length,
    eliminadas: lineas.filter((l) => l.estado === 'eliminada').length,
    masTarde: lineas.filter((l) => l.driftFinish > 0).length,
    masTemprano: lineas.filter((l) => l.driftFinish < 0).length,
    driftDelCierre:
      cierreDeLaFoto === null || cierreDeHoy === null
        ? 0
        : distanciaHabil(calendar, cierreDeLaFoto, cierreDeHoy),
  }
}

/** Índice por id, para que la rejilla busque el desvío de una fila sin recorrer la lista. */
export function desviosPorId(resumen: ResumenContraLaBase): Map<string, DesvioDeLinea> {
  return new Map(resumen.lineas.map((linea) => [linea.id, linea]))
}

/**
 * La duración en minutos que le corresponde a una línea por sus fechas (§2).
 *
 * ## Por qué existe esta función y no está escrita dos veces
 *
 * Desde que los minutos mandan sobre los días, `durationMinutes` y las fechas guardadas **tienen que
 * decir lo mismo**. Si se separan, gana el minuto y la línea se encoge: unas fechas que dicen tres
 * días con un `durationMinutes` de 480 se programan como un solo día, y quien arrastró el borde de
 * la barra ve cómo vuelve a su sitio sin que nadie le explique nada.
 *
 * De ahí que la traducción esté aquí, en un solo sitio, y la usen los dos que escriben: el respaldo
 * que rellenó las 1 368 líneas la primera vez y la ruta que guarda un cambio de fechas. Escrita dos
 * veces se separarían el día que una cambie —que es exactamente cómo se separaron `duration` y
 * `durationMinutes` para empezar—.
 */

import { type WorkCalendar } from './calendar'
import { type IsoDate, toDayNumber } from './date'
import { esClaseDeHito } from './kinds'
import { aMinutos } from './unidades'

/**
 * Minutos laborables que abarcan esas dos fechas, con la jornada del proyecto.
 *
 * Un hito devuelve cero, y es correcto: no consume calendario. Los extremos que caen en día no
 * laborable se normalizan hacia dentro —el mismo criterio que usa el resto del sistema— y la cuenta
 * incluye los dos, como `NETWORKDAYS`: del lunes al viernes son cinco días, no cuatro.
 */
export function minutosDesdeLasFechas(
  calendario: WorkCalendar,
  kind: string | null | undefined,
  desde: IsoDate,
  hasta: IsoDate,
  minutosPorJornada: number,
): number {
  if (esClaseDeHito(kind)) return 0

  const inicio = calendario.ordinalOf(calendario.next(toDayNumber(desde)))
  const fin = calendario.ordinalOf(calendario.previous(toDayNumber(hasta)))
  const dias = Math.max(1, fin - inicio + 1)
  return aMinutos(dias, minutosPorJornada)
}

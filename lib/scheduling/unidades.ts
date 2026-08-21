/**
 * Duración en minutos laborables, y la jornada que los convierte en días (§2, §3.5).
 *
 * ## Por qué el spec insiste en minutos
 *
 * El §2 lo dice sin rodeos: «los días decimales (`2.5`) hacen imposible el cálculo exacto con
 * jornadas partidas y provocan **deriva acumulada**». Media jornada de una de ocho horas son cuatro
 * horas; media de una de siete son tres y media. Guardar «0,5 días» pierde esa diferencia, y al
 * sumarla mil trescientas veces el cierre del plan se mueve sin que nadie sepa por qué.
 *
 * Un entero de minutos no deriva: se suma exacto y se convierte a días **cuando hace falta
 * enseñarlo**, no antes.
 *
 * ## Este módulo no cambia el motor todavía
 *
 * Es el cimiento de la migración, y va primero a propósito: es puro, se prueba con aritmética y no
 * toca ni el esquema ni las vistas. Lo que venga después —las columnas, el motor, las seis
 * pantallas— convierte **aquí** y no cada uno por su cuenta, que es como dos sitios acaban dando
 * cifras distintas para la misma línea.
 */

/** La jornada por omisión: ocho horas. Es lo que el §3.5 usa en sus tres ejemplos verificados. */
export const MINUTOS_POR_JORNADA = 480

/** Una jornada válida: entre un minuto y las veinticuatro horas. */
export function jornadaValida(minutos: number): boolean {
  return Number.isInteger(minutos) && minutos > 0 && minutos <= 24 * 60
}

/**
 * Días hábiles a minutos laborables.
 *
 * Redondea al minuto porque los minutos son la unidad de guardado y un valor con decimales aquí
 * volvería a meter por la puerta de atrás la deriva que este módulo existe para evitar.
 */
export function aMinutos(dias: number, minutosPorJornada = MINUTOS_POR_JORNADA): number {
  if (!jornadaValida(minutosPorJornada)) {
    throw new RangeError(`Una jornada de ${minutosPorJornada} minutos no es una jornada.`)
  }
  return Math.round(dias * minutosPorJornada)
}

/**
 * Minutos laborables a días hábiles, **sin redondear**.
 *
 * Aquí sí sale decimal, y es correcto: son los minutos los que mandan y el día es la forma de
 * enseñarlos. Quien lo pinte decide cuántos decimales caben en su columna; quien calcule sigue con
 * los minutos.
 */
export function aDias(minutos: number, minutosPorJornada = MINUTOS_POR_JORNADA): number {
  if (!jornadaValida(minutosPorJornada)) {
    throw new RangeError(`Una jornada de ${minutosPorJornada} minutos no es una jornada.`)
  }
  return minutos / minutosPorJornada
}

/**
 * Cómo se escribe una duración en minutos para que alguien la lea.
 *
 * «2 d», «2,5 d», «3 h», «90 min». Se elige la unidad más grande que no mienta: media jornada de
 * siete horas son tres horas y media, y decir «0,5 d» obliga a quien lo lee a saber la jornada del
 * proyecto para entenderlo.
 */
export function comoTexto(minutos: number, minutosPorJornada = MINUTOS_POR_JORNADA): string {
  if (minutos === 0) return '0'
  if (minutos % minutosPorJornada === 0) return `${minutos / minutosPorJornada} d`
  if (minutos % 60 === 0) return `${minutos / 60} h`
  const dias = minutos / minutosPorJornada
  // Con un cuarto de jornada exacto el día se lee mejor que los minutos: «0,25 d» contra «120 min».
  if (Number.isInteger(dias * 4)) return `${String(dias).replace('.', ',')} d`
  return `${minutos} min`
}

/**
 * El esfuerzo del §3.5: `Work = Duration × Units`.
 *
 * `unidadesBp` va en puntos base —10 000 es una jornada completa— porque es como el resto del
 * sistema guarda la dedicación, y porque «0,5» otra vez sería un decimal donde no hace falta.
 */
export function trabajoEnMinutos(
  duracionEnMinutos: number,
  unidadesBp: number,
  cuantasPersonas = 1,
): number {
  return Math.round((duracionEnMinutos * unidadesBp * cuantasPersonas) / 10_000)
}

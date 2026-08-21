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

/**
 * Lee una duración escrita a mano y la devuelve en minutos laborables.
 *
 * Es la vuelta de `comoTexto`, y tiene que aceptar lo que la gente escribe de verdad: «4h», «4 h»,
 * «90 min», «1,5 d», «0.5d» y un número pelado, que se entiende en días porque es la unidad en la
 * que está escrito el plan entero.
 *
 * ## Por qué devuelve un motivo en vez de lanzar
 *
 * Quien la llama es una celda de una rejilla, y ahí lo que hace falta no es una excepción sino una
 * frase que se pueda enseñar debajo del cuadro de texto. Escribir «cuatro horas» no es un error del
 * programa: es una persona escribiendo, y merece que le digan qué se admite.
 *
 * Sin unidad y sin decimales el número son días; con coma o con punto, también. Lo que no se admite
 * es una duración negativa —no existe— ni un texto vacío, que sería borrar la duración y eso no es
 * lo mismo que ponerla a cero.
 */
export function leerDuracion(
  texto: string,
  minutosPorJornada = MINUTOS_POR_JORNADA,
): { readonly minutos: number } | { readonly motivo: string } {
  const limpio = texto.trim().toLowerCase().replace(',', '.')
  if (limpio === '') return { motivo: 'Escribe una duración: «4 h», «90 min», «1,5 d».' }

  // La unidad se lee por el final y sin expresiones regulares: el texto viene de un cuadro de
  // edición y las tres terminaciones posibles se distinguen mirando los últimos caracteres.
  let numero = limpio
  let porUnidad = minutosPorJornada
  for (const [sufijo, factor] of [
    ['min', 1],
    ['m', 1],
    ['h', 60],
    ['d', minutosPorJornada],
  ] as const) {
    if (limpio.endsWith(sufijo)) {
      numero = limpio.slice(0, limpio.length - sufijo.length).trim()
      porUnidad = factor
      break
    }
  }

  const cantidad = Number(numero)
  if (numero === '' || !Number.isFinite(cantidad)) {
    return { motivo: `No se entiende «${texto.trim()}». Se admite «4 h», «90 min» o «1,5 d».` }
  }
  if (cantidad < 0) return { motivo: 'Una duración no puede ser negativa.' }

  // Se redondea al minuto porque el minuto es la unidad: «1,3 d» son 624 minutos exactos, y dejar
  // el decimal suelto reintroduciría justo la deriva que el §2 quita.
  return { minutos: Math.round(cantidad * porUnidad) }
}

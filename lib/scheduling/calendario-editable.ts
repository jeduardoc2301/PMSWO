/**
 * Qué se puede cambiar del calendario de un proyecto, y qué no (§3.1).
 *
 * Aparte del servicio porque son reglas, no consultas, y porque equivocarse aquí no se ve en la
 * pantalla sino en el plan: quitar un día laborable de la semana corre las fechas de mil líneas, y
 * el error aparece a la semana siguiente, cuando alguien dice que la fecha de cierre cambió sola.
 */

/** Los días de la semana como los guarda `ProjectCalendar.workingWeekdays`: 0 domingo, 6 sábado. */
export const NOMBRES_DE_DIA = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const

/** Lunes a viernes, que es lo que hay si nadie dice otra cosa. */
export const SEMANA_POR_OMISION: readonly number[] = Object.freeze([1, 2, 3, 4, 5])

/**
 * ¿Se puede guardar esta semana laborable?
 *
 * Devuelve el motivo, o `null` si sí. La única regla dura es que quede al menos un día: una semana
 * sin días laborables no alarga el proyecto, lo hace **infinito** — el motor buscaría un día hábil
 * que no llega nunca. Con el plan de referencia eso son 1 368 líneas colgadas en una búsqueda que
 * se corta por el tope y devuelve fechas sin sentido.
 */
export function porQueNoEsSemanaValida(dias: readonly unknown[]): string | null {
  if (!Array.isArray(dias)) return 'La semana laborable se guarda como una lista de días.'
  const limpios = dias.filter((d): d is number => typeof d === 'number' && Number.isInteger(d))
  if (limpios.length !== dias.length) return 'Los días van como números enteros del 0 al 6.'
  if (limpios.some((d) => d < 0 || d > 6)) return 'Los días van del 0 (domingo) al 6 (sábado).'
  if (new Set(limpios).size !== limpios.length) return 'Hay días repetidos en la semana.'
  if (limpios.length === 0) {
    return 'Una semana sin días laborables no alarga el proyecto: lo hace imposible de programar.'
  }
  return null
}

/** La semana, ordenada y sin repetidos, como se guarda. */
export function normalizarSemana(dias: readonly number[]): number[] {
  return [...new Set(dias)].sort((a, b) => a - b)
}

/** Cómo se lee una semana laborable: «lunes a viernes», o la lista cuando no es un tramo. */
export function comoSeLeeLaSemana(dias: readonly number[]): string {
  const orden = normalizarSemana(dias)
  if (orden.length === 0) return 'ningún día'
  if (orden.length === 7) return 'todos los días'

  // Un tramo seguido se lee como tramo; una semana con huecos —lunes, miércoles y viernes— se lee
  // enumerada, porque «lunes a viernes» diría algo falso.
  const seguido = orden.every((d, i) => i === 0 || d === orden[i - 1]! + 1)
  if (seguido && orden.length > 2) {
    return `${NOMBRES_DE_DIA[orden[0]!]} a ${NOMBRES_DE_DIA[orden[orden.length - 1]!]}`
  }
  return orden.map((d) => NOMBRES_DE_DIA[d]!).join(', ')
}

/**
 * ¿Se puede guardar esta fecha como día no laborable?
 *
 * Se admite cualquier fecha civil, incluida una que caiga en fin de semana: un festivo que cae en
 * sábado no estorba, y rechazarlo obligaría a quien carga el calendario del año a filtrarlo a mano.
 */
export function porQueNoEsFestivoValido(fecha: unknown): string | null {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return 'La fecha va en formato AAAA-MM-DD.'
  }
  const d = new Date(`${fecha}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return 'Esa fecha no existe.'
  // Se comprueba la ida y vuelta: «2026-02-30» parsea a marzo y pasaría por buena.
  if (d.toISOString().slice(0, 10) !== fecha) return 'Esa fecha no existe.'
  return null
}

/**
 * Cuántos días laborables se pierden o se ganan al cambiar la semana.
 *
 * Sirve para avisar antes de guardar: quitar el viernes de la semana laborable no es un ajuste de
 * pantalla, es correr el cierre del proyecto. La cifra hace que la decisión se tome sabiendo.
 */
export function cuantoCambiaLaSemana(antes: readonly number[], despues: readonly number[]): number {
  return normalizarSemana(despues).length - normalizarSemana(antes).length
}

/**
 * Los tramos de un día hábil, tal como los guarda `ProjectCalendar.turnos` (§3.1).
 *
 * De nueve a una y de dos a seis: ocho horas partidas por la comida. Es lo que se dibuja mientras
 * nadie configure otra cosa, y coincide con los 480 minutos que trae `Project.minutosPorJornada`.
 */
export const TURNOS_POR_OMISION: readonly { readonly desde: number; readonly hasta: number }[] =
  Object.freeze([
    Object.freeze({ desde: 9 * 60, hasta: 13 * 60 }),
    Object.freeze({ desde: 14 * 60, hasta: 18 * 60 }),
  ])

/**
 * ¿Se pueden guardar estos turnos?
 *
 * Devuelve el motivo, o `null` si sí. Las mismas reglas que aplica `crearJornada` al construir la
 * jornada del motor, dichas aquí en una frase que se le puede enseñar a alguien: la ruta no puede
 * contestar con una excepción, y el motor no puede aceptar lo que la ruta deje pasar.
 *
 * El turno nocturno —de las diez de la noche a las seis de la mañana— se rechaza a propósito: deja
 * sin respuesta a qué día hábil pertenece un minuto de la madrugada, y de esa respuesta cuelgan el
 * roll-up de los resúmenes y la carga por día.
 */
export function porQueNoSonTurnosValidos(turnos: unknown): string | null {
  if (!Array.isArray(turnos)) return 'Los turnos se guardan como una lista de tramos.'
  if (turnos.length === 0) return 'Un día sin tramos de trabajo no permite programar nada que dure.'

  const limpios: { desde: number; hasta: number }[] = []
  for (const t of turnos) {
    if (typeof t !== 'object' || t === null) return 'Cada tramo va como {desde, hasta}.'
    const { desde, hasta } = t as { desde?: unknown; hasta?: unknown }
    if (!Number.isInteger(desde) || !Number.isInteger(hasta)) {
      return 'Los tramos van en minutos enteros desde la medianoche: las nueve son 540.'
    }
    limpios.push({ desde: desde as number, hasta: hasta as number })
  }

  limpios.sort((a, b) => a.desde - b.desde)
  let anterior = -1
  for (const t of limpios) {
    if (t.hasta <= t.desde) return `El tramo ${t.desde}–${t.hasta} termina antes de empezar.`
    if (t.desde < 0 || t.hasta > 1440) {
      return `El tramo ${t.desde}–${t.hasta} se sale del día. Un turno que cruza la medianoche deja sin respuesta a qué día hábil pertenece la madrugada.`
    }
    if (t.desde < anterior) return `El tramo que empieza en ${t.desde} pisa al anterior, que acaba en ${anterior}.`
    anterior = t.hasta
  }
  return null
}

/** Minutos que suman unos turnos: la jornada que definen. */
export function minutosDeLosTurnos(
  turnos: readonly { readonly desde: number; readonly hasta: number }[],
): number {
  let total = 0
  for (const t of turnos) total += t.hasta - t.desde
  return total
}

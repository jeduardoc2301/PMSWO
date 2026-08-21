/**
 * Tiempo laborable medido en minutos (§3.1).
 *
 * El calendario de al lado cuenta **días** hábiles; éste cuenta **minutos** dentro de esos días. Es
 * lo que hace falta para que una tarea pueda durar cuatro horas, empezar a las 14:00 y terminar a
 * las 10:00 del día siguiente sin que nadie tenga que redondear.
 *
 * El spec lo dice sin rodeos: «este es el módulo donde fallan todos los clones». Los casos que
 * nombra —jornada partida por la comida, festivos consecutivos, semanas de seis días, duración
 * cero— están todos en la batería de pruebas, con su nombre.
 *
 * ## Por qué no hay ningún bucle aquí dentro
 *
 * El spec pide precomputar un índice de minutos acumulados cada quince minutos para un año arriba y
 * abajo, y buscar en él por bisección. Ese índice existe porque da por hecho que avanzar N minutos
 * se hace recorriendo día a día; con 10 000 tareas, dice, son veinte segundos contra doscientos
 * milisegundos.
 *
 * Aquí no se recorre nada, así que el índice sobra. La cuenta se hace al derecho y al revés:
 *
 * - **al derecho**, los minutos laborables transcurridos hasta un instante son
 *   `díasHábilesAntes × minutosDeLaJornada + loTrabajadoHoyHastaEsaHora`, y el primer factor ya lo
 *   da el calendario en tiempo constante;
 * - **al revés**, avanzar N minutos es sumar N a ese total y deshacer la división: el cociente dice
 *   qué día hábil es, y el resto, qué hora de ese día.
 *
 * Sale exacto, no ocupa memoria y no envejece: un índice de un año se queda corto el día que
 * alguien planifique a dieciocho meses, y eso no avisa, sólo devuelve mal. La prueba que lo sostiene
 * no mide segundos —eso depende de la máquina— sino **cuántas veces se toca el calendario**: sumar
 * diez minutos y sumar diecinueve años lo tocan el mismo número de veces.
 *
 * ## Lo que este módulo no hace
 *
 * **No hay turno nocturno.** Una jornada que empieza a las 22:00 y termina a las 06:00 del día
 * siguiente deja sin respuesta la pregunta de a qué día hábil pertenece un minuto de la madrugada, y
 * de ahí cuelgan el roll-up, la carga por día y el ordinal entero. Se rechaza al construir la
 * jornada, en vez de aceptarla y contestar cualquier cosa. Cruzar la medianoche **sí** funciona
 * cuando el que cruza es el trabajo y no el turno: con jornada de 24 h, cinco horas a partir de las
 * 23:00 terminan a las 04:00 del día siguiente, y eso está probado.
 *
 * **No hay husos ni horario de verano.** Los instantes son minutos UTC desde el epoch y el
 * calendario no tiene zona, así que no hay ningún salto que modelar. El día que el proyecto guarde
 * su zona —el spec la quiere en `timestamptz`— la conversión se hace al presentar, que es donde el
 * propio spec la pone, y este módulo no se entera.
 */

import { type WorkCalendar } from './calendar'
import { type DayNumber, type IsoDate, toDayNumber, toIsoDate } from './date'

/** Minutos que tiene un día de calendario. */
export const MINUTOS_POR_DIA = 1440

/**
 * Un instante: minutos enteros desde el 1 de enero de 1970 a las 00:00 UTC.
 *
 * En minutos y no en milisegundos porque el minuto es la unidad más fina que el spec pide guardar,
 * y porque así el instante y la duración se miden en lo mismo: sumar es sumar.
 */
export type Instante = number

/** Un tramo de trabajo dentro del día, en minutos desde la medianoche. `hasta` no se trabaja. */
export interface Turno {
  readonly desde: number
  readonly hasta: number
}

export interface Jornada {
  /** Los tramos, ordenados y sin solaparse. */
  readonly turnos: readonly Turno[]
  /** Minutos que se trabajan en un día hábil completo. */
  readonly minutos: number
}

/**
 * La jornada de siempre: de nueve a una y de dos a seis.
 *
 * Ocho horas partidas por la comida, que son los mismos 480 minutos que usa el resto del sistema.
 * Va partida a propósito: si la de por omisión fuera un bloque corrido, el caso partido sería el
 * raro y saldría a la luz tarde, cuando alguien lo estrenara.
 */
export const JORNADA_PARTIDA: Jornada = crearJornada([
  { desde: 9 * 60, hasta: 13 * 60 },
  { desde: 14 * 60, hasta: 18 * 60 },
])

/**
 * Construye una jornada a partir de sus tramos.
 *
 * @throws RangeError si un tramo está al revés, se sale del día, cruza la medianoche o pisa al
 *   anterior. Todas son formas de que la cuenta de minutos deje de ser una función monótona, y una
 *   jornada rota no se nota al construirla: se nota tres pantallas más allá, con una fecha absurda.
 */
export function crearJornada(turnos: readonly Turno[]): Jornada {
  if (turnos.length === 0) {
    throw new RangeError('Una jornada sin tramos no permite programar nada que dure.')
  }

  const ordenados = [...turnos].sort((a, b) => a.desde - b.desde)
  let minutos = 0
  let anterior = -1

  for (const turno of ordenados) {
    if (!Number.isInteger(turno.desde) || !Number.isInteger(turno.hasta)) {
      throw new RangeError(`Los tramos van en minutos enteros; se recibió ${turno.desde}–${turno.hasta}.`)
    }
    if (turno.hasta <= turno.desde) {
      throw new RangeError(`El tramo ${turno.desde}–${turno.hasta} termina antes de empezar.`)
    }
    if (turno.desde < 0 || turno.hasta > MINUTOS_POR_DIA) {
      throw new RangeError(
        `El tramo ${turno.desde}–${turno.hasta} se sale del día. Un turno que cruza la medianoche ` +
          'deja sin respuesta a qué día hábil pertenece la madrugada; pártelo en dos días.',
      )
    }
    if (turno.desde < anterior) {
      throw new RangeError(`El tramo que empieza en ${turno.desde} pisa al anterior, que acaba en ${anterior}.`)
    }
    anterior = turno.hasta
    minutos += turno.hasta - turno.desde
  }

  return Object.freeze({ turnos: Object.freeze(ordenados.map((t) => Object.freeze({ ...t }))), minutos })
}

/** El instante en que empieza ese minuto de esa fecha. */
export function instanteDe(fecha: IsoDate, minutoDelDia = 0): Instante {
  return toDayNumber(fecha) * MINUTOS_POR_DIA + minutoDelDia
}

/** La fecha en la que cae el instante. */
export function fechaDe(instante: Instante): IsoDate {
  return toIsoDate(diaDe(instante))
}

/** El día en el que cae el instante. */
export function diaDe(instante: Instante): DayNumber {
  return Math.floor(instante / MINUTOS_POR_DIA)
}

/** Minutos transcurridos desde la medianoche de su día. */
export function minutoDelDiaDe(instante: Instante): number {
  return instante - diaDe(instante) * MINUTOS_POR_DIA
}

/** El instante escrito como lo leería una persona: «2026-06-01 14:30». */
export function comoHora(instante: Instante): string {
  const minuto = minutoDelDiaDe(instante)
  const hh = String(Math.floor(minuto / 60)).padStart(2, '0')
  const mm = String(minuto % 60).padStart(2, '0')
  return `${fechaDe(instante)} ${hh}:${mm}`
}

export interface Reloj {
  readonly calendario: WorkCalendar
  readonly jornada: Jornada

  /** Si en ese minuto se trabaja. El minuto que empieza al cerrar la jornada ya no cuenta. */
  esLaborable(instante: Instante): boolean

  /**
   * El primer instante laborable a partir de ése, incluido. Normaliza un **comienzo**.
   *
   * Es `nextWorkingInstant` del spec: un lunes a las 07:00 devuelve el lunes a las 09:00, y un
   * sábado a cualquier hora devuelve el lunes a las 09:00.
   */
  abrir(instante: Instante): Instante

  /**
   * El último instante laborable hasta ése, incluido. Normaliza un **fin**.
   *
   * Es `prevWorkingInstant`. No es la imagen especular de `abrir` y no debe serlo: a las 13:00, con
   * la jornada partida, `abrir` da las 14:00 —el trabajo se reanuda entonces— y `cerrar` da las
   * 13:00 —el trabajo se detuvo justo ahí—. Confundirlas es lo que hace que una tarea que termina a
   * la hora de comer aparezca terminando después de comer.
   */
  cerrar(instante: Instante): Instante

  /**
   * Avanza minutos laborables. Es `addWorkingTime`.
   *
   * Devuelve un **fin**: si los minutos se acaban justo al cerrar la jornada, contesta el cierre de
   * ese día y no la apertura del siguiente. Una tarea de ocho horas que empieza un lunes a las 09:00
   * termina el lunes a las 18:00; decir «martes 09:00» la haría durar dos días en la pantalla y
   * dispararía un día tarde todo lo que cuelgue de su fin. Quien necesite un comienzo —el sucesor de
   * un vínculo, por ejemplo— pasa el resultado por `abrir`.
   */
  sumar(instante: Instante, minutos: number): Instante

  /** Retrocede minutos laborables. Es `subWorkingTime`. Devuelve un **comienzo**. */
  restar(instante: Instante, minutos: number): Instante

  /**
   * Minutos laborables en el intervalo `[a, b)`. Es `diffWorkingTime`.
   *
   * Cero si `b` no es posterior a `a`, igual que `countBetween` en el calendario de días: quien
   * pregunta cuánto trabajo cabe entre dos fechas al revés no quiere un número negativo, quiere
   * saber que no cabe nada.
   */
  entre(a: Instante, b: Instante): number

  /**
   * Minutos laborables transcurridos desde el epoch hasta ese instante, con signo.
   *
   * Es la función que sostiene a todas las demás y se expone porque también sirve fuera: dos
   * instantes son comparables en carga de trabajo restando sus acumulados, sin recorrer nada.
   */
  acumulado(instante: Instante): number
}

export function crearReloj(calendario: WorkCalendar, jornada: Jornada = JORNADA_PARTIDA): Reloj {
  const { turnos, minutos: minutosPorJornada } = jornada

  /** Minutos trabajados en un día hábil desde la medianoche hasta ese minuto. */
  function trabajadoHasta(minutoDelDia: number): number {
    let total = 0
    for (const turno of turnos) {
      if (minutoDelDia <= turno.desde) break
      total += Math.min(minutoDelDia, turno.hasta) - turno.desde
    }
    return total
  }

  /**
   * El minuto del día en el que se llevan trabajados `resto` minutos.
   *
   * Con `resto` cero contesta la apertura del primer turno, y con la jornada entera, el cierre del
   * último: las dos puntas del día, que son las dos formas de caer justo en un límite.
   */
  function minutoConTrabajo(resto: number): number {
    let llevado = 0
    for (const turno of turnos) {
      const cabe = turno.hasta - turno.desde
      if (resto < llevado + cabe) return turno.desde + (resto - llevado)
      llevado += cabe
    }
    return turnos[turnos.length - 1].hasta
  }

  /** El instante que ocupa ese resto dentro del día hábil número `ordinal`. */
  function enElOrdinal(ordinal: number, resto: number): Instante {
    return calendario.dayOfOrdinal(ordinal) * MINUTOS_POR_DIA + minutoConTrabajo(resto)
  }

  function acumulado(instante: Instante): number {
    const dia = diaDe(instante)
    // `ordinalOf` cuenta los días hábiles estrictamente anteriores, también cuando el día no lo es:
    // de un sábado devuelve la posición del lunes, que es justo esa cuenta.
    const base = calendario.ordinalOf(dia) * minutosPorJornada
    return calendario.isWorkingDay(dia) ? base + trabajadoHasta(minutoDelDiaDe(instante)) : base
  }

  function esLaborable(instante: Instante): boolean {
    const dia = diaDe(instante)
    if (!calendario.isWorkingDay(dia)) return false
    const minuto = minutoDelDiaDe(instante)
    return turnos.some((t) => minuto >= t.desde && minuto < t.hasta)
  }

  function abrir(instante: Instante): Instante {
    const dia = diaDe(instante)
    const minuto = minutoDelDiaDe(instante)

    if (calendario.isWorkingDay(dia)) {
      for (const turno of turnos) {
        if (minuto < turno.desde) return dia * MINUTOS_POR_DIA + turno.desde
        if (minuto < turno.hasta) return instante
      }
    }
    // Ni hoy queda trabajo ni hoy se trabaja: la apertura del siguiente día hábil. `ordinalOf` de un
    // día no hábil ya apunta al siguiente, así que sirve para los dos casos sin ramificar.
    const siguiente = calendario.isWorkingDay(dia) ? calendario.ordinalOf(dia) + 1 : calendario.ordinalOf(dia)
    return enElOrdinal(siguiente, 0)
  }

  function cerrar(instante: Instante): Instante {
    const dia = diaDe(instante)
    const minuto = minutoDelDiaDe(instante)

    if (calendario.isWorkingDay(dia)) {
      for (let i = turnos.length - 1; i >= 0; i -= 1) {
        const turno = turnos[i]
        if (minuto >= turno.hasta) return dia * MINUTOS_POR_DIA + turno.hasta
        if (minuto > turno.desde) return instante
      }
    }
    const anterior = calendario.ordinalOf(dia) - 1
    return enElOrdinal(anterior, minutosPorJornada)
  }

  function sumar(instante: Instante, minutos: number): Instante {
    if (minutos < 0) return restar(instante, -minutos)
    const total = acumulado(abrir(instante)) + minutos
    let ordinal = Math.floor(total / minutosPorJornada)
    let resto = total - ordinal * minutosPorJornada
    // Caer justo en el límite se contesta cerrando el día anterior, no abriendo el siguiente.
    if (minutos > 0 && resto === 0) {
      ordinal -= 1
      resto = minutosPorJornada
    }
    return enElOrdinal(ordinal, resto)
  }

  function restar(instante: Instante, minutos: number): Instante {
    if (minutos < 0) return sumar(instante, -minutos)
    const total = acumulado(cerrar(instante)) - minutos
    const ordinal = Math.floor(total / minutosPorJornada)
    // Hacia atrás se busca un comienzo, así que el límite se contesta abriendo el día: es la
    // asimetría de `abrir` y `cerrar`, aquí otra vez y por la misma razón.
    return enElOrdinal(ordinal, total - ordinal * minutosPorJornada)
  }

  function entre(a: Instante, b: Instante): number {
    return b <= a ? 0 : acumulado(b) - acumulado(a)
  }

  return Object.freeze({ calendario, jornada, esLaborable, abrir, cerrar, sumar, restar, entre, acumulado })
}

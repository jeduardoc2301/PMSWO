/**
 * Estado y atraso al corte: las fórmulas del archivo de referencia, como reglas del motor.
 *
 * El plan calcula dos columnas a partir de una **fecha de corte** (`FechaCorte`, un rango con nombre
 * que por omisión es `TODAY()` y se puede congelar para fijar una foto). Este módulo reproduce esas
 * fórmulas leídas **del archivo mismo** — no de una captura ni de una suposición:
 *
 *     Estado (I):   IF(H=1,"Cerrado",IF(H=0,"No iniciado","En curso"))
 *
 *     Atraso (J):   IF(G=0,
 *                      IF(H=1, 0, IF(FechaCorte<=F, 0, -(NETWORKDAYS(F,FechaCorte)-1))),
 *                      ROUND((H - MIN(1,MAX(0, NETWORKDAYS(E,MIN(FechaCorte,F))/G))) * G, 1))
 *
 * donde E=inicio, F=fin, G=duración hábil, H=avance. En palabras:
 *
 * - **Una tarea** debe la fracción de sí misma que el calendario ya consumió —días hábiles del
 *   inicio al corte, topados en su propio fin—, y la diferencia contra lo real se convierte a
 *   **días de trabajo**, que es la unidad en que se conversa («vamos día y medio tarde»).
 * - **Un hito no cerrado y ya vencido acumula un día de atraso por cada día hábil** desde su fecha.
 *   No tiene trabajo que medir, pero sí una promesa incumplida que crece sola.
 * - **El estado mira el avance, no el calendario.** «No iniciado» con 14 días de deuda es una
 *   lectura válida —y es la fila más importante de cualquier revisión—; separar las dos señales es
 *   lo que permite verla.
 *
 * `NETWORKDAYS` cuenta días hábiles incluyendo ambos extremos, de lunes a viernes sin feriados —
 * igual que el calendario por omisión del motor, y por la misma razón: el plan de referencia declara
 * expresamente que no carga feriados.
 */

import { type WorkCalendar } from './calendar'
import { type IsoDate, toDayNumber } from './date'

export type EstadoAlCorte = 'NO_INICIADO' | 'EN_CURSO' | 'CERRADO'

export interface VarianceInput {
  /** Primer día de la línea (columna E). */
  readonly start: IsoDate
  /** Último día de la línea (columna F). En un hito coincide con el inicio. */
  readonly finish: IsoDate
  /** Duración en días hábiles (columna G). Cero en hitos. */
  readonly duration: number
  /** Avance real capturado, de 0 a 1 (columna H). */
  readonly progress: number
  /** La fecha de corte contra la que se mide. */
  readonly cutoff: IsoDate
}

export interface Variance {
  readonly estado: EstadoAlCorte
  /**
   * Fracción que debería estar hecha al corte, de 0 a 1. Antes del inicio es 0 —no se le puede
   * deber nada a una línea que aún no toca—; después del fin es 1 completa.
   */
  readonly expected: number
  /** Días hábiles de atraso (negativo) o ventaja (positivo). Redondeado a décimas, como el archivo. */
  readonly deltaDays: number
}

/** El estado de una línea según su avance, sin mirar el calendario. */
export function estadoAlCorte(progress: number): EstadoAlCorte {
  if (progress >= 1) return 'CERRADO'
  if (progress > 0) return 'EN_CURSO'
  return 'NO_INICIADO'
}

/** Cuánto debería llevar la línea al corte, y cuántos días de trabajo separan lo real de eso. */
export function varianceAtCutoff(input: VarianceInput, calendar: WorkCalendar): Variance {
  const estado = estadoAlCorte(input.progress)

  // La rama de los hitos: sin trabajo que medir, la deuda es de calendario puro.
  if (input.duration <= 0) {
    if (input.progress >= 1 || toDayNumber(input.cutoff) <= toDayNumber(input.finish)) {
      return { estado, expected: input.progress >= 1 ? 1 : 0, deltaDays: 0 }
    }
    // −(NETWORKDAYS(F, corte) − 1): un día de atraso por cada día hábil desde el vencimiento,
    // sin contar el día del hito mismo.
    return { estado, expected: 1, deltaDays: -(networkdays(calendar, input.finish, input.cutoff) - 1) }
  }

  // La rama de las tareas. El transcurrido se topa en el fin de la línea (MIN(FechaCorte, F)):
  // pasada su ventana ya no se le puede deber más que ella completa, y si sus fechas y su duración
  // no cuadran, manda lo que el calendario de la línea diga — igual que en el archivo.
  const tope = toDayNumber(input.cutoff) < toDayNumber(input.finish) ? input.cutoff : input.finish
  const transcurridos = networkdays(calendar, input.start, tope)
  const expected = Math.min(1, Math.max(0, transcurridos / input.duration))
  const deltaDays = redondeaADecimas((input.progress - expected) * input.duration)

  return { estado, expected, deltaDays }
}

/**
 * `NETWORKDAYS` de Excel: días hábiles entre dos fechas, contando ambos extremos.
 *
 * Si el fin queda antes del inicio devuelve 0 — Excel devuelve un negativo que las fórmulas del
 * archivo recortan con `MAX(0, …)`, así que el efecto observable es el mismo.
 */
function networkdays(calendar: WorkCalendar, desde: IsoDate, hasta: IsoDate): number {
  const primero = calendar.ordinalOf(calendar.next(toDayNumber(desde)))
  const ultimo = calendar.ordinalOf(calendar.previous(toDayNumber(hasta)))
  return Math.max(0, ultimo - primero + 1)
}

/**
 * A décimas y con el cero limpio: el archivo redondea con `ROUND(…, 1)`, y `Math.round` de un
 * negativo chiquito produce `-0`, que en pantalla se ve como un signo menos pegado a un cero.
 */
function redondeaADecimas(valor: number): number {
  const redondeado = Math.round(valor * 10) / 10
  return Object.is(redondeado, -0) ? 0 : redondeado
}

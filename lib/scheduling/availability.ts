/**
 * Cuándo puede trabajar de verdad quien lleva una tarea: el caso 17 de la batería del §12.
 *
 * ## El problema
 *
 * El motor programa en ordinales de día hábil del calendario del **proyecto**, y esa es una buena
 * decisión: convierte fechas en enteros una vez, hace aritmética exacta, y vuelve a fechas una vez.
 * No hay husos, no hay horario de verano, no hay medianoches.
 *
 * Pero el calendario del proyecto no sabe que Ana está de vacaciones del 10 al 12. Y una tarea de
 * cinco días asignada a Ana que empieza el lunes 8 no termina el viernes 12: termina el miércoles
 * 17, porque tres de esos cinco días Ana no estaba. El §3.1 lo dice como precedencia —calendario de
 * tarea, luego de recurso, luego de proyecto— y el §12 lo convierte en caso de prueba.
 *
 * Sin esto, el plan promete fechas que la persona asignada ya sabe que no puede cumplir, y lo hace
 * en silencio: las vacaciones están capturadas en el sistema, la vista de Carga las pinta, y el
 * cronograma sigue contando esos días como si se trabajaran.
 *
 * ## Cómo se resuelve sin romper la aritmética
 *
 * No se cambia la unidad. Se sigue trabajando en ordinales del calendario del proyecto, y lo único
 * que cambia es cómo se avanza dentro de una tarea: en lugar de `fin = inicio + duración − 1`, se
 * avanza contando **solo** los ordinales en que la persona está disponible.
 *
 * Una tarea sin ausencias que la afecten cuesta exactamente lo mismo que antes —la comprobación es
 * un `has` sobre un conjunto vacío— así que la inmensa mayoría del plan no paga nada por esto.
 */

/**
 * Ordinales de día hábil en que quien lleva la tarea no está.
 *
 * Es un conjunto y no un rango porque las ausencias no son una sola: alguien puede tener dos días
 * en marzo y una semana en julio, y puede haber varias personas en la misma tarea.
 */
export type OrdinalesNoDisponibles = ReadonlySet<number>

/** Nadie ausente. Se comparte para no crear un conjunto por tarea. */
export const SIEMPRE_DISPONIBLE: OrdinalesNoDisponibles = new Set<number>()

/**
 * Tope de días que se avanzan buscando disponibilidad antes de rendirse.
 *
 * Existe por una razón concreta: si alguien captura una ausencia abierta —o un año entero por
 * error— este bucle no terminaría nunca, y lo haría dentro del pase adelante, colgando la petición
 * entera sin dejar rastro de por qué. Con el tope, la tarea sale programada como si no hubiera
 * ausencias a partir de ahí: una fecha discutible es mejor que una pantalla que no carga.
 *
 * Diez años de días hábiles es holgadamente más de lo que dura cualquier proyecto de este sistema.
 */
const TOPE_DE_BUSQUEDA = 2600

/**
 * El primer ordinal, desde `desde` inclusive, en que la persona está disponible.
 *
 * Sirve para el arranque: una tarea que debería empezar el 10 y cuya persona está fuera hasta el 12
 * empieza el 13, no el 10 trabajando sola.
 */
export function primerDiaDisponible(desde: number, noDisponibles: OrdinalesNoDisponibles): number {
  if (noDisponibles.size === 0) return desde
  let ordinal = desde
  for (let i = 0; i < TOPE_DE_BUSQUEDA; i += 1) {
    if (!noDisponibles.has(ordinal)) return ordinal
    ordinal += 1
  }
  return desde
}

/**
 * Ordinal en que termina una tarea que arranca en `inicio` y consume `duracion` días de trabajo.
 *
 * `duracion` se cuenta en días **trabajados**, no en días transcurridos: son los cinco días de
 * esfuerzo del caso 17, y lo que se calcula es cuándo caen.
 *
 * Una duración de cero —un hito— termina donde empieza: no consume días, así que tampoco los salta.
 */
export function finConDisponibilidad(
  inicio: number,
  duracion: number,
  noDisponibles: OrdinalesNoDisponibles,
): number {
  if (duracion <= 0) return inicio
  if (noDisponibles.size === 0) return inicio + duracion - 1

  let restantes = duracion
  let ordinal = inicio
  let recorridos = 0
  let ultimoTrabajado = inicio

  while (restantes > 0 && recorridos < TOPE_DE_BUSQUEDA) {
    if (!noDisponibles.has(ordinal)) {
      ultimoTrabajado = ordinal
      restantes -= 1
    }
    if (restantes > 0) ordinal += 1
    recorridos += 1
  }

  // Si se agotó la búsqueda, se devuelve lo que se habría calculado sin ausencias. Es una fecha
  // discutible, pero es una fecha; colgarse dentro del pase adelante no lo es.
  if (restantes > 0) return inicio + duracion - 1
  return ultimoTrabajado
}

/**
 * Cuántos días hábiles se alargó una tarea por las ausencias de quien la lleva.
 *
 * Se expone para poder decirlo en pantalla. Una tarea que se alarga sin explicación parece un error
 * del plan; con el motivo escrito —«tres días porque Ana no está»— es información.
 */
export function diasPerdidos(
  inicio: number,
  duracion: number,
  noDisponibles: OrdinalesNoDisponibles,
): number {
  if (duracion <= 0 || noDisponibles.size === 0) return 0
  const conAusencias = finConDisponibilidad(inicio, duracion, noDisponibles)
  return conAusencias - (inicio + duracion - 1)
}

/** Un rango de ausencia, en fechas civiles y con los dos extremos incluidos. */
export interface RangoDeAusencia {
  readonly from: string
  readonly to: string
}

/** Lo mínimo del calendario que hace falta para traducir fechas a ordinales. */
interface CalendarioMinimo {
  ordinalOf(dia: number): number
  next(dia: number): number
  previous(dia: number): number
}

/**
 * Traduce las ausencias de cada línea a los ordinales que el motor entiende.
 *
 * Los rangos viajan del servidor en fechas civiles a propósito: un ordinal solo significa algo
 * junto al calendario que lo produjo, y mandar ordinales obligaría a los dos lados a estar de
 * acuerdo en algo que no se puede comprobar. Fechas, en cambio, significan lo mismo en todas partes.
 *
 * Un rango que empieza o termina en día no laborable se recorta al primer y último día hábil que
 * contiene: unas vacaciones de sábado a domingo no quitan ningún día de trabajo, y deben producir
 * un conjunto vacío en lugar de un rango invertido.
 *
 * @param ausencias por identificador de línea, tal como las devuelve el plan.
 * @param calendar el calendario del proyecto, ya reconstruido.
 */
export function ordinalesNoDisponibles(
  ausencias: Readonly<Record<string, readonly RangoDeAusencia[]>> | undefined,
  calendar: CalendarioMinimo,
  aDiaNumero: (iso: string) => number,
): ReadonlyMap<string, OrdinalesNoDisponibles> {
  const salida = new Map<string, Set<number>>()
  if (!ausencias) return salida

  for (const [id, rangos] of Object.entries(ausencias)) {
    for (const rango of rangos) {
      const desde = calendar.ordinalOf(calendar.next(aDiaNumero(rango.from)))
      const hasta = calendar.ordinalOf(calendar.previous(aDiaNumero(rango.to)))
      // Un rango que no contiene ningún día hábil sale invertido aquí, y no es un error: son unas
      // vacaciones de fin de semana, que no quitan trabajo a nadie.
      if (hasta < desde) continue
      const conjunto = salida.get(id) ?? new Set<number>()
      for (let o = desde; o <= hasta; o += 1) conjunto.add(o)
      salida.set(id, conjunto)
    }
  }
  return salida
}

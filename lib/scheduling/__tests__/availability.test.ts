import { describe, expect, it } from 'vitest'

import {
  SIEMPRE_DISPONIBLE,
  diasPerdidos,
  finConDisponibilidad,
  ordinalesNoDisponibles,
  primerDiaDisponible,
} from '../availability'
import { createWorkCalendar } from '../calendar'
import { toDayNumber } from '../date'

/**
 * Caso 17 de la batería del §12: «recurso con vacaciones del 10 al 12, tarea de 5 días que empieza
 * el 8 → termina el 17, no el 12».
 *
 * Aquí se prueba en ordinales de día hábil, que es la unidad en la que piensa el motor. El enunciado
 * del spec está en fechas de un mes que empieza el 8 en lunes: 8, 9, [10, 11, 12 fuera], fin de
 * semana, 15, 16, 17. Cinco días de trabajo repartidos en diez de calendario.
 *
 * La aritmética va aparte del motor porque es lo único de esto que se puede probar sin montar un
 * plan entero, y porque el motor no debe enterarse de qué es una vacación: solo de qué ordinales
 * no cuentan.
 */

describe('§12 caso 17 · una tarea se alarga por las ausencias de quien la lleva', () => {
  /**
   * El enunciado, traducido a ordinales de día hábil. El lunes 8 es el ordinal 0; martes 9 el 1;
   * miércoles 10, jueves 11 y viernes 12 son 2, 3 y 4 —las vacaciones—; el fin de semana no existe
   * como ordinal; lunes 15, martes 16 y miércoles 17 son 5, 6 y 7.
   */
  const VACACIONES = new Set([2, 3, 4])

  it('termina en el ordinal 7 (el 17), no en el 4 (el 12)', () => {
    expect(finConDisponibilidad(0, 5, VACACIONES)).toBe(7)
  })

  it('sin las vacaciones habría terminado en el 4', () => {
    expect(finConDisponibilidad(0, 5, SIEMPRE_DISPONIBLE)).toBe(4)
  })

  it('y la diferencia es exactamente los tres días de ausencia', () => {
    expect(diasPerdidos(0, 5, VACACIONES)).toBe(3)
  })
})

describe('finConDisponibilidad', () => {
  it('sin ausencias es la aritmética de siempre', () => {
    expect(finConDisponibilidad(10, 1, SIEMPRE_DISPONIBLE)).toBe(10)
    expect(finConDisponibilidad(10, 3, SIEMPRE_DISPONIBLE)).toBe(12)
  })

  it('una ausencia después del fin no alarga nada', () => {
    // La persona se va cuando la tarea ya terminó: no debe costar un día.
    expect(finConDisponibilidad(0, 3, new Set([9, 10]))).toBe(2)
  })

  it('una ausencia justo el último día sí alarga', () => {
    expect(finConDisponibilidad(0, 3, new Set([2]))).toBe(3)
  })

  it('una ausencia antes del arranque no cuenta', () => {
    expect(finConDisponibilidad(5, 3, new Set([1, 2, 3]))).toBe(7)
  })

  it('ausencias sueltas se suman', () => {
    // Falta el segundo y el cuarto día: la tarea de 3 se estira a 5.
    expect(finConDisponibilidad(0, 3, new Set([1, 3]))).toBe(4)
  })

  it('un hito no consume días, así que tampoco los salta', () => {
    // Un hito que cae en un día de ausencia sigue cayendo ahí: no es trabajo, es una marca.
    expect(finConDisponibilidad(5, 0, new Set([5]))).toBe(5)
  })

  it('una duración negativa se trata como cero, no como un bucle al revés', () => {
    expect(finConDisponibilidad(4, -2, new Set([4]))).toBe(4)
  })

  it('una ausencia interminable no cuelga el pase adelante', () => {
    // Alguien captura un año entero por error. Devolver una fecha discutible es mejor que colgar
    // la petición sin dejar rastro de por qué.
    const eterna = { size: 1, has: () => true } as unknown as ReadonlySet<number>
    expect(finConDisponibilidad(0, 5, eterna)).toBe(4)
  })
})

describe('primerDiaDisponible', () => {
  it('sin ausencias devuelve el mismo día', () => {
    expect(primerDiaDisponible(7, SIEMPRE_DISPONIBLE)).toBe(7)
  })

  it('salta hasta encontrar a la persona', () => {
    // Debería empezar el 10 y está fuera hasta el 12: empieza el 13, no el 10 trabajando sola.
    expect(primerDiaDisponible(2, new Set([2, 3, 4]))).toBe(5)
  })

  it('si ya está disponible no salta nada', () => {
    expect(primerDiaDisponible(5, new Set([2, 3, 4]))).toBe(5)
  })

  it('una ausencia interminable no cuelga', () => {
    const eterna = { size: 1, has: () => true } as unknown as ReadonlySet<number>
    expect(primerDiaDisponible(3, eterna)).toBe(3)
  })
})

describe('diasPerdidos', () => {
  it('cuenta lo que la ausencia le costó a esta tarea, no la ausencia entera', () => {
    // La persona falta cinco días pero solo tres caen dentro de la tarea.
    expect(diasPerdidos(0, 3, new Set([1, 2, 3, 8, 9]))).toBe(3)
  })

  it('sin ausencias es cero, y no hace ninguna cuenta', () => {
    expect(diasPerdidos(0, 5, SIEMPRE_DISPONIBLE)).toBe(0)
  })
})

describe('ordinalesNoDisponibles · del servidor al motor', () => {
  const cal = createWorkCalendar()
  const traducir = (a: Record<string, { from: string; to: string }[]>) =>
    ordinalesNoDisponibles(a, cal, toDayNumber)

  it('un rango de tres días hábiles da tres ordinales', () => {
    // Miércoles 10 a viernes 12 de marzo de 2027.
    const m = traducir({ obra: [{ from: '2027-03-10', to: '2027-03-12' }] })
    expect(m.get('obra')!.size).toBe(3)
  })

  it('unas vacaciones de fin de semana no quitan ningún día de trabajo', () => {
    // Sábado 13 y domingo 14: el rango sale invertido en ordinales, y eso no es un error.
    const m = traducir({ obra: [{ from: '2027-03-13', to: '2027-03-14' }] })
    expect(m.has('obra')).toBe(false)
  })

  it('varios rangos de la misma línea se acumulan', () => {
    const m = traducir({
      obra: [
        { from: '2027-03-10', to: '2027-03-10' },
        { from: '2027-03-17', to: '2027-03-17' },
      ],
    })
    expect(m.get('obra')!.size).toBe(2)
  })

  it('un rango que cruza el fin de semana cuenta solo los hábiles', () => {
    // Viernes 12 a lunes 15: son dos días de trabajo, no cuatro.
    const m = traducir({ obra: [{ from: '2027-03-12', to: '2027-03-15' }] })
    expect(m.get('obra')!.size).toBe(2)
  })

  it('sin ausencias devuelve un mapa vacío y no falla', () => {
    expect(ordinalesNoDisponibles(undefined, cal, toDayNumber).size).toBe(0)
    expect(traducir({}).size).toBe(0)
  })
})

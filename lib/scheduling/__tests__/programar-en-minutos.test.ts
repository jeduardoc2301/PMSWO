import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { comoHora, crearJornada, crearReloj } from '../reloj'
import { programarEnMinutos } from '../programar-en-minutos'
import type { Dependency, PlanTask } from '../types'

const reloj = crearReloj(createWorkCalendar())
const LUNES = '2026-06-01'

function programar(tasks: PlanTask[], dependencies: Dependency[] = [], r = reloj) {
  const programa = programarEnMinutos({ tasks, dependencies, reloj: r, comienzo: LUNES })
  return (id: string) => {
    const linea = programa.porId.get(id)!
    return `${comoHora(linea.comienzo)} → ${comoHora(linea.fin)}`
  }
}

describe('El pase adelante en minutos', () => {
  it('lo que no depende de nadie empieza cuando abre el plan', () => {
    const cuando = programar([{ id: 'a', name: 'Sola', duration: 1, duracionMin: 480 }])
    expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-01 18:00')
  })

  it('media jornada termina a la una, y la siguiente empieza a las dos', () => {
    // Es lo que el motor de días no puede decir: las dos caben el mismo día. En días, la segunda
    // empezaría el martes porque el lunes «ya está ocupado».
    const cuando = programar(
      [
        { id: 'a', name: 'Mañana', duration: 1, duracionMin: 240 },
        { id: 'b', name: 'Tarde', duration: 1, duracionMin: 240 },
      ],
      [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }],
    )

    expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-01 13:00')
    expect(cuando('b')).toBe('2026-06-01 14:00 → 2026-06-01 18:00')
  })

  it('el que cierra la jornada empuja al siguiente al día siguiente, sin sumar un día de más', () => {
    // El motor de días dice `fin + 1` porque su fin es el último día trabajado. Aquí ese `+1` no
    // existe y ponerlo sería una jornada entera de más: el fin ya es el instante en que se para.
    const cuando = programar(
      [
        { id: 'a', name: 'Un día', duration: 1, duracionMin: 480 },
        { id: 'b', name: 'El siguiente', duration: 1, duracionMin: 480 },
      ],
      [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }],
    )

    expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-01 18:00')
    expect(cuando('b')).toBe('2026-06-02 09:00 → 2026-06-02 18:00')
  })

  it('el fin de semana no cuenta, ni para la duración ni para el salto', () => {
    const cuando = programar(
      [
        { id: 'a', name: 'Cinco días', duration: 5, duracionMin: 2400 },
        { id: 'b', name: 'Detrás', duration: 1, duracionMin: 480 },
      ],
      [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }],
    )

    expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-05 18:00')
    expect(cuando('b')).toBe('2026-06-08 09:00 → 2026-06-08 18:00')
  })

  describe('los cuatro tipos de vínculo', () => {
    const DOS: PlanTask[] = [
      { id: 'a', name: 'Primera', duration: 2, duracionMin: 960 },
      { id: 'b', name: 'Segunda', duration: 2, duracionMin: 960 },
    ]

    it('SS une los comienzos', () => {
      const cuando = programar(DOS, [{ predecessorId: 'a', successorId: 'b', type: 'SS', lag: 0 }])
      expect(cuando('b')).toBe('2026-06-01 09:00 → 2026-06-02 18:00')
    })

    it('FF une los finales, retrocediendo la duración con el calendario', () => {
      const cuando = programar(
        [
          { id: 'a', name: 'Primera', duration: 6, duracionMin: 2880 },
          { id: 'b', name: 'Segunda', duration: 4, duracionMin: 1920 },
        ],
        [{ predecessorId: 'a', successorId: 'b', type: 'FF', lag: 0 }],
      )
      // A cierra el lunes siguiente a las seis —seis jornadas cruzando el fin de semana—; B dura
      // cuatro, así que abre el miércoles anterior y las dos cierran a la vez.
      expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-08 18:00')
      expect(cuando('b')).toBe('2026-06-03 09:00 → 2026-06-08 18:00')
    })

    it('SF va del comienzo de una al fin de la otra', () => {
      const cuando = programar(
        [
          { id: 'x', name: 'Antes', duration: 3, duracionMin: 1440 },
          { id: 'a', name: 'Primera', duration: 2, duracionMin: 960 },
          { id: 'b', name: 'Segunda', duration: 2, duracionMin: 960 },
        ],
        [
          { predecessorId: 'x', successorId: 'a', type: 'FS', lag: 0 },
          { predecessorId: 'a', successorId: 'b', type: 'SF', lag: 0 },
        ],
      )
      // A abre el jueves; B tiene que haber terminado para entonces, así que cierra el miércoles a
      // las seis —el mismo instante de trabajo que el jueves a las nueve— y abre el martes.
      expect(cuando('a')).toBe('2026-06-04 09:00 → 2026-06-05 18:00')
      expect(cuando('b')).toBe('2026-06-02 09:00 → 2026-06-03 18:00')
    })

    it('y el arranque del plan es un suelo: lo que pediría empezar antes se queda el primer día', () => {
      // Igual que en el motor de días. Un `FF` con una sucesora larga pide arrancar antes de que el
      // plan exista; adelantarla sería prometer trabajo en un día que no es del proyecto.
      const cuando = programar(
        [DOS[0], { id: 'b', name: 'Segunda', duration: 4, duracionMin: 1920 }],
        [{ predecessorId: 'a', successorId: 'b', type: 'FF', lag: 0 }],
      )
      expect(cuando('b')).toBe('2026-06-01 09:00 → 2026-06-04 18:00')
    })

    it('y el desfase se cuenta en tiempo laborable, no de calendario', () => {
      const cuando = programar(DOS, [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 3 }])
      // A cierra el martes; tres jornadas de espera son miércoles, jueves y viernes, así que B
      // abre el lunes siguiente y no el viernes.
      expect(cuando('b')).toBe('2026-06-08 09:00 → 2026-06-09 18:00')
    })

    it('un desfase negativo adelanta, y tampoco cuenta el fin de semana', () => {
      const cuando = programar(DOS, [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: -2 }])
      // A cierra el martes a las seis; dos jornadas hacia atrás es el lunes a las nueve.
      expect(cuando('b')).toBe('2026-06-01 09:00 → 2026-06-02 18:00')
    })
  })

  it('un hito no dura: empieza y termina en el mismo instante', () => {
    const cuando = programar(
      [
        { id: 'a', name: 'Trabajo', duration: 1, duracionMin: 480 },
        { id: 'h', name: 'Listo', duration: 0, kind: 'HITO', duracionMin: 0 },
      ],
      [{ predecessorId: 'a', successorId: 'h', type: 'FS', lag: 0 }],
    )
    expect(cuando('h')).toBe('2026-06-02 09:00 → 2026-06-02 09:00')
  })

  it('una línea sin minutos se programa por sus días, para poder correr un plan a medio migrar', () => {
    const cuando = programar([{ id: 'a', name: 'Sin migrar', duration: 3 }])
    expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-03 18:00')
  })

  it('y la jornada del proyecto manda: con siete horas, la misma tarea cierra a las cuatro', () => {
    const deSiete = crearReloj(createWorkCalendar(), crearJornada([{ desde: 9 * 60, hasta: 16 * 60 }]))
    const cuando = programar([{ id: 'a', name: 'Una jornada', duration: 1, duracionMin: 420 }], [], deSiete)
    expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-01 16:00')
  })
})

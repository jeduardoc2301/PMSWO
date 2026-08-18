import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { type IsoDate } from '../date'
import { reprogramarDesde } from '../reschedule'
import type { Dependency, PlanTask } from '../types'

/**
 * Mover una línea y empujar lo que quede en falso (§3.0, §7.2).
 *
 * El plan de prueba, en junio de 2026 —que abre en lunes— y con calendario de lunes a viernes:
 *
 * ```
 *   a  01-jun → 03-jun   (3 días)
 *   b  04-jun → 05-jun   (2 días)   a →FS→ b
 *   c  08-jun → 09-jun   (2 días)   b →FS→ c
 *   d  22-jun → 23-jun   (2 días)   c →FS→ d, con dos semanas de holgura
 * ```
 *
 * `d` tiene holgura a propósito: es la línea que demuestra la regla más importante, que una
 * sucesora con margen no se mueve.
 */

const calendar = createWorkCalendar()

const TAREAS: PlanTask[] = [
  { id: 'a', name: 'A', duration: 3, kind: 'ACTIVIDAD' },
  { id: 'b', name: 'B', duration: 2, kind: 'ACTIVIDAD' },
  { id: 'c', name: 'C', duration: 2, kind: 'ACTIVIDAD' },
  { id: 'd', name: 'D', duration: 2, kind: 'ACTIVIDAD' },
]

const VINCULOS: Dependency[] = [
  { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
  { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
  { predecessorId: 'c', successorId: 'd', type: 'FS', lag: 0 },
]

const FECHAS = new Map<string, { start: IsoDate; finish: IsoDate }>([
  ['a', { start: '2026-06-01', finish: '2026-06-03' }],
  ['b', { start: '2026-06-04', finish: '2026-06-05' }],
  ['c', { start: '2026-06-08', finish: '2026-06-09' }],
  ['d', { start: '2026-06-22', finish: '2026-06-23' }],
])

function mover(id: string, start: string, sobre: Partial<Parameters<typeof reprogramarDesde>[0]> = {}) {
  return reprogramarDesde({
    tasks: TAREAS,
    dependencies: VINCULOS,
    calendar,
    fechas: FECHAS,
    movida: { id, start: start as IsoDate },
    ...sobre,
  })
}

function comoMapa(r: ReturnType<typeof reprogramarDesde>) {
  return Object.fromEntries(r.cambios.map((c) => [c.id, `${c.hasta.start}→${c.hasta.finish}`]))
}

describe('La línea arrastrada va exactamente donde se suelta', () => {
  it('aunque sus predecesoras pidieran otra cosa', () => {
    // Se arrastra `c` **antes** de que `b` termine. Es una decisión explícita de quien la movió, y
    // el plan lo refleja en vez de corregirla por la espalda.
    const r = mover('c', '2026-06-04')
    expect(comoMapa(r).c).toBe('2026-06-04→2026-06-05')
  })

  it('y queda marcada como la arrastrada', () => {
    const r = mover('c', '2026-06-15')
    expect(r.cambios.find((x) => x.id === 'c')?.arrastrada).toBe(true)
    expect(r.cambios.filter((x) => x.arrastrada)).toHaveLength(1)
  })

  it('conserva su duración en días hábiles', () => {
    // `c` dura dos días; soltarla en viernes la lleva al lunes siguiente, no la alarga.
    const r = mover('c', '2026-06-05')
    expect(comoMapa(r).c).toBe('2026-06-05→2026-06-08')
  })
})

describe('La cascada sólo empuja', () => {
  it('mover una línea hacia delante empuja a la sucesora que queda en falso', () => {
    // `b` va al 15-jun; `c` estaba el 08 y ya no cabe, así que se empuja al 17.
    const r = mover('b', '2026-06-15')
    const mapa = comoMapa(r)
    expect(mapa.b).toBe('2026-06-15→2026-06-16')
    expect(mapa.c).toBe('2026-06-17→2026-06-18')
  })

  it('una sucesora con holgura NO se mueve', () => {
    // Es la regla que hace que esto sirva en un plan negociado: `d` tenía dos semanas de margen y
    // se queda donde estaba. Tirar de ella sería reprogramar a espaldas de quien lo acordó.
    const r = mover('b', '2026-06-15')
    expect(r.cambios.map((c) => c.id)).not.toContain('d')
  })

  it('pero si el empujón se la come, sí se mueve', () => {
    // `b` al 07-jul: `c` va al 09, y `d` —que estaba el 22-jun— ya no cabe.
    const r = mover('b', '2026-07-07')
    expect(r.cambios.map((c) => c.id).sort()).toEqual(['b', 'c', 'd'])
  })

  it('mover una línea hacia atrás no adelanta a nadie', () => {
    // `b` al 02-jun. `c` podría empezar el 04, pero tenía el 08 negociado: se queda.
    const r = mover('b', '2026-06-02')
    expect(r.cambios.map((c) => c.id)).toEqual(['b'])
    expect(r.empujadas).toBe(0)
  })

  it('cuenta cuántas empujó, sin contar la arrastrada', () => {
    const r = mover('a', '2026-07-01')
    expect(r.empujadas).toBe(r.cambios.length - 1)
  })
})

describe('El cierre del plan, que es la cifra que importa', () => {
  it('empujar dentro de la holgura no mueve el cierre', () => {
    const r = mover('b', '2026-06-15')
    expect(r.cierreAntes).toBe(r.cierreDespues)
  })

  it('empujar más allá de la holgura sí lo mueve, y lo dice', () => {
    const r = mover('b', '2026-07-07')
    expect(r.cierreDespues > r.cierreAntes).toBe(true)
  })

  it('mover hacia atrás no adelanta el cierre', () => {
    const r = mover('a', '2026-05-25')
    expect(r.cierreDespues).toBe(r.cierreAntes)
  })
})

describe('Los cuatro tipos de vínculo', () => {
  const conTipo = (type: Dependency['type'], lag = 0) =>
    reprogramarDesde({
      tasks: [TAREAS[0], TAREAS[1]],
      dependencies: [{ predecessorId: 'a', successorId: 'b', type, lag }],
      calendar,
      fechas: new Map([
        ['a', { start: '2026-06-01' as IsoDate, finish: '2026-06-03' as IsoDate }],
        ['b', { start: '2026-06-04' as IsoDate, finish: '2026-06-05' as IsoDate }],
      ]),
      movida: { id: 'a', start: '2026-06-15' as IsoDate },
    })

  it('FS empuja al día hábil siguiente al fin', () => {
    // `a` al 15-jun termina el 17; `b` arranca el 18.
    expect(comoMapa(conTipo('FS')).b).toBe('2026-06-18→2026-06-19')
  })

  it('SS empuja al mismo arranque', () => {
    expect(comoMapa(conTipo('SS')).b).toBe('2026-06-15→2026-06-16')
  })

  it('FF alinea los finales', () => {
    // `a` termina el 17; `b` dura dos días, así que arranca el 16 para terminar el 17.
    expect(comoMapa(conTipo('FF')).b).toBe('2026-06-16→2026-06-17')
  })

  it('el desfase positivo separa', () => {
    // FS con tres días de espera: del 18 al 23 (el fin de semana no cuenta).
    expect(comoMapa(conTipo('FS', 3)).b).toBe('2026-06-23→2026-06-24')
  })

  it('el desfase negativo solapa', () => {
    expect(comoMapa(conTipo('FS', -1)).b).toBe('2026-06-17→2026-06-18')
  })
})

describe('Los hitos', () => {
  it('un hito no gana duración al moverse', () => {
    const conHito: PlanTask[] = [
      { id: 'h', name: 'Hito', duration: 0, kind: 'HITO' },
      { id: 's', name: 'Después', duration: 2, kind: 'ACTIVIDAD' },
    ]
    const r = reprogramarDesde({
      tasks: conHito,
      dependencies: [{ predecessorId: 'h', successorId: 's', type: 'FS', lag: 0 }],
      calendar,
      fechas: new Map([
        ['h', { start: '2026-06-05' as IsoDate, finish: '2026-06-05' as IsoDate }],
        ['s', { start: '2026-06-08' as IsoDate, finish: '2026-06-09' as IsoDate }],
      ]),
      movida: { id: 'h', start: '2026-06-12' as IsoDate },
    })
    const mapa = comoMapa(r)
    expect(mapa.h).toBe('2026-06-12→2026-06-12')
    expect(mapa.s).toBe('2026-06-15→2026-06-16')
  })
})

describe('Casos que no deben romper nada', () => {
  it('soltar una línea donde ya estaba no produce cambios', () => {
    expect(mover('c', '2026-06-08').cambios).toEqual([])
  })

  it('una línea sin sucesoras se mueve sola', () => {
    const r = mover('d', '2026-07-01')
    expect(r.cambios.map((c) => c.id)).toEqual(['d'])
  })

  it('un id que no existe no revienta', () => {
    expect(mover('fantasma', '2026-06-15').cambios).toEqual([])
  })

  it('un ciclo entre líneas termina en vez de girar para siempre', () => {
    const r = reprogramarDesde({
      tasks: [TAREAS[0], TAREAS[1]],
      dependencies: [
        { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
        { predecessorId: 'b', successorId: 'a', type: 'FS', lag: 0 },
      ],
      calendar,
      fechas: new Map([
        ['a', { start: '2026-06-01' as IsoDate, finish: '2026-06-03' as IsoDate }],
        ['b', { start: '2026-06-04' as IsoDate, finish: '2026-06-05' as IsoDate }],
      ]),
      movida: { id: 'a', start: '2026-06-08' as IsoDate },
    })
    // Lo único que se exige es que termine: un ciclo no debería existir, pero si la base lo tiene,
    // arrastrar una barra no puede colgar el navegador.
    expect(Array.isArray(r.cambios)).toBe(true)
  })

  it('los festivos del proyecto se respetan al empujar', () => {
    const conFestivos = createWorkCalendar({ holidays: ['2026-06-18', '2026-06-19'] })
    const r = reprogramarDesde({
      tasks: [TAREAS[0], TAREAS[1]],
      dependencies: [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }],
      calendar: conFestivos,
      fechas: new Map([
        ['a', { start: '2026-06-01' as IsoDate, finish: '2026-06-03' as IsoDate }],
        ['b', { start: '2026-06-04' as IsoDate, finish: '2026-06-05' as IsoDate }],
      ]),
      movida: { id: 'a', start: '2026-06-15' as IsoDate },
    })
    // `a` del 15 al 17; con el 18 y el 19 festivos, `b` salta al lunes 22.
    expect(comoMapa(r).b).toBe('2026-06-22→2026-06-23')
  })
})

describe('Rendimiento', () => {
  it('el plan real completo se reprograma en un abrir y cerrar de ojos', () => {
    const muchas: PlanTask[] = Array.from({ length: 1368 }, (_, i) => ({
      id: `t${i}`,
      name: `T${i}`,
      duration: 2,
      kind: 'ACTIVIDAD',
    }))
    const cadena: Dependency[] = Array.from({ length: 1367 }, (_, i) => ({
      predecessorId: `t${i}`,
      successorId: `t${i + 1}`,
      type: 'FS' as const,
      lag: 0,
    }))
    const fechas = new Map(
      muchas.map((t, i) => [
        t.id,
        {
          start: toIso(2026, 6, 1, i * 2),
          finish: toIso(2026, 6, 1, i * 2 + 1),
        },
      ]),
    )

    const arranque = performance.now()
    // Se mueve la primera: el peor caso, porque empuja las 1 367 restantes.
    const r = reprogramarDesde({
      tasks: muchas,
      dependencies: cadena,
      calendar,
      fechas,
      movida: { id: 't0', start: '2027-01-04' as IsoDate },
    })
    const tardanza = performance.now() - arranque

    expect(r.cambios.length).toBeGreaterThan(1000)
    expect(tardanza).toBeLessThan(500)
  })
})

/** Una fecha civil desplazada N días naturales, para armar el plan de la prueba de carga. */
function toIso(anio: number, mes: number, dia: number, mas: number): IsoDate {
  const d = new Date(Date.UTC(anio, mes - 1, dia + mas))
  return d.toISOString().slice(0, 10) as IsoDate
}

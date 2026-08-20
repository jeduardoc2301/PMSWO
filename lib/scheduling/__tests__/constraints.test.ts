import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import { RESTRICCIONES } from '../restricciones'
import { schedulePlan } from '../schedule'
import type { Constraint, Dependency, PlanTask } from '../types'

/**
 * Las restricciones de fecha del §3.4.
 *
 * El spec enumera ocho y las divide por flexibilidad. La división que importa al construirlas es
 * otra: **cuáles mueven la tarea y cuáles solo comprometen**.
 *
 * - Mueven: `SNET` (no antes de), `MSO` (debe empezar el), `FNET` (no termina antes de).
 * - Comprometen: `MFO` (debe terminar el), `SNLT` (no empieza después de), `FNLT` (no termina
 *   después de). Estas **no tocan** la programación: bajan el techo de la fecha tardía, y si la
 *   cadena lleva la tarea más allá, sale con holgura negativa.
 *
 * Confundir las dos familias es el error que produce planes que se cumplen en el papel: una
 * promesa que adelanta la tarea para cuadrar consigo misma no es una promesa, es una cuenta que
 * sale porque la hicimos salir.
 *
 * `ASAP` es la ausencia de restricción y `ALAP` es un modo de programación, no una fecha: ninguna
 * de las dos se guarda como restricción y por eso no están aquí.
 */

const CAL = createWorkCalendar()
/** Marzo de 2027 empieza en lunes, así que los días de estas pruebas son fáciles de seguir. */
const INICIO = '2027-03-01'

function tarea(id: string, duration: number, constraint?: Constraint, extra: Partial<PlanTask> = {}): PlanTask {
  return { id, name: id, duration, ...(constraint ? { constraint } : {}), ...extra } as PlanTask
}

function programar(tasks: PlanTask[], dependencies: Dependency[] = []) {
  return schedulePlan({ tasks, dependencies, calendar: CAL, start: INICIO })
}

function analizar(tasks: PlanTask[], dependencies: Dependency[] = []) {
  return analyzeCriticalPath(programar(tasks, dependencies))
}

describe('Las que mueven la tarea', () => {
  it('SNET · no antes de: empieza en la fecha, no antes', () => {
    const s = programar([tarea('t', 3, { type: 'NO_ANTES_DE', date: '2027-03-08' })])
    expect(s.byId.get('t')!.start).toBe('2027-03-08')
  })

  it('SNET no adelanta a quien ya iba más tarde', () => {
    // La cadena manda cuando pide más que la restricción: la restricción es un suelo, no un ancla.
    const s = programar(
      [tarea('empuja', 10), tarea('t', 2, { type: 'NO_ANTES_DE', date: '2027-03-02' })],
      [{ predecessorId: 'empuja', successorId: 't', type: 'FS', lag: 0 }],
    )
    expect(s.byId.get('t')!.start).toBe('2027-03-15')
  })

  it('MSO · debe empezar el: manda sobre la cadena, para adelante y para atrás', () => {
    const s = programar(
      [tarea('empuja', 10), tarea('t', 2, { type: 'DEBE_EMPEZAR_EL', date: '2027-03-03' })],
      [{ predecessorId: 'empuja', successorId: 't', type: 'FS', lag: 0 }],
    )
    expect(s.byId.get('t')!.start).toBe('2027-03-03')
  })

  it('FNET · no termina antes de: amarra el FIN, así que retrocede el arranque', () => {
    // Una tarea de cinco días que no puede terminar antes del viernes 12 empieza el lunes 8. Es la
    // restricción de lo que no sirve antes de tiempo: una entrega que el cliente no puede recibir
    // hasta que abra su ventana de cambios.
    const s = programar([tarea('t', 5, { type: 'NO_TERMINA_ANTES_DE', date: '2027-03-12' })])
    expect(s.byId.get('t')!.finish).toBe('2027-03-12')
    expect(s.byId.get('t')!.start).toBe('2027-03-08')
  })

  it('FNET no adelanta a quien ya terminaba más tarde', () => {
    const s = programar([tarea('t', 20, { type: 'NO_TERMINA_ANTES_DE', date: '2027-03-03' })])
    expect(s.byId.get('t')!.start).toBe('2027-03-01')
  })
})

describe('Las que solo comprometen', () => {
  /** Una cadena que empuja la línea comprometida al 8 de marzo. */
  const CON_CADENA = (c: Constraint): PlanTask[] => [
    tarea('empuja', 5),
    tarea('prometida', 2, c),
    tarea('ancla', 40),
  ]
  const DEPS: Dependency[] = [{ predecessorId: 'empuja', successorId: 'prometida', type: 'FS', lag: 0 }]

  it('MFO · debe terminar el: NO mueve la tarea', () => {
    const s = programar(CON_CADENA({ type: 'DEBE_TERMINAR_EL', date: '2027-03-03' }), DEPS)
    expect(s.byId.get('prometida')!.start).toBe('2027-03-08')
  })

  it('MFO deja holgura negativa: es el aviso', () => {
    const a = analizar(CON_CADENA({ type: 'DEBE_TERMINAR_EL', date: '2027-03-03' }), DEPS)
    expect(a.byId.get('prometida')!.totalFloat).toBeLessThan(0)
  })

  it('SNLT · no empieza después de: tampoco mueve la tarea', () => {
    const s = programar(CON_CADENA({ type: 'NO_EMPIEZA_DESPUES_DE', date: '2027-03-03' }), DEPS)
    expect(s.byId.get('prometida')!.start).toBe('2027-03-08')
  })

  it('SNLT deja holgura negativa, contada desde el ARRANQUE prometido', () => {
    // Prometía empezar el miércoles 3 y empieza el lunes 8: son tres días hábiles de deuda.
    const a = analizar(CON_CADENA({ type: 'NO_EMPIEZA_DESPUES_DE', date: '2027-03-03' }), DEPS)
    expect(a.byId.get('prometida')!.totalFloat).toBe(-3)
  })

  it('FNLT · no termina después de: se comporta igual que una fecha comprometida', () => {
    const conRestriccion = analizar(CON_CADENA({ type: 'NO_TERMINA_DESPUES_DE', date: '2027-03-05' }), DEPS)
    const conDueDate = analizar(
      [tarea('empuja', 5), tarea('prometida', 2, undefined, { dueDate: '2027-03-05' }), tarea('ancla', 40)],
      DEPS,
    )
    expect(conRestriccion.byId.get('prometida')!.totalFloat).toBe(
      conDueDate.byId.get('prometida')!.totalFloat,
    )
  })

  it('una promesa que se cumple no estorba', () => {
    const a = analizar(CON_CADENA({ type: 'DEBE_TERMINAR_EL', date: '2027-12-31' }), DEPS)
    expect(a.byId.get('prometida')!.totalFloat).toBeGreaterThan(0)
  })
})

describe('Las dos familias no se confunden', () => {
  it('las que comprometen dan EXACTAMENTE la misma programación que sin restricción', () => {
    // Es la garantía entera: una promesa no cambia cuándo ocurren las cosas, solo cuánto margen
    // dicen tener. Confundirlo produce planes que se cumplen porque los hicimos cumplir.
    const sin = programar([tarea('a', 4), tarea('b', 3)], [
      { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
    ])
    for (const c of [
      { type: 'DEBE_TERMINAR_EL' as const, date: '2027-03-02' },
      { type: 'NO_EMPIEZA_DESPUES_DE' as const, date: '2027-03-02' },
      { type: 'NO_TERMINA_DESPUES_DE' as const, date: '2027-03-02' },
    ]) {
      const con = programar([tarea('a', 4), tarea('b', 3, c)], [
        { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
      ])
      expect(con.byId.get('b')!.start).toBe(sin.byId.get('b')!.start)
      expect(con.byId.get('b')!.finish).toBe(sin.byId.get('b')!.finish)
    }
  })

  it('las que empujan SÍ cambian la programación', () => {
    const sin = programar([tarea('t', 3)])
    for (const c of [
      { type: 'NO_ANTES_DE' as const, date: '2027-03-10' },
      { type: 'DEBE_EMPEZAR_EL' as const, date: '2027-03-10' },
      { type: 'NO_TERMINA_ANTES_DE' as const, date: '2027-03-15' },
    ]) {
      expect(programar([tarea('t', 3, c)]).byId.get('t')!.start).not.toBe(sin.byId.get('t')!.start)
    }
  })
})

describe('§3.3 · MSO no puede empezar el plan antes que el plan', () => {
  /**
   * `DEBE_EMPEZAR_EL` es la única que pisa hacia atrás, y eso es lo que promete. Lo que no puede
   * pisar es el arranque del plan: el §3.3 acota el inicio temprano «por Project.Start,
   * restricciones y calendario», **en ese orden**.
   *
   * Sin suelo, un plan que arranca el 2027-03-01 con una línea clavada un mes antes devolvía esa
   * fecha como su primer día. Un plan que empieza antes que él mismo.
   */
  it('la línea se queda en el arranque, no debajo', () => {
    const plan = programar([tarea('Z', 2, { type: 'DEBE_EMPEZAR_EL', date: '2027-02-01' })])
    expect(plan.start).toBe('2027-03-01')
    expect(plan.byId.get('Z')!.start).toBe('2027-03-01')
  })

  it('por encima del arranque manda la restricción, como siempre', () => {
    // `Schedule.start` es el primer día TRABAJADO del plan, no la fecha pedida: con una sola línea
    // clavada más tarde, el plan empieza cuando ella. Lo que el suelo impide es que empiece ANTES.
    const plan = programar([tarea('Z', 2, { type: 'DEBE_EMPEZAR_EL', date: '2027-03-15' })])
    expect(plan.byId.get('Z')!.start).toBe('2027-03-15')
    expect(plan.start).toBe('2027-03-15')
  })

  it('y sigue pisando a su predecesora, que es lo que MSO significa', () => {
    const plan = programar(
      [tarea('A', 5), tarea('B', 2, { type: 'DEBE_EMPEZAR_EL', date: '2027-03-01' })],
      [{ predecessorId: 'A', successorId: 'B', type: 'FS', lag: 0 }],
    )
    expect(plan.byId.get('B')!.start).toBe('2027-03-01')
    // El pase atrás se lo cobra a la predecesora: es la señal honesta de que el vínculo no cabe.
    expect(analizar(
      [tarea('A', 5), tarea('B', 2, { type: 'DEBE_EMPEZAR_EL', date: '2027-03-01' })],
      [{ predecessorId: 'A', successorId: 'B', type: 'FS', lag: 0 }],
    ).byId.get('A')!.totalFloat).toBeLessThan(0)
  })
})

describe('§3.4 · las ocho restricciones caben en su columna', () => {
  /**
   * Estaban declaradas, ofrecidas en el diálogo y probadas en memoria — y **dos de las ocho no se
   * podían guardar**: `NO_TERMINA_DESPUES_DE` y `NO_EMPIEZA_DESPUES_DE` miden 21 caracteres y la
   * columna era `VARCHAR(20)`. MySQL las rechazaba con P2000, y ninguna prueba lo veía porque
   * ninguna escribía en la base.
   *
   * Esta comprueba lo único que se puede comprobar sin base: que el código quepa en el ancho que el
   * esquema declara. Si alguien añade una novena con un nombre largo, se pone roja aquí en vez de
   * fallar en producción al pulsar «Guardar».
   */
  const ANCHO_DE_LA_COLUMNA = 24

  it('ninguna pasa del ancho declarado en el esquema', () => {
    const largas = RESTRICCIONES.filter((r) => r.codigo.length > ANCHO_DE_LA_COLUMNA)
    expect(largas.map((r) => `${r.codigo} (${r.codigo.length})`)).toEqual([])
  })

  it('y las dos que reventaban siguen estando: no se arregló acortándoles el nombre', () => {
    const codigos = RESTRICCIONES.map((r) => r.codigo)
    expect(codigos).toContain('NO_TERMINA_DESPUES_DE')
    expect(codigos).toContain('NO_EMPIEZA_DESPUES_DE')
  })

  it('son ocho, que es lo que pide el §3.4', () => {
    expect(RESTRICCIONES).toHaveLength(8)
  })
})

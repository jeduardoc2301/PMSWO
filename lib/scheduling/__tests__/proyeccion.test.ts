import { describe, expect, it } from 'vitest'

import { programarConALAP } from '../alap'
import { createWorkCalendar } from '../calendar'
import { proyectarCierre } from '../proyeccion'
import type { Dependency, PlanTask } from '../types'

/**
 * La fecha de cierre proyectada.
 *
 * Existe porque el motor, preguntado a secas, contesta siempre que el plan cierra en la fecha
 * comprometida: cada línea está anclada en su fecha guardada y el pase adelante no mira el avance
 * ni sabe qué día es hoy. El primer caso de esta suite demuestra ese comportamiento a propósito
 * —es el motivo de que este módulo exista— y el resto comprueba que la proyección sí se mueve.
 */

const CAL = createWorkCalendar()
const LUNES = '2026-06-01'

function tarea(id: string, duration: number, extra: Partial<PlanTask> = {}): PlanTask {
  return { id, name: id, duration, ...extra } as PlanTask
}

function anclada(id: string, duration: number, fecha: string, extra: Partial<PlanTask> = {}): PlanTask {
  // Así llegan las líneas desde `loadProjectPlan`: cada una clavada en su fecha negociada.
  return tarea(id, duration, { constraint: { type: 'NO_ANTES_DE', date: fecha }, ...extra })
}

function programar(tasks: PlanTask[], dependencies: Dependency[] = []) {
  return programarConALAP({ tasks, dependencies, calendar: CAL, start: LUNES })
}

function proyectar(
  tasks: PlanTask[],
  hoy: string,
  avances: Record<string, number> = {},
  estados: Record<string, string> = {},
  dependencies: Dependency[] = [],
  compromiso?: string
) {
  const base = programar(tasks, dependencies)
  return proyectarCierre({
    tasks,
    dependencies,
    calendar: CAL,
    start: LUNES,
    base,
    hoy,
    avance: new Map(Object.entries(avances)),
    estado: new Map(Object.entries(estados)),
    compromiso,
  })
}

describe('el problema que este módulo resuelve', () => {
  it('el plan anclado cierra en su fecha aunque nada haya avanzado', () => {
    // Esto NO es un defecto del motor: es lo que significa un plan armado hacia atrás desde una
    // fecha comprometida. Pero publicar ese cierre como respuesta a «¿llegamos?» es decirle al
    // comité que se va en fecha mientras el proyecto arrastra meses de deuda.
    const tasks = [anclada('a', 5, '2026-06-01'), anclada('b', 5, '2026-06-08')]
    const base = programar(tasks)
    expect(base.finish).toBe('2026-06-12')

    // Tres meses después, con cero avance, el motor sigue diciendo lo mismo.
    const otraVez = programar(tasks)
    expect(otraVez.finish).toBe(base.finish)
  })

  it('la proyección sí se mueve cuando nada arrancó', () => {
    const tasks = [anclada('a', 5, '2026-06-01'), anclada('b', 5, '2026-06-08')]
    const p = proyectar(tasks, '2026-09-01')

    expect(p.cierreDelPlan).toBe('2026-06-12')
    expect(p.cierreProyectado > p.cierreDelPlan).toBe(true)
    expect(p.corrimientoDiasHabiles).toBeGreaterThan(0)
    expect(p.lineasReancladas).toBe(2)
  })
})

describe('qué se reancla y qué no', () => {
  it('no toca lo que ya está al 100 %', () => {
    const tasks = [anclada('hecha', 5, '2026-06-01'), anclada('abierta', 5, '2026-06-08')]
    const p = proyectar(tasks, '2026-09-01', { hecha: 1 })
    expect(p.lineasReancladas).toBe(1)
  })

  it('no toca lo que está en estado terminal', () => {
    const tasks = [anclada('cerrada', 5, '2026-06-01'), anclada('abierta', 5, '2026-06-08')]
    const p = proyectar(tasks, '2026-09-01', {}, { cerrada: 'DONE' })
    expect(p.lineasReancladas).toBe(1)
  })

  it('no toca lo que todavía no debía haber arrancado', () => {
    // Adelantar o atrasar lo que arranca en el futuro sería inventar información que no tenemos.
    const tasks = [anclada('futura', 5, '2026-12-01')]
    const p = proyectar(tasks, '2026-09-01')
    expect(p.lineasReancladas).toBe(0)
    expect(p.cierreProyectado).toBe(p.cierreDelPlan)
  })

  it('no mueve nada cuando el plan va al día', () => {
    const tasks = [anclada('a', 5, '2026-06-01')]
    const p = proyectar(tasks, '2026-06-01')
    expect(p.corrimientoDiasHabiles).toBe(0)
    expect(p.enDeuda).toBe(false)
  })
})

describe('el avance parcial se descuenta', () => {
  it('una línea a la mitad se reprograma con la mitad de su duración', () => {
    // Sin esto la proyección castigaría dos veces el trabajo ya hecho: primero por estar atrasada
    // y otra vez por reprogramarla entera.
    const conAvance = proyectar([anclada('a', 10, '2026-06-01')], '2026-09-01', { a: 0.5 })
    const sinAvance = proyectar([anclada('a', 10, '2026-06-01')], '2026-09-01', { a: 0 })
    expect(conAvance.cierreProyectado < sinAvance.cierreProyectado).toBe(true)
  })

  it('un hito sigue siendo un hito: duración cero', () => {
    // Redondear hacia arriba con un mínimo de uno convertiría el hito en un día de trabajo, y un
    // hito no es trabajo: es una fecha.
    const p = proyectar([anclada('hito', 0, '2026-06-01', { kind: 'HITO' })], '2026-09-01')
    expect(p.cierreProyectado).toBe('2026-09-01')
  })

  it('una línea casi terminada todavía consume al menos un día', () => {
    // Bajar a cero la haría desaparecer del pase adelante, y una línea abierta ocupa calendario.
    const p = proyectar([anclada('a', 10, '2026-06-01')], '2026-09-01', { a: 0.99 })
    expect(p.cierreProyectado >= '2026-09-01').toBe(true)
  })
})

describe('la cadena se arrastra', () => {
  it('reanclar la primera empuja a su sucesora más allá del piso de hoy', () => {
    const tasks = [anclada('a', 5, '2026-06-01'), tarea('b', 5)]
    const deps: Dependency[] = [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }]
    const p = proyectar(tasks, '2026-09-01', {}, {}, deps)

    // Las dos se reanclan: `b` también estaba programada en el pasado, así que ella tampoco pudo
    // haber arrancado. Pero el reanclaje es un PISO, no una fecha fija —«no antes de hoy»—, así
    // que la dependencia sigue mandando y `b` cae después de que `a` termine, no el mismo día.
    expect(p.lineasReancladas).toBe(2)

    const proyectado = programarConALAP({
      tasks: tasks.map((t) =>
        t.id === 'a'
          ? { ...t, constraint: { type: 'NO_ANTES_DE' as const, date: '2026-09-01' } }
          : { ...t, constraint: { type: 'NO_ANTES_DE' as const, date: '2026-09-01' } }
      ),
      dependencies: deps,
      calendar: CAL,
      start: LUNES,
    })
    expect(proyectado.byId.get('b')!.start > proyectado.byId.get('a')!.finish).toBe(true)
    expect(p.cierreProyectado > p.cierreDelPlan).toBe(true)
  })
})

describe('el margen contra el compromiso', () => {
  it('es negativo cuando la proyección se pasa de la fecha', () => {
    const p = proyectar([anclada('a', 5, '2026-06-01')], '2026-09-01', {}, {}, [], '2026-06-30')
    expect(p.compromiso).toBe('2026-06-30')
    expect(p.margenProyectadoDiasHabiles).toBeLessThan(0)
    expect(p.enDeuda).toBe(true)
  })

  it('es nulo cuando no hay compromiso contra el cual medir', () => {
    const p = proyectar([anclada('a', 5, '2026-06-01')], '2026-09-01')
    expect(p.margenProyectadoDiasHabiles).toBeNull()
    expect(p.enDeuda).toBe(false)
  })

  it('no se declara deuda cuando la proyección todavía cabe', () => {
    const p = proyectar([anclada('a', 5, '2026-06-01')], '2026-06-01', {}, {}, [], '2026-12-31')
    expect(p.enDeuda).toBe(false)
    expect(p.margenProyectadoDiasHabiles).toBeGreaterThan(0)
  })
})

describe('el corrimiento', () => {
  it('nunca es negativo', () => {
    // Una proyección que cerrara ANTES que el plan capturado sería un artefacto del reanclaje, no
    // una buena noticia. Se acota en cero para no publicar «recuperamos tiempo» sin fundamento.
    const p = proyectar([anclada('a', 5, '2026-06-08')], '2026-06-01')
    expect(p.corrimientoDiasHabiles).toBeGreaterThanOrEqual(0)
  })
})

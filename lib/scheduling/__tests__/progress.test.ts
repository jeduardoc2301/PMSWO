import { describe, expect, it } from 'vitest'

import { HierarchyError, parentsFromLevels, rollUpProgress } from '../progress'
import type { PlanTask } from '../types'

function hoja(id: string, name: string, duration: number, progress = 0, parentId?: string): PlanTask {
  return { id, name, duration, progress, ...(parentId ? { parentId } : {}) }
}

function resumen(id: string, name: string, parentId?: string): PlanTask {
  return { id, name, duration: 0, kind: 'RESUMEN', ...(parentId ? { parentId } : {}) }
}

/**
 * Prueba de aceptación de C7.
 *
 * Dos ramas con el mismo trabajo y distinto lapso pesan igual. Es el caso que separa ponderar por
 * trabajo de ponderar por duración: la rama estirada abarca mucho más calendario, y aun así no
 * cuenta ni un gramo más.
 */
describe('C7 · Dos ramas con el mismo trabajo y distinto lapso pesan igual', () => {
  /**
   * «Concentrada» son tres tareas de cuatro días pegadas: doce días de trabajo en doce días de
   * calendario. «Estirada» son tres tareas de cuatro días separadas por meses de espera: los mismos
   * doce días de trabajo repartidos sobre un lapso mucho mayor.
   *
   * Ponderado por duración del resumen, la estirada pesaría varias veces más. Ponderado por trabajo,
   * pesan lo mismo.
   */
  const tareas: PlanTask[] = [
    resumen('concentrada', 'Bloque concentrado'),
    hoja('c1', 'Concentrada 1', 4, 1, 'concentrada'),
    hoja('c2', 'Concentrada 2', 4, 1, 'concentrada'),
    hoja('c3', 'Concentrada 3', 4, 1, 'concentrada'),

    resumen('estirada', 'Bloque estirado'),
    hoja('e1', 'Estirada 1', 4, 0, 'estirada'),
    hoja('e2', 'Estirada 2', 4, 0, 'estirada'),
    hoja('e3', 'Estirada 3', 4, 0, 'estirada'),
  ]

  const rollup = rollUpProgress(tareas)

  it('las dos ramas pesan exactamente lo mismo', () => {
    expect(rollup.byId.get('concentrada')!.weight).toBe(12)
    expect(rollup.byId.get('estirada')!.weight).toBe(12)
  })

  it('una terminada y la otra sin empezar dan la mitad del plan, no otra cosa', () => {
    expect(rollup.byId.get('concentrada')!.progress).toBe(1)
    expect(rollup.byId.get('estirada')!.progress).toBe(0)
    expect(rollup.progress).toBe(0.5)
  })

  it('el peso del plan es el trabajo total, no el calendario', () => {
    expect(rollup.totalWeight).toBe(24)
    expect(rollup.earnedDays).toBe(12)
  })
})

describe('El peso es la suma de los días hábiles de las hojas', () => {
  it('una hoja pesa lo que dura', () => {
    const rollup = rollUpProgress([hoja('a', 'Una tarea de cinco días', 5)])
    expect(rollup.byId.get('a')!.weight).toBe(5)
  })

  it('un hito no pesa: marca un momento, no consume trabajo', () => {
    const rollup = rollUpProgress([hoja('h', 'HITO · Ambiente listo', 0)])
    expect(rollup.byId.get('h')!.weight).toBe(0)
  })

  it('un resumen pesa lo que pesan sus hijas, no lo que dura él', () => {
    const tareas: PlanTask[] = [
      { ...resumen('bloque', 'Bloque'), duration: 90 }, // su duración es el lapso: se ignora
      hoja('a', 'Una', 3, 0, 'bloque'),
      hoja('b', 'Otra', 7, 0, 'bloque'),
    ]
    expect(rollUpProgress(tareas).byId.get('bloque')!.weight).toBe(10)
  })

  it('el peso sube por toda la jerarquía, nivel por nivel', () => {
    const tareas: PlanTask[] = [
      resumen('etapa', 'Etapa'),
      resumen('fase', 'Fase', 'etapa'),
      resumen('bloque', 'Bloque', 'fase'),
      hoja('a', 'Hoja', 6, 0, 'bloque'),
      hoja('b', 'Otra hoja', 4, 0, 'bloque'),
    ]
    const rollup = rollUpProgress(tareas)

    expect(rollup.byId.get('bloque')!.weight).toBe(10)
    expect(rollup.byId.get('fase')!.weight).toBe(10)
    expect(rollup.byId.get('etapa')!.weight).toBe(10)
    expect(rollup.byId.get('etapa')!.depth).toBe(0)
    expect(rollup.byId.get('a')!.depth).toBe(3)
  })
})

describe('El avance se pondera, no se promedia', () => {
  it('una hoja larga terminada pesa más que una corta sin empezar', () => {
    const tareas: PlanTask[] = [
      resumen('bloque', 'Bloque'),
      hoja('larga', 'Larga', 9, 1, 'bloque'),
      hoja('corta', 'Corta', 1, 0, 'bloque'),
    ]
    const rollup = rollUpProgress(tareas)

    // Promediado a lo tonto daría 0.5. Ponderado por trabajo, 9 de 10 días.
    expect(rollup.byId.get('bloque')!.progress).toBe(0.9)
    expect(rollup.byId.get('bloque')!.earnedDays).toBe(9)
  })

  it('el avance parcial de una hoja cuenta en proporción', () => {
    const tareas: PlanTask[] = [
      resumen('bloque', 'Bloque'),
      hoja('a', 'Una', 10, 0.5, 'bloque'),
      hoja('b', 'Otra', 10, 0, 'bloque'),
    ]
    expect(rollUpProgress(tareas).byId.get('bloque')!.progress).toBe(0.25)
  })

  it('un resumen no tiene avance propio: el que declare se ignora', () => {
    const tareas: PlanTask[] = [
      { ...resumen('bloque', 'Bloque'), progress: 1 },
      hoja('a', 'Sin empezar', 5, 0, 'bloque'),
    ]
    expect(rollUpProgress(tareas).byId.get('bloque')!.progress).toBe(0)
  })

  it('un bloque que solo agrupa hitos no se puede ponderar, y se promedia', () => {
    const tareas: PlanTask[] = [
      resumen('bloque', 'Puntos de control'),
      hoja('h1', 'HITO uno', 0, 1, 'bloque'),
      hoja('h2', 'HITO dos', 0, 1, 'bloque'),
      hoja('h3', 'HITO tres', 0, 0, 'bloque'),
    ]
    const rollup = rollUpProgress(tareas)

    expect(rollup.byId.get('bloque')!.weight).toBe(0)
    expect(rollup.byId.get('bloque')!.progress).toBeCloseTo(2 / 3, 10)
  })

  it('un plan sin trabajo no divide entre cero', () => {
    const rollup = rollUpProgress([hoja('h', 'HITO único', 0, 1)])
    expect(rollup.totalWeight).toBe(0)
    expect(rollup.progress).toBe(1)
  })
})

describe('Estructura de la jerarquía', () => {
  const tareas: PlanTask[] = [
    resumen('raiz', 'Raíz'),
    hoja('a', 'Hija', 2, 0, 'raiz'),
    hoja('b', 'Otra hija', 3, 0, 'raiz'),
    hoja('suelta', 'Sin padre', 1),
  ]
  const rollup = rollUpProgress(tareas)

  it('distingue resumen de hoja por si algo cuelga, no por lo declarado', () => {
    expect(rollup.byId.get('raiz')!.isSummary).toBe(true)
    expect(rollup.byId.get('a')!.isSummary).toBe(false)
    expect(rollup.byId.get('suelta')!.isSummary).toBe(false)
  })

  it('nombra las hijas de cada resumen', () => {
    expect(rollup.byId.get('raiz')!.children).toEqual(['a', 'b'])
  })

  it('las líneas sin padre son raíces', () => {
    expect(rollup.roots).toEqual(['raiz', 'suelta'])
  })
})

describe('Lo que la jerarquía rechaza', () => {
  it('colgar de una línea que no existe', () => {
    expect(() => rollUpProgress([hoja('a', 'Huérfana', 1, 0, 'fantasma')])).toThrow(
      /«Huérfana» cuelga de «fantasma», que no está en el plan/,
    )
  })

  it('colgar de sí misma', () => {
    expect(() => rollUpProgress([{ id: 'a', name: 'Uróboros', duration: 1, parentId: 'a' }])).toThrow(
      /cuelga de sí misma/,
    )
  })

  it('una jerarquía que se cierra en círculo', () => {
    const tareas: PlanTask[] = [
      { id: 'a', name: 'Alfa', duration: 1, parentId: 'b' },
      { id: 'b', name: 'Beta', duration: 1, parentId: 'a' },
    ]
    expect(() => rollUpProgress(tareas)).toThrow(HierarchyError)
    expect(() => rollUpProgress(tareas)).toThrow(/«Alfa».*«Beta»|«Beta».*«Alfa»/)
  })

  it('identificadores repetidos', () => {
    expect(() => rollUpProgress([hoja('a', 'Una', 1), hoja('a', 'Otra', 1)])).toThrow(/más de una línea/)
  })

  it('un avance fuera de rango, nombrando la línea', () => {
    expect(() => rollUpProgress([hoja('a', 'Imposible', 1, 1.5)])).toThrow(
      /«Imposible» tiene un avance de 1.5/,
    )
    expect(() => rollUpProgress([hoja('a', 'Negativa', 1, -0.1)])).toThrow(/avance va de 0 a 1/)
  })
})

describe('Derivar la jerarquía de una columna de nivel', () => {
  it('el padre es la línea anterior de nivel menor', () => {
    const parents = parentsFromLevels([
      { id: '1', name: 'Etapa', level: 0 },
      { id: '2', name: 'Fase', level: 1 },
      { id: '3', name: 'Tarea', level: 2 },
      { id: '4', name: 'Otra tarea', level: 2 },
      { id: '5', name: 'Otra fase', level: 1 },
      { id: '6', name: 'Su tarea', level: 2 },
    ])

    expect(parents.get('1')).toBeNull()
    expect(parents.get('2')).toBe('1')
    expect(parents.get('3')).toBe('2')
    expect(parents.get('4')).toBe('2')
    expect(parents.get('5')).toBe('1')
    expect(parents.get('6')).toBe('5')
  })

  it('varias raíces conviven', () => {
    const parents = parentsFromLevels([
      { id: '1', name: 'Etapa uno', level: 0 },
      { id: '2', name: 'Su fase', level: 1 },
      { id: '3', name: 'Etapa dos', level: 0 },
    ])
    expect(parents.get('1')).toBeNull()
    expect(parents.get('3')).toBeNull()
    expect(parents.get('2')).toBe('1')
  })

  it('se niega ante un salto de nivel en vez de inventar el padre', () => {
    expect(() =>
      parentsFromLevels([
        { id: '1', name: 'Etapa', level: 0 },
        { id: '2', name: 'Huérfana', level: 2 },
      ]),
    ).toThrow(/Falta la línea que debería contenerla/)
  })

  it('se niega ante un nivel que no es un entero de cero en adelante', () => {
    expect(() => parentsFromLevels([{ id: '1', name: 'Rara', level: -1 }])).toThrow(/entero de cero/)
    expect(() => parentsFromLevels([{ id: '1', name: 'Rara', level: 1.5 }])).toThrow(/entero de cero/)
  })

  it('lo que sale de aquí entra directo en el prorrateo', () => {
    const filas = [
      { id: 'e', name: 'Etapa', level: 0 },
      { id: 'a', name: 'Larga', level: 1 },
      { id: 'b', name: 'Corta', level: 1 },
    ]
    const parents = parentsFromLevels(filas)
    const duraciones: Record<string, number> = { e: 0, a: 9, b: 1 }
    const avances: Record<string, number> = { e: 0, a: 1, b: 0 }

    const tareas: PlanTask[] = filas.map((fila) => ({
      id: fila.id,
      name: fila.name,
      duration: duraciones[fila.id],
      progress: avances[fila.id],
      ...(parents.get(fila.id) ? { parentId: parents.get(fila.id)! } : {}),
    }))

    expect(rollUpProgress(tareas).byId.get('e')!.progress).toBe(0.9)
  })
})

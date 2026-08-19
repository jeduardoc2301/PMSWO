import { describe, expect, it } from 'vitest'

import {
  DependencyCycleError,
  SchedulingError,
  buildDependencyGraph,
  formatPredecessors,
  parsePredecessors,
  toDependencies,
} from '../dependencies'
import type { Dependency, PlanTask } from '../types'

function tarea(id: string, name: string, duration = 1): PlanTask {
  return { id, name, duration }
}

function vinculo(
  predecessorId: string,
  successorId: string,
  type: Dependency['type'] = 'FS',
  lag = 0,
): Dependency {
  return { predecessorId, successorId, type, lag }
}

describe('Lectura de predecesoras', () => {
  it('lee un identificador solo como fin-comienzo sin desfase', () => {
    expect(parsePredecessors('288')).toEqual([{ predecessorId: '288', type: 'FS', lag: 0 }])
  })

  it('lee los cuatro tipos de vínculo', () => {
    expect(parsePredecessors('1FS,2SS,3FF,4SF')).toEqual([
      { predecessorId: '1', type: 'FS', lag: 0 },
      { predecessorId: '2', type: 'SS', lag: 0 },
      { predecessorId: '3', type: 'FF', lag: 0 },
      { predecessorId: '4', type: 'SF', lag: 0 },
    ])
  })

  it('lee el desfase con su signo', () => {
    expect(parsePredecessors('10FS+3 days,11SS-2 days')).toEqual([
      { predecessorId: '10', type: 'FS', lag: 3 },
      { predecessorId: '11', type: 'SS', lag: -2 },
    ])
  })

  it('acepta la forma que escribe Project en inglés, separada por coma', () => {
    // Tomado tal cual del plan de referencia.
    expect(parsePredecessors('288,302FF,258FS+3 days')).toEqual([
      { predecessorId: '288', type: 'FS', lag: 0 },
      { predecessorId: '302', type: 'FF', lag: 0 },
      { predecessorId: '258', type: 'FS', lag: 3 },
    ])
  })

  it('acepta la forma en español, separada por punto y coma', () => {
    expect(parsePredecessors('125FF-2 días; 130')).toEqual([
      { predecessorId: '125', type: 'FF', lag: -2 },
      { predecessorId: '130', type: 'FS', lag: 0 },
    ])
  })

  it('tolera espacios, minúsculas y el singular de la unidad', () => {
    expect(parsePredecessors('  12 ff -1 day ,  13 ss + 1 día ')).toEqual([
      { predecessorId: '12', type: 'FF', lag: -1 },
      { predecessorId: '13', type: 'SS', lag: 1 },
    ])
  })

  it('acepta el desfase sin unidad', () => {
    expect(parsePredecessors('12FS+3')).toEqual([{ predecessorId: '12', type: 'FS', lag: 3 }])
  })

  it('devuelve lista vacía cuando no hay predecesoras', () => {
    expect(parsePredecessors('')).toEqual([])
    expect(parsePredecessors('   ')).toEqual([])
    expect(parsePredecessors(null)).toEqual([])
    expect(parsePredecessors(undefined)).toEqual([])
    expect(parsePredecessors('12,')).toHaveLength(1)
  })

  it('se niega a leer días corridos en vez de convertirlos a la callada', () => {
    expect(() => parsePredecessors('12FS+3 edays')).toThrow(SchedulingError)
    expect(() => parsePredecessors('12FS+3 edays')).toThrow(/días corridos/)
  })

  it('se niega ante una unidad que no reconoce', () => {
    expect(() => parsePredecessors('12FS+3 semanas')).toThrow(/no se reconoce la unidad/i)
  })

  it('se niega ante un tramo ilegible en vez de descartarlo', () => {
    expect(() => parsePredecessors('12FS,,,abc')).toThrow(/no se entiende la predecesora/i)
    expect(() => parsePredecessors('12XY')).toThrow(/no se entiende la predecesora/i)
  })

  it('permite cambiar el tipo que se asume', () => {
    expect(parsePredecessors('12', { defaultType: 'SS' })).toEqual([
      { predecessorId: '12', type: 'SS', lag: 0 },
    ])
  })

  it('vuelve a escribir lo que leyó', () => {
    const texto = '125FF-2 días; 130'
    expect(formatPredecessors(parsePredecessors(texto))).toBe(texto)
    expect(formatPredecessors(parsePredecessors('12FS+1 day'))).toBe('12FS+1 día')
  })

  it('arma dependencias completas al saber la sucesora', () => {
    expect(toDependencies('99', parsePredecessors('12FF-2 días'))).toEqual([
      { predecessorId: '12', successorId: '99', type: 'FF', lag: -2 },
    ])
  })
})

describe('Construcción del grafo de dependencias', () => {
  it('ordena las tareas sin poner ninguna antes que sus predecesoras', () => {
    const tasks = [tarea('c', 'Tercera'), tarea('a', 'Primera'), tarea('b', 'Segunda')]
    const dependencies = [vinculo('a', 'b'), vinculo('b', 'c')]

    const graph = buildDependencyGraph(tasks, dependencies)

    expect(graph.order.indexOf('a')).toBeLessThan(graph.order.indexOf('b'))
    expect(graph.order.indexOf('b')).toBeLessThan(graph.order.indexOf('c'))
    expect(graph.order).toHaveLength(3)
  })

  it('agrupa los vínculos que entran y los que salen', () => {
    const tasks = [tarea('a', 'Primera'), tarea('b', 'Segunda'), tarea('c', 'Tercera')]
    const graph = buildDependencyGraph(tasks, [vinculo('a', 'c'), vinculo('b', 'c')])

    expect(graph.incoming.get('c')).toHaveLength(2)
    expect(graph.outgoing.get('a')).toHaveLength(1)
    expect(graph.incoming.get('a')).toHaveLength(0)
  })

  it('acepta un plan sin ningún vínculo', () => {
    const graph = buildDependencyGraph([tarea('a', 'Sola')], [])
    expect(graph.order).toEqual(['a'])
  })

  describe('lo que rechaza', () => {
    it('identificadores repetidos, nombrando las dos tareas', () => {
      expect(() => buildDependencyGraph([tarea('a', 'Una'), tarea('a', 'Otra')], [])).toThrow(/«Una».*«Otra»/)
    })

    it('duraciones negativas o fraccionarias, nombrando la tarea', () => {
      expect(() => buildDependencyGraph([tarea('a', 'Migrar el motor', -1)], [])).toThrow(
        /«Migrar el motor».*no puede ser negativa/s,
      )
      expect(() => buildDependencyGraph([tarea('a', 'Migrar el motor', 1.5)], [])).toThrow(/días hábiles enteros/)
    })

    it('una predecesora que no está en el plan, diciendo quién la pide', () => {
      const tasks = [tarea('b', 'Configurar la red')]
      expect(() => buildDependencyGraph(tasks, [vinculo('a', 'b')])).toThrow(
        /«Configurar la red» depende de «a», que no está en el plan/,
      )
    })

    it('un vínculo que apunta a una sucesora inexistente', () => {
      expect(() => buildDependencyGraph([tarea('a', 'Una')], [vinculo('a', 'z')])).toThrow(
        /apunta a la tarea «z», que no está en el plan/,
      )
    })

    it('una tarea que se declara predecesora de sí misma', () => {
      expect(() => buildDependencyGraph([tarea('a', 'Estabilizar')], [vinculo('a', 'a')])).toThrow(
        /«Estabilizar» aparece como predecesora de sí misma/,
      )
    })

    it('dos vínculos entre el mismo par de tareas', () => {
      const tasks = [tarea('a', 'Replicar'), tarea('b', 'Validar')]
      expect(() => buildDependencyGraph(tasks, [vinculo('a', 'b', 'FS'), vinculo('a', 'b', 'SS')])).toThrow(
        /más de un vínculo entre «Replicar» y «Validar»/,
      )
    })

    it('un tipo de vínculo que no existe', () => {
      const tasks = [tarea('a', 'Una'), tarea('b', 'Otra')]
      const roto = { predecessorId: 'a', successorId: 'b', type: 'XX', lag: 0 } as unknown as Dependency
      expect(() => buildDependencyGraph(tasks, [roto])).toThrow(/FS, SS, FF y SF/)
    })

    it('un desfase fraccionario', () => {
      const tasks = [tarea('a', 'Una'), tarea('b', 'Otra')]
      expect(() => buildDependencyGraph(tasks, [vinculo('a', 'b', 'FS', 1.5)])).toThrow(/días hábiles enteros/)
    })
  })

  describe('ciclos', () => {
    it('rechaza un ciclo nombrando las tareas que lo forman', () => {
      const tasks = [
        tarea('a', 'Diseñar la topología'),
        tarea('b', 'Aprobar la topología'),
        tarea('c', 'Publicar la topología'),
      ]
      const dependencies = [vinculo('a', 'b'), vinculo('b', 'c'), vinculo('c', 'a')]

      expect(() => buildDependencyGraph(tasks, dependencies)).toThrow(DependencyCycleError)

      try {
        buildDependencyGraph(tasks, dependencies)
        expect.unreachable('debió rechazar el ciclo')
      } catch (error) {
        const cycle = error as DependencyCycleError
        expect(cycle.code).toBe('CICLO_DE_DEPENDENCIAS')
        expect(cycle.cycle).toHaveLength(3)
        expect([...cycle.cycle].sort()).toEqual(['a', 'b', 'c'])

        // El mensaje tiene que nombrar las tres, o no sirve para saber qué vínculo cortar.
        expect(cycle.message).toContain('Diseñar la topología')
        expect(cycle.message).toContain('Aprobar la topología')
        expect(cycle.message).toContain('Publicar la topología')
        expect(cycle.message).toContain('→')
      }
    })

    it('rechaza un ciclo de dos tareas', () => {
      const tasks = [tarea('a', 'Ida'), tarea('b', 'Vuelta')]
      expect(() => buildDependencyGraph(tasks, [vinculo('a', 'b'), vinculo('b', 'a')])).toThrow(
        /Ida.*Vuelta|Vuelta.*Ida/,
      )
    })

    it('encuentra el ciclo aunque esté enterrado entre tareas sanas', () => {
      const tasks = [
        tarea('raiz', 'Arranque'),
        tarea('x', 'Nudo uno'),
        tarea('y', 'Nudo dos'),
        tarea('hoja', 'Cierre'),
      ]
      const dependencies = [
        vinculo('raiz', 'x'),
        vinculo('x', 'y'),
        vinculo('y', 'x'),
        vinculo('y', 'hoja'),
      ]

      try {
        buildDependencyGraph(tasks, dependencies)
        expect.unreachable('debió rechazar el ciclo')
      } catch (error) {
        const cycle = error as DependencyCycleError
        expect([...cycle.cycle].sort()).toEqual(['x', 'y'])
        expect(cycle.message).toContain('Nudo uno')
        expect(cycle.message).toContain('Nudo dos')
        expect(cycle.message).not.toContain('Arranque')
      }
    })

    it('no confunde con un ciclo a dos caminos que se vuelven a juntar', () => {
      const tasks = [tarea('a', 'A'), tarea('b', 'B'), tarea('c', 'C'), tarea('d', 'D')]
      const dependencies = [vinculo('a', 'b'), vinculo('a', 'c'), vinculo('b', 'd'), vinculo('c', 'd')]
      expect(() => buildDependencyGraph(tasks, dependencies)).not.toThrow()
    })

    it('aguanta una cadena larga sin quedarse sin pila', () => {
      const total = 5000
      const tasks = Array.from({ length: total }, (_, i) => tarea(String(i), `Tarea ${i}`))
      const dependencies = Array.from({ length: total - 1 }, (_, i) => vinculo(String(i), String(i + 1)))

      // La última cierra el ciclo contra la primera: el buscador tiene que recorrer las 5000.
      dependencies.push(vinculo(String(total - 1), '0'))

      expect(() => buildDependencyGraph(tasks, dependencies)).toThrow(DependencyCycleError)
    })
  })
})

describe('§10.7 · un ciclo rechazado dice cuál es la cadena', () => {
  /**
   * El spec lo pide con un ejemplo literal: «toast con el motivo concreto ("Crearía un ciclo:
   * A → B → C → A"), nunca un "Error" genérico».
   *
   * Saber que «hay un ciclo» no sirve de nada. Lo que hace falta es **cuál vínculo cortar**, y para
   * eso hay que ver la vuelta entera con los nombres que la gente usa.
   */
  it('nombra las tareas del ciclo, en orden, y cierra la vuelta', () => {
    const tasks = [
      { id: 'a', name: 'Autorizar el apagado', duration: 1 },
      { id: 'b', name: 'Traspasar los servidores', duration: 1 },
      { id: 'c', name: 'Documentar las lecciones', duration: 1 },
    ] as never

    let mensaje = ''
    try {
      buildDependencyGraph(tasks, [
        { predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 },
        { predecessorId: 'b', successorId: 'c', type: 'FS', lag: 0 },
        { predecessorId: 'c', successorId: 'a', type: 'FS', lag: 0 },
      ])
      expect.unreachable('debería haber rechazado el ciclo')
    } catch (e) {
      mensaje = (e as Error).message
    }

    for (const nombre of ['Autorizar el apagado', 'Traspasar los servidores', 'Documentar las lecciones']) {
      expect(mensaje).toContain(nombre)
    }
    // La vuelta se cierra: el primero aparece también al final.
    expect(mensaje.indexOf('Autorizar el apagado')).not.toBe(mensaje.lastIndexOf('Autorizar el apagado'))
  })

  it('dice qué hacer, no solo qué pasó', () => {
    // Un mensaje que solo nombra el problema manda a buscar la solución a otra parte.
    try {
      buildDependencyGraph(
        [{ id: 'x', name: 'X', duration: 1 }, { id: 'y', name: 'Y', duration: 1 }] as never,
        [
          { predecessorId: 'x', successorId: 'y', type: 'FS', lag: 0 },
          { predecessorId: 'y', successorId: 'x', type: 'FS', lag: 0 },
        ],
      )
      expect.unreachable()
    } catch (e) {
      expect((e as Error).message).toContain('quitar uno de esos vínculos')
    }
  })
})

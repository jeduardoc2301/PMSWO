import { describe, expect, it } from 'vitest'

import { numerarPlan } from '@/lib/scheduling/wbs'

/**
 * El §3.6 dice «máximo 16 niveles» del WBS. Esto comprueba que **aguanta** los 16.
 *
 * La frase del spec se puede leer de dos maneras y la diferencia importa: como una prohibición —
 * rechazar el nivel 17— o como una capacidad: la numeración tiene que funcionar hasta ahí. Leída
 * entera —«se materializa recorriendo el árbol por `parentId` + `sortOrder`: 1, 1.1, 1.1.1… Máximo
 * 16 niveles»— es lo segundo: dice hasta dónde debe llegar, no qué echar atrás.
 *
 * Y por eso esta prueba mide la capacidad en vez de añadir un guardián. El plan de referencia tiene
 * **6 niveles de profundidad**, así que un rechazo en el 17 no protegería de nada real y sí podría
 * echar atrás datos legítimos el día que alguien anide más.
 */
describe('§3.6 · el WBS aguanta los dieciséis niveles', () => {
  it('numera una rama de 16 de profundidad sin perderse', () => {
    // Una sola rama, cada línea hija de la anterior.
    const tasks = Array.from({ length: 16 }, (_, i) => ({
      id: `n${i}`,
      parentId: i === 0 ? null : `n${i - 1}`,
      sortOrder: 0,
    }))

    const numeros = numerarPlan(tasks as never)
    expect(numeros.length).toBe(16)

    const porId = new Map(numeros.map((n) => [n.id, n]))
    // La más honda: dieciséis unos separados por puntos, y nivel 15 contando desde cero.
    const honda = porId.get('n15')!
    expect(honda.wbs).toBe(Array.from({ length: 16 }, () => '1').join('.'))
    expect(honda.level).toBe(15)

    // Y la escalera intermedia, para que no pase por casualidad sólo en los extremos.
    expect(porId.get('n0')!.wbs).toBe('1')
    expect(porId.get('n7')!.wbs).toBe('1.1.1.1.1.1.1.1')
  })

  it('y sigue ordenando bien a esa profundidad', () => {
    // Dos ramas hermanas en el nivel más hondo: la numeración tiene que distinguirlas.
    const tasks = [
      ...Array.from({ length: 15 }, (_, i) => ({
        id: `n${i}`,
        parentId: i === 0 ? null : `n${i - 1}`,
        sortOrder: 0,
      })),
      { id: 'a', parentId: 'n14', sortOrder: 0 },
      { id: 'b', parentId: 'n14', sortOrder: 1 },
    ]

    const porId = new Map(numerarPlan(tasks as never).map((n) => [n.id, n]))
    expect(porId.get('a')!.wbs).toBe(Array.from({ length: 16 }, () => '1').join('.'))
    expect(porId.get('b')!.wbs).toBe(Array.from({ length: 15 }, () => '1').join('.') + '.2')
  })
})

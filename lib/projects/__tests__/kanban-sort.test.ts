import { describe, expect, it } from 'vitest'

import {
  CAMPOS_DE_ORDEN,
  type TarjetaOrdenable,
  edtPorTarjeta,
  ordenarTarjetas,
} from '../kanban-sort'

/**
 * §5.1: «Ordenar por: cualquier columna del catálogo (EDT por defecto), ascendente o descendente.»
 *
 * El plan de prueba es un árbol pequeño y numerado a mano, para que cada expectativa se pueda
 * seguir sin ejecutar nada:
 *
 * ```
 *   fase   1
 *    ├─ a  1.1   HIGH      01-jun → 05-jun   avance 0.5
 *    ├─ b  1.2   CRITICAL  03-jun → 04-jun   avance 0.1
 *    └─ c  1.3   LOW       02-jun → 10-jun   avance 0.9
 *   otra   2
 *    └─ d  2.1   MEDIUM    01-jun → 02-jun   avance 0.0
 * ```
 */

function tarjeta(sobre: Partial<TarjetaOrdenable> & Pick<TarjetaOrdenable, 'id'>): TarjetaOrdenable {
  return {
    title: sobre.id,
    priority: 'MEDIUM',
    startDate: '2026-06-01',
    estimatedEndDate: '2026-06-05',
    progressPct: 0,
    parentId: null,
    ...sobre,
  }
}

const PLAN: TarjetaOrdenable[] = [
  tarjeta({ id: 'fase', title: 'Fase uno' }),
  tarjeta({ id: 'a', title: 'Migrar', parentId: 'fase', priority: 'HIGH', progressPct: 0.5 }),
  tarjeta({
    id: 'b',
    title: 'Aprobar',
    parentId: 'fase',
    priority: 'CRITICAL',
    startDate: '2026-06-03',
    estimatedEndDate: '2026-06-04',
    progressPct: 0.1,
  }),
  tarjeta({
    id: 'c',
    title: 'Zanjar',
    parentId: 'fase',
    priority: 'LOW',
    startDate: '2026-06-02',
    estimatedEndDate: '2026-06-10',
    progressPct: 0.9,
  }),
  tarjeta({ id: 'otra', title: 'Fase dos' }),
  tarjeta({
    id: 'd',
    title: 'Cerrar',
    parentId: 'otra',
    startDate: '2026-06-01',
    estimatedEndDate: '2026-06-02',
  }),
]

const HOJAS = PLAN.filter((t) => t.parentId !== null)

function orden(campo: Parameters<typeof ordenarTarjetas>[2], sentido: 'asc' | 'desc' = 'asc') {
  return ordenarTarjetas(HOJAS, PLAN, campo, sentido).map((t) => t.id)
}

describe('Por EDT, que es el orden por omisión', () => {
  it('devuelve las tarjetas al orden del plan', () => {
    expect(orden('wbs')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('descendente las invierte', () => {
    expect(orden('wbs', 'desc')).toEqual(['d', 'c', 'b', 'a'])
  })

  it('1.9 va antes que 1.10, no al revés', () => {
    // Ordenar los EDT como cadenas pondría «1.10» antes que «1.9». Es el mismo error que ordena
    // mal las versiones de un programa.
    const fase = tarjeta({ id: 'f' })
    const muchas = Array.from({ length: 11 }, (_, i) => tarjeta({ id: `h${i + 1}`, parentId: 'f' }))
    const todas = [fase, ...muchas]

    const ids = ordenarTarjetas(muchas, todas, 'wbs', 'asc').map((t) => t.id)
    expect(ids.indexOf('h9')).toBeLessThan(ids.indexOf('h10'))
  })
})

describe('Por prioridad se ordena por urgencia, no por alfabeto', () => {
  it('CRITICAL va antes que HIGH aunque la C vaya después de la H', () => {
    expect(orden('priority')).toEqual(['b', 'a', 'd', 'c'])
  })

  it('descendente pone lo menos urgente arriba', () => {
    expect(orden('priority', 'desc')[0]).toBe('c')
  })

  it('una prioridad desconocida no se cuela delante de las conocidas', () => {
    const rara = tarjeta({ id: 'rara', parentId: 'fase', priority: 'INVENTADA' })
    const ids = ordenarTarjetas([...HOJAS, rara], [...PLAN, rara], 'priority', 'asc').map((t) => t.id)
    expect(ids[ids.length - 1]).toBe('rara')
  })
})

describe('Por fechas y por avance', () => {
  it('por fecha de inicio, de la más temprana a la más tardía', () => {
    // 'a' y 'd' arrancan el mismo día: desempatan por EDT, así que 'a' (1.1) antes que 'd' (2.1).
    expect(orden('startDate')).toEqual(['a', 'd', 'c', 'b'])
  })

  it('por fecha final', () => {
    expect(orden('endDate')).toEqual(['d', 'b', 'a', 'c'])
  })

  it('por avance, de menos a más', () => {
    expect(orden('progress')).toEqual(['d', 'b', 'a', 'c'])
  })
})

describe('El desempate', () => {
  it('todo criterio acaba en el EDT', () => {
    // Cuatro tarjetas con la misma prioridad tienen que salir siempre igual; si no, cada
    // redibujado las baraja y quien mira la columna cree que algo se movió.
    const iguales = HOJAS.map((t) => ({ ...t, priority: 'MEDIUM' }))
    const todas = PLAN.map((t) => ({ ...t, priority: 'MEDIUM' }))
    expect(ordenarTarjetas(iguales, todas, 'priority', 'asc').map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  it('el desempate NO se invierte con el sentido', () => {
    // Si también se invirtiera, cambiar el sentido reordenaría los empates y parecería que las
    // tarjetas se mueven solas.
    const iguales = HOJAS.map((t) => ({ ...t, priority: 'MEDIUM' }))
    const todas = PLAN.map((t) => ({ ...t, priority: 'MEDIUM' }))
    expect(ordenarTarjetas(iguales, todas, 'priority', 'desc').map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })
})

describe('El EDT se numera sobre el plan entero', () => {
  it('numerar sólo lo visible daría números distintos según el filtro', () => {
    // Si el EDT cambiara al filtrar, dejaría de servir para nombrar una línea en una reunión.
    const soloDos = [PLAN[2], PLAN[3]]
    const conTodo = ordenarTarjetas(soloDos, PLAN, 'wbs', 'asc')
    const edt = edtPorTarjeta(PLAN)

    expect(edt.get(conTodo[0].id)).toBe('1.2')
    expect(edt.get(conTodo[1].id)).toBe('1.3')
  })

  it('el catálogo del desplegable abre con el EDT', () => {
    expect(CAMPOS_DE_ORDEN[0].clave).toBe('wbs')
  })
})

describe('Higiene', () => {
  it('no muta la lista que recibe', () => {
    const original = [...HOJAS]
    ordenarTarjetas(HOJAS, PLAN, 'title', 'desc')
    expect(HOJAS).toEqual(original)
  })

  it('una lista vacía no revienta', () => {
    expect(ordenarTarjetas([], PLAN, 'wbs', 'asc')).toEqual([])
  })
})

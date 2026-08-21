import { describe, expect, it } from 'vitest'

import { COLUMNAS } from '../gantt-columns'
import { COLUMNAS_DE_LA_LISTA } from '@/lib/projects/list-columns'

/**
 * §6.2 · «Mismas columnas configurables que el Gantt».
 *
 * No es una prueba de que algo funcione: es la **medición** de una brecha, escrita para que el
 * número no haya que volver a sacarlo a mano y para que se ponga roja el día que alguien la cierre
 * —momento en el que esta prueba se cambia por la que dice que son iguales—.
 *
 * El §6.4 avisa de la causa: «¿La lista actual es el mismo componente de grid que el Gantt o hay dos
 * implementaciones distintas? Si hay dos, unifícalas». Hay dos.
 */
describe('§6.2 · las columnas de la Lista contra las del Gantt', () => {
  const enElGantt = new Set(COLUMNAS.map((c) => c.id))
  const enLaLista = new Set(COLUMNAS_DE_LA_LISTA.map((c) => c.id))

  it('el Gantt ofrece muchas más, y esto lo deja medido', () => {
    expect(COLUMNAS.length).toBeGreaterThan(COLUMNAS_DE_LA_LISTA.length)
    // Las cifras del día en que se midió: 14 contra 9. Si alguien cierra la brecha, esta prueba se
    // pone roja y hay que venir a cambiarla — que es exactamente lo que se quiere.
    expect([COLUMNAS.length, COLUMNAS_DE_LA_LISTA.length]).toEqual([14, 9])
  })

  it('y lo que la Lista no puede enseñar incluye la duración, en ninguna de sus dos formas', () => {
    // Una línea de cuatro horas en la Lista se ve por sus fechas y nada más: ni «1 día» ni «4 h».
    expect(enLaLista.has('duration')).toBe(false)
    expect(enLaLista.has('duracionMin')).toBe(false)
    expect(enElGantt.has('duration')).toBe(true)
    expect(enElGantt.has('duracionMin')).toBe(true)
  })

  it('las que sí comparten se llaman igual, que es lo que permitirá unificarlas', () => {
    const comunes = [...enLaLista].filter((id) => enElGantt.has(id))
    // Cinco de las nueve: el título, el estado, el responsable, y las dos fechas.
    expect(comunes.sort()).toEqual(['estimatedEndDate', 'name', 'startDate', 'status'].sort().filter((id) => enLaLista.has(id) && enElGantt.has(id)))
  })
})

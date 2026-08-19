import { describe, expect, it } from 'vitest'

import {
  type CampoDeGrupo,
  type LineaSumable,
  SIN_VALOR,
  agrupar,
  subtotalesCuadran,
  totalizar,
} from '../list-totals'

/**
 * La fila de totales y el formato agrupado del §6.3.
 *
 * Los dos criterios que se comprueban aquí son gemelos y se rompen por separado: «la fila TOTAL
 * suma correctamente y respeta el filtro» y «los subtotales por grupo cuadran con el total». Lo
 * segundo falla sin que lo primero falle en cuanto una línea deja de caer en algún grupo — el total
 * sigue siendo cierto y la suma de los grupos no llega.
 */

function linea(id: string, cambios: Partial<LineaSumable> = {}): LineaSumable {
  return { id, estimatedHours: 10, progressPct: 0, status: 'TODO', ...cambios }
}

describe('§6.2 · la fila de totales', () => {
  it('sin líneas no inventa cifras', () => {
    expect(totalizar([])).toEqual({ lineas: 0, horas: 0, avance: 0, ponderado: true })
  })

  it('suma las horas de las hojas', () => {
    const t = totalizar([linea('a', { estimatedHours: 8 }), linea('b', { estimatedHours: 12 })])
    expect(t.lineas).toBe(2)
    expect(t.horas).toBe(20)
  })

  it('no cuenta los resúmenes: sus horas son las de sus hijos', () => {
    // Contarlos duplicaría cada rama del árbol, y el total saldría del orden del doble.
    const t = totalizar([
      linea('padre', { estimatedHours: 20, esResumen: true }),
      linea('h1', { estimatedHours: 8 }),
      linea('h2', { estimatedHours: 12 }),
    ])
    expect(t.lineas).toBe(2)
    expect(t.horas).toBe(20)
  })

  it('el avance va ponderado por horas, no promediado a secas', () => {
    // Ochenta horas al 10 % y una hora al 100 % no son «55 % de avance».
    const t = totalizar([
      linea('grande', { estimatedHours: 80, progressPct: 0.1 }),
      linea('chica', { estimatedHours: 1, progressPct: 1 }),
    ])
    expect(t.ponderado).toBe(true)
    expect(t.avance).toBeCloseTo((80 * 0.1 + 1) / 81, 5)
    expect(t.avance).toBeLessThan(0.2)
  })

  it('sin horas capturadas cae al promedio simple, y lo dice', () => {
    const t = totalizar([
      linea('a', { estimatedHours: null, progressPct: 0 }),
      linea('b', { estimatedHours: null, progressPct: 1 }),
    ])
    expect(t.ponderado).toBe(false)
    expect(t.avance).toBeCloseTo(0.5, 5)
  })

  it('respeta el filtro porque suma lo que le den, no lo que haya', () => {
    // Es toda la garantía del «respeta el filtro activo»: esta función no conoce el plan completo.
    const todas = [linea('a', { estimatedHours: 5 }), linea('b', { estimatedHours: 7 })]
    const filtradas = todas.filter((l) => l.id === 'a')
    expect(totalizar(filtradas).horas).toBe(5)
    expect(totalizar(todas).horas).toBe(12)
  })
})

describe('§6.3 · el formato agrupado', () => {
  const LINEAS: LineaSumable[] = [
    linea('a', { status: 'TODO', estimatedHours: 4 }),
    linea('b', { status: 'DONE', estimatedHours: 6, progressPct: 1 }),
    linea('c', { status: 'TODO', estimatedHours: 10 }),
    linea('d', { status: null, estimatedHours: 3 }),
  ]

  it('cada línea cae en exactamente un grupo', () => {
    const grupos = agrupar(LINEAS, 'status')
    const total = grupos.reduce((s, g) => s + g.lineas.length, 0)
    expect(total).toBe(LINEAS.length)
  })

  it('las que no tienen valor van a un cajón, no se pierden', () => {
    // Dejarlas fuera es cómo los subtotales dejan de cuadrar sin que nadie lo note.
    const grupos = agrupar(LINEAS, 'status')
    const cajon = grupos.find((g) => g.clave === SIN_VALOR)
    expect(cajon).toBeDefined()
    expect(cajon!.lineas.map((l) => l.id)).toEqual(['d'])
  })

  it('el cajón va al final: es un cajón, no una categoría', () => {
    const grupos = agrupar(LINEAS, 'status')
    expect(grupos[grupos.length - 1]!.clave).toBe(SIN_VALOR)
  })

  it('los subtotales cuadran con el total', () => {
    const grupos = agrupar(LINEAS, 'status')
    expect(subtotalesCuadran(grupos, totalizar(LINEAS))).toBe(true)
  })

  it('cuadran también con resúmenes por medio', () => {
    // El resumen no cuenta ni en el total ni en su subtotal: si contara en uno solo, dejarían de
    // cuadrar y las dos cifras seguirían pareciendo ciertas por separado.
    const con = [...LINEAS, linea('resumen', { status: 'TODO', estimatedHours: 14, esResumen: true })]
    const grupos = agrupar(con, 'status')
    expect(subtotalesCuadran(grupos, totalizar(con))).toBe(true)
  })

  it('cuadran por cualquiera de los campos ofrecidos', () => {
    const variadas: LineaSumable[] = [
      linea('a', { priority: 'HIGH', ownerName: 'Ana', phase: 'Inicio' }),
      linea('b', { priority: 'LOW', ownerName: null, phase: '' }),
      linea('c', { priority: 'HIGH', ownerName: 'Ana', phase: 'Cierre' }),
    ]
    for (const campo of ['status', 'priority', 'owner', 'phase'] as CampoDeGrupo[]) {
      expect(subtotalesCuadran(agrupar(variadas, campo), totalizar(variadas))).toBe(true)
    }
  })

  it('agrupar por un campo vacío en todas deja un solo cajón', () => {
    const grupos = agrupar([linea('a', { ownerName: null }), linea('b', { ownerName: '  ' })], 'owner')
    expect(grupos).toHaveLength(1)
    expect(grupos[0]!.clave).toBe(SIN_VALOR)
  })
})

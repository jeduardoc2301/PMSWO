import { describe, expect, it } from 'vitest'

import type { ImportedRow } from '@/lib/scheduling/import-plan'
import { type ElementoExistente, planDeRefresco } from '../plan-merge'

/**
 * Prueba de aceptación de E9: reimportar sin perder lo capturado.
 *
 * La política tiene una sola regla y aquí se fija: el archivo manda cuando dice algo (avance mayor
 * que cero); cuando calla, lo capturado en la plataforma se conserva. Y el refresco jamás toca lo
 * que la plataforma creó por su cuenta.
 */

function fila(sourceId: string, progress: number | null = null): ImportedRow {
  return {
    id: sourceId,
    level: 1,
    name: `Línea ${sourceId}`,
    kind: 'ACTIVIDAD',
    isSummary: false,
    duration: 5,
    declaredStart: '2026-06-01',
    declaredFinish: '2026-06-05',
    party: 'PROVEEDOR',
    recoverability: null,
    owner: 'Alguien',
    clientParticipates: null,
    deliverable: null,
    exitCriteria: null,
    traceability: null,
    weight: null,
    progress,
    predecessors: [],
    source: { file: 'plan.xlsx', sheet: 'Plan', row: Number(sourceId), id: sourceId },
  } as unknown as ImportedRow
}

function existente(sourceId: string | null, progressPct: number, id = `uuid-${sourceId}`): ElementoExistente {
  return { id, sourceId, progressPct, status: progressPct >= 1 ? 'DONE' : 'TODO' }
}

describe('La política del avance', () => {
  it('el archivo manda cuando trae avance', () => {
    const plan = planDeRefresco([fila('1', 0.8)], [existente('1', 0.3)])

    expect(plan.actualizar).toHaveLength(1)
    expect(plan.actualizar[0].progress).toBe(0.8)
    expect(plan.actualizar[0].avanceDe).toBe('ARCHIVO')
    expect(plan.avancesConservados).toBe(0)
  })

  it('cuando el archivo calla, lo capturado en la plataforma se conserva', () => {
    const plan = planDeRefresco([fila('1', 0)], [existente('1', 0.45)])

    expect(plan.actualizar[0].progress).toBe(0.45)
    expect(plan.actualizar[0].avanceDe).toBe('PLATAFORMA')
    expect(plan.avancesConservados).toBe(1)
  })

  it('una celda vacía cuenta como silencio, no como cero', () => {
    const plan = planDeRefresco([fila('1', null)], [existente('1', 0.45)])

    expect(plan.actualizar[0].progress).toBe(0.45)
    expect(plan.actualizar[0].avanceDe).toBe('PLATAFORMA')
  })

  /**
   * Consecuencia deliberada de la regla: bajar un avance a cero no se puede por reimportación. Un
   * cero del archivo no distingue «no ha empezado» de «no lo capturé aquí», y ante la ambigüedad,
   * destruir la captura local es el error caro. Bajar a cero se hace en la plataforma.
   */
  it('el archivo no puede bajar un avance a cero', () => {
    const plan = planDeRefresco([fila('1', 0)], [existente('1', 1)])

    expect(plan.actualizar[0].progress).toBe(1)
  })

  it('cero contra cero es cero, sin contarse como conservado', () => {
    const plan = planDeRefresco([fila('1', 0)], [existente('1', 0)])

    expect(plan.actualizar[0].progress).toBe(0)
    expect(plan.avancesConservados).toBe(0)
  })
})

describe('El emparejamiento por sourceId', () => {
  it('lo que está en ambos se actualiza sobre su UUID', () => {
    const plan = planDeRefresco([fila('7')], [existente('7', 0, 'uuid-estable')])

    expect(plan.actualizar[0].elementoId).toBe('uuid-estable')
    expect(plan.crear).toHaveLength(0)
  })

  it('una fila nueva del archivo se crea', () => {
    const plan = planDeRefresco([fila('7'), fila('8')], [existente('7', 0)])

    expect(plan.crear).toHaveLength(1)
    expect(plan.crear[0].fila.source.id).toBe('8')
  })

  it('un elemento cuya fila desapareció del archivo se retira, con nombre y apellido', () => {
    const plan = planDeRefresco([fila('7')], [existente('7', 0), existente('8', 0.5)])

    expect(plan.retirar).toHaveLength(1)
    expect(plan.retirar[0].sourceId).toBe('8')
  })

  it('lo creado a mano en la plataforma no se toca: el archivo no sabe de ello', () => {
    const aMano = existente(null, 0.6, 'uuid-manual')
    const plan = planDeRefresco([fila('7')], [existente('7', 0), aMano])

    expect(plan.ajenos).toEqual([aMano])
    expect(plan.retirar).toHaveLength(0)
  })
})

describe('El caso real: primer refresco tras capturar en las dos partes', () => {
  it('mezcla archivo y plataforma sin perder ninguno de los dos', () => {
    const plan = planDeRefresco(
      [fila('1', 0.53), fila('2', 0), fila('3', 0.8), fila('4')],
      [existente('1', 0.1), existente('2', 0.25), existente('3', 0), existente('4', 0.9)],
    )

    const porFila = new Map(plan.actualizar.map((linea) => [linea.fila.source.id, linea]))
    expect(porFila.get('1')!.progress).toBe(0.53) // el archivo habló
    expect(porFila.get('2')!.progress).toBe(0.25) // el archivo calló, la plataforma había capturado
    expect(porFila.get('3')!.progress).toBe(0.8) // el archivo habló
    expect(porFila.get('4')!.progress).toBe(0.9) // celda vacía: silencio
    expect(plan.avancesConservados).toBe(2)
  })
})

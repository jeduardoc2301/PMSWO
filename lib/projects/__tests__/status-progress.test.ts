import { describe, expect, it } from 'vitest'

import {
  ARRANCADA,
  type ColumnaDeEstado,
  columnaAlCambiarProgreso,
  progresoAlMover,
  seContradicen,
} from '../status-progress'

/**
 * §5.4: «Mover una tarjeta a "Terminado" pone el progreso al 100 %.»
 * §4.7: «Acoplamiento estado ↔ progreso, bidireccional.»
 *
 * Las columnas de abajo son las del tablero por omisión de este sistema.
 */

const BACKLOG: ColumnaDeEstado = { id: 'c0', name: 'Backlog', isInitial: true, isDone: false }
const EN_CURSO: ColumnaDeEstado = { id: 'c2', name: 'In Progress', isInitial: false, isDone: false }
const BLOQUEADAS: ColumnaDeEstado = { id: 'c3', name: 'Blockers', isInitial: false, isDone: false }
const TERMINADO: ColumnaDeEstado = { id: 'c4', name: 'Done', isInitial: false, isDone: true }
const CERRADO: ColumnaDeEstado = { id: 'c5', name: 'Closed', isInitial: false, isDone: true }

const COLUMNAS = [BACKLOG, EN_CURSO, BLOQUEADAS, TERMINADO, CERRADO]

describe('§5.2 · el avance que sale de mover una tarjeta', () => {
  it('a «Terminado» la pone al cien por cien', () => {
    expect(progresoAlMover(0.4, TERMINADO)).toBe(1)
    expect(progresoAlMover(0, TERMINADO)).toBe(1)
  })

  it('a la columna inicial la devuelve a cero', () => {
    expect(progresoAlMover(0.6, BACKLOG)).toBe(0)
    expect(progresoAlMover(1, BACKLOG)).toBe(0)
  })

  it('a una intermedia respeta lo que ya estaba capturado', () => {
    expect(progresoAlMover(0.6, EN_CURSO)).toBe(0.6)
    expect(progresoAlMover(0.01, EN_CURSO)).toBe(0.01)
    expect(progresoAlMover(0.99, EN_CURSO)).toBe(0.99)
  })

  it('a una intermedia desde cero marca el arranque, no la mitad', () => {
    // La mitad sería fabricar un dato que nadie capturó.
    expect(progresoAlMover(0, EN_CURSO)).toBe(ARRANCADA)
  })

  it('a una intermedia desde el cien por cien vuelve a marcar el arranque', () => {
    // Si estuviera terminado, no lo habrían sacado de la columna de terminados.
    expect(progresoAlMover(1, BLOQUEADAS)).toBe(ARRANCADA)
  })

  it('un avance fuera de rango no se propaga', () => {
    expect(progresoAlMover(1.7, EN_CURSO)).toBe(ARRANCADA)
    expect(progresoAlMover(-0.3, EN_CURSO)).toBe(ARRANCADA)
  })

  it('«Cerrado» también es terminal', () => {
    expect(progresoAlMover(0.2, CERRADO)).toBe(1)
  })
})

describe('§4.7 · la columna que sale de capturar avance', () => {
  it('capturar el cien por cien manda a la primera columna terminal', () => {
    // «Terminado» y no «Cerrado»: quien captura el 100 % dice lo primero.
    expect(columnaAlCambiarProgreso(1, EN_CURSO, COLUMNAS)).toBe(TERMINADO)
  })

  it('capturar cero devuelve a la columna inicial', () => {
    expect(columnaAlCambiarProgreso(0, EN_CURSO, COLUMNAS)).toBe(BACKLOG)
  })

  it('capturar entre uno y noventa y nueve saca del backlog', () => {
    expect(columnaAlCambiarProgreso(0.3, BACKLOG, COLUMNAS)).toBe(EN_CURSO)
  })

  it('capturar entre uno y noventa y nueve saca de terminados', () => {
    expect(columnaAlCambiarProgreso(0.3, TERMINADO, COLUMNAS)).toBe(EN_CURSO)
  })

  it('si la columna ya sirve, no manda mover nada', () => {
    // Devolver la misma columna haría que quien llama escribiera en la base para dejar todo igual.
    expect(columnaAlCambiarProgreso(1, TERMINADO, COLUMNAS)).toBeNull()
    expect(columnaAlCambiarProgreso(0, BACKLOG, COLUMNAS)).toBeNull()
    expect(columnaAlCambiarProgreso(0.5, EN_CURSO, COLUMNAS)).toBeNull()
  })

  it('entre varias intermedias respeta en cuál está', () => {
    // Arrastrar a «Bloqueadas» es una decisión de alguien; capturar avance no la deshace.
    expect(columnaAlCambiarProgreso(0.7, BLOQUEADAS, COLUMNAS)).toBeNull()
  })

  it('un tablero sin columna terminal no inventa una', () => {
    expect(columnaAlCambiarProgreso(1, BACKLOG, [BACKLOG, EN_CURSO])).toBeNull()
  })

  it('una línea sin columna conocida se coloca igual', () => {
    expect(columnaAlCambiarProgreso(1, undefined, COLUMNAS)).toBe(TERMINADO)
    expect(columnaAlCambiarProgreso(0.5, undefined, COLUMNAS)).toBe(EN_CURSO)
  })

  it('un avance fuera de rango se acota antes de decidir', () => {
    expect(columnaAlCambiarProgreso(1.4, EN_CURSO, COLUMNAS)).toBe(TERMINADO)
    expect(columnaAlCambiarProgreso(-1, EN_CURSO, COLUMNAS)).toBe(BACKLOG)
  })
})

describe('Encontrar lo que quedó torcido de antes', () => {
  it('al cuarenta por ciento en «Terminado» se contradice', () => {
    expect(seContradicen(0.4, TERMINADO)).toBe(true)
  })

  it('al treinta por ciento en el backlog también', () => {
    expect(seContradicen(0.3, BACKLOG)).toBe(true)
  })

  it('al cero o al cien en una intermedia también', () => {
    expect(seContradicen(0, EN_CURSO)).toBe(true)
    expect(seContradicen(1, EN_CURSO)).toBe(true)
  })

  it('lo coherente no se marca', () => {
    expect(seContradicen(1, TERMINADO)).toBe(false)
    expect(seContradicen(0, BACKLOG)).toBe(false)
    expect(seContradicen(0.5, EN_CURSO)).toBe(false)
  })
})

describe('Los dos sentidos cierran el círculo', () => {
  it('mover y volver a preguntar da la misma columna', () => {
    for (const destino of COLUMNAS) {
      const nuevoAvance = progresoAlMover(0.4, destino)
      // Tras mover, la columna donde quedó tiene que ser una que el otro sentido acepte: si no,
      // capturar avance justo después la volvería a mover sola.
      expect(columnaAlCambiarProgreso(nuevoAvance, destino, COLUMNAS)).toBeNull()
    }
  })

  it('capturar avance y mirar el avance de esa columna tampoco entra en bucle', () => {
    for (const avance of [0, ARRANCADA, 0.5, 1]) {
      const destino = columnaAlCambiarProgreso(avance, undefined, COLUMNAS)
      if (!destino) continue
      expect(seContradicen(progresoAlMover(avance, destino), destino)).toBe(false)
    }
  })
})

/**
 * Las columnas con las que nace el tablero de un proyecto.
 *
 * Vivían duplicadas en dos servicios —el que crea proyectos y el que importa planes— y una tercera
 * copia iba a nacer con los indicadores nuevos. Con `isInitial` e `isDone` en juego eso ya no es una
 * molestia estética: si un servicio los pone y el otro no, la mitad de los proyectos tendría un
 * tablero donde mover a «Terminado» no marca nada, y el fallo aparecería semanas después.
 */

import { KanbanColumnType } from '@/types'

export interface ColumnaPorOmision {
  readonly name: string
  readonly order: number
  readonly columnType: KanbanColumnType
  readonly isInitial: boolean
  readonly isDone: boolean
}

/**
 * Exactamente una inicial y una terminal.
 *
 * «Bloqueadas» no es terminal aunque suene a final de camino: una línea bloqueada sigue en juego, y
 * marcarla como terminada le pondría el avance al cien por cien, que es lo contrario de la verdad.
 */
export const COLUMNAS_POR_OMISION: readonly ColumnaPorOmision[] = [
  { name: 'Backlog', order: 0, columnType: KanbanColumnType.BACKLOG, isInitial: true, isDone: false },
  { name: 'To Do', order: 1, columnType: KanbanColumnType.TODO, isInitial: false, isDone: false },
  { name: 'In Progress', order: 2, columnType: KanbanColumnType.IN_PROGRESS, isInitial: false, isDone: false },
  { name: 'Blockers', order: 3, columnType: KanbanColumnType.BLOCKED, isInitial: false, isDone: false },
  { name: 'Done', order: 4, columnType: KanbanColumnType.DONE, isInitial: false, isDone: true },
]

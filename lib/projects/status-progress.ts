/**
 * El acoplamiento entre estado y avance (§4.7, §5.2).
 *
 * Son dos campos que dicen lo mismo con distintas palabras, y el spec los ata en los dos sentidos:
 * `Abierto = 0 %` · `En progreso = 1–99 %` · `Terminado = 100 %`. Cambiar uno actualiza el otro.
 *
 * ## Por qué esto es una regla y no un detalle de la pantalla
 *
 * Sin el acoplamiento, un tablero acaba lleno de tarjetas en la columna «Terminado» con el avance
 * al 40 %, y entonces cada informe da un número distinto según de qué campo lo saque. Peor: nadie
 * sabe cuál de los dos miente. Atarlos es lo que hace que «¿cuánto llevamos?» tenga una respuesta.
 *
 * ## La regla del estado intermedio
 *
 * Mover a «En progreso» algo que iba al 0 % lo pone al 1 %, no al 50 %. El 1 % es lo mínimo que
 * significa «esto ya arrancó» sin inventarse cuánto se lleva hecho; poner la mitad sería fabricar
 * un dato que nadie capturó. Y algo que ya iba al 60 % se queda en 60: mover la tarjeta a la
 * columna donde ya estaba conceptualmente no puede borrar lo que alguien midió.
 *
 * ## Las unidades
 *
 * El avance entra y sale de 0 a 1, que es como lo guarda `WorkItem.progressPct`. Las conversiones a
 * porcentaje se hacen al dibujar.
 */

/** Lo mínimo que hace falta saber de una columna del tablero para aplicar la regla. */
export interface ColumnaDeEstado {
  readonly id: string
  readonly name: string
  /** Verdadero en la columna donde nace una línea. Es el «Abierto» del spec. */
  readonly isInitial: boolean
  /** Verdadero en las columnas que significan que la línea ya no está en juego. */
  readonly isDone: boolean
}

/** El mínimo que significa «esto ya arrancó»: un uno por ciento. */
export const ARRANCADA = 0.01

/**
 * Qué avance le corresponde a una línea al caer en una columna.
 *
 * @param progresoActual De 0 a 1.
 * @returns El avance nuevo, de 0 a 1.
 */
export function progresoAlMover(progresoActual: number, destino: ColumnaDeEstado): number {
  if (destino.isDone) return 1
  if (destino.isInitial) return 0

  // Columna intermedia: se respeta lo capturado si ya estaba en marcha, y si no, se marca el
  // arranque. Un 100 % que cae en una columna intermedia vuelve a estar en marcha: si estuviera
  // terminado no lo habrían sacado de la columna de terminados.
  const acotado = Math.min(1, Math.max(0, progresoActual))
  return acotado > 0 && acotado < 1 ? acotado : ARRANCADA
}

/**
 * En qué columna debe estar una línea con ese avance.
 *
 * El otro sentido del acoplamiento (§4.7): capturar 100 % en la rejilla mueve la tarjeta a
 * «Terminado» sin que nadie la arrastre.
 *
 * @returns La columna que corresponde, o `null` si la que ya tiene sirve — así quien llama no
 *   escribe en la base para dejar todo como estaba.
 */
export function columnaAlCambiarProgreso(
  progreso: number,
  columnaActual: ColumnaDeEstado | undefined,
  columnas: readonly ColumnaDeEstado[],
): ColumnaDeEstado | null {
  const acotado = Math.min(1, Math.max(0, progreso))

  if (acotado >= 1) {
    if (columnaActual?.isDone) return null
    // La primera de las terminales por orden de llegada: un proyecto puede tener «Terminado» y
    // «Cerrado», y quien acaba de capturar el 100 % está diciendo lo primero, no lo segundo.
    return columnas.find((c) => c.isDone) ?? null
  }

  if (acotado <= 0) {
    if (columnaActual?.isInitial) return null
    return columnas.find((c) => c.isInitial) ?? null
  }

  // Entre 1 y 99: cualquier columna intermedia sirve, así que sólo se mueve si la actual no lo es.
  // Si alguien tiene tres columnas intermedias, arrastrar entre ellas es una decisión suya que
  // capturar avance no debe deshacer.
  if (columnaActual && !columnaActual.isInitial && !columnaActual.isDone) return null
  return columnas.find((c) => !c.isInitial && !c.isDone) ?? null
}

/**
 * ¿La columna y el avance se contradicen?
 *
 * Sirve para encontrar lo que quedó torcido antes de que existiera el acoplamiento, sin arreglarlo
 * por la espalda: una línea al 40 % en «Terminado» es un dato que alguien tiene que mirar, no algo
 * que un proceso deba corregir en silencio inventando cuál de los dos campos tenía razón.
 */
export function seContradicen(progreso: number, columna: ColumnaDeEstado): boolean {
  const acotado = Math.min(1, Math.max(0, progreso))
  if (columna.isDone) return acotado < 1
  if (columna.isInitial) return acotado > 0
  return acotado <= 0 || acotado >= 1
}

/**
 * Qué estado le corresponde a una línea que cae en esta columna.
 *
 * El estado sigue siendo un vocabulario cerrado —lo leen la urgencia, el panel de control y los
 * informes— pero deja de decidir a qué columna se puede ir. Es al revés: la columna es lo
 * configurable, y de lo que significa se deriva el estado.
 *
 * Una columna que alguien añada al tablero cae en `IN_PROGRESS` salvo que se haya marcado como
 * inicial o terminal. Es lo único cierto que se puede decir de ella: hay trabajo ahí y no ha
 * acabado.
 */
export function estadoDeLaColumna(columna: {
  readonly isInitial: boolean
  readonly isDone: boolean
  readonly columnType?: string | null
}): 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' {
  if (columna.isDone) return 'DONE'
  if (columna.isInitial) return 'BACKLOG'

  // Si la columna trae uno de los tipos de siempre, se respeta: distingue «Por hacer» de «En
  // curso» y de «Bloqueadas», que para la urgencia y para el panel no son lo mismo.
  const tipo = columna.columnType
  if (tipo === 'TODO' || tipo === 'IN_PROGRESS' || tipo === 'BLOCKED') return tipo
  return 'IN_PROGRESS'
}

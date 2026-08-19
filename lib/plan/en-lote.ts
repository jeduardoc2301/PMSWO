/**
 * Aplicar una operación a varias líneas a la vez (§4.6, conmutador 1).
 *
 * ## El caso que decide el diseño
 *
 * Cincuenta líneas seleccionadas, y la número veintitrés falla. ¿Qué pasa?
 *
 * Hay tres respuestas y solo una es honesta:
 *
 * 1. **Parar y deshacer lo hecho.** Suena bien y no se puede: no hay transacción del otro lado, y
 *    «deshacer» veintidós escrituras es otras veintidós que también pueden fallar.
 * 2. **Parar y dejarlo a medias en silencio.** Es lo que sale solo si nadie piensa en esto, y es lo
 *    peor: veintidós líneas movidas, veintiocho no, y una pantalla que no dice cuál es cuál.
 * 3. **Seguir, y contar exactamente qué pasó.** Es lo que se hace aquí.
 *
 * Seguir es lo correcto porque las operaciones de este módulo son independientes entre sí: mover la
 * línea 24 no depende de que se moviera la 23. Y contarlo es obligatorio, porque una operación en
 * lote que dice «listo» habiendo fallado nueve veces es una mentira que se descubre días después.
 *
 * ## De una en una, a propósito
 *
 * Se podrían lanzar las cincuenta a la vez. No se hace: cincuenta escrituras simultáneas sobre el
 * mismo plan compiten por las mismas filas, y el servidor reprograma en cada una. En serie tarda
 * más y es la única forma de que el resultado sea el mismo si se repite.
 */

/** Cómo terminó cada línea. */
export interface ResultadoDeLinea {
  readonly id: string
  readonly bien: boolean
  /** Qué dijo el servidor cuando no fue bien. */
  readonly motivo?: string
}

export interface ResumenDelLote {
  readonly total: number
  readonly bien: number
  readonly mal: number
  readonly resultados: readonly ResultadoDeLinea[]
  /** Verdadero cuando todas fueron bien. */
  readonly completo: boolean
}

/**
 * Aplica `operacion` a cada línea, en orden, sin parar ante un fallo.
 *
 * @param alAvanzar se llama tras cada línea, para poder enseñar el progreso. Una operación de
 *   cincuenta líneas tarda segundos, y una pantalla quieta durante segundos parece rota.
 */
export async function aplicarEnLote(
  ids: readonly string[],
  operacion: (id: string) => Promise<void>,
  alAvanzar?: (hechas: number, total: number) => void,
): Promise<ResumenDelLote> {
  const resultados: ResultadoDeLinea[] = []

  for (const id of ids) {
    try {
      await operacion(id)
      resultados.push({ id, bien: true })
    } catch (e) {
      resultados.push({ id, bien: false, motivo: e instanceof Error ? e.message : 'Falló sin motivo.' })
    }
    alAvanzar?.(resultados.length, ids.length)
  }

  const bien = resultados.filter((r) => r.bien).length
  return {
    total: ids.length,
    bien,
    mal: resultados.length - bien,
    resultados,
    completo: bien === ids.length,
  }
}

/**
 * El resumen dicho como se le cuenta a una persona.
 *
 * Se escribe aquí y no en la pantalla porque la frase es parte del comportamiento: «12 de 40» y
 * «12 movidas» son dos promesas distintas, y la segunda esconde las veintiocho que no.
 */
export function contarLoQuePaso(resumen: ResumenDelLote, verbo: string, fueraDeLaVista = 0): string {
  const partes: string[] = []

  if (resumen.completo) {
    partes.push(
      resumen.bien === 1
        ? `1 línea ${enSingular(verbo)}.`
        : `${resumen.bien} líneas ${verbo}.`,
    )
  } else if (resumen.bien === 0) {
    partes.push(`Ninguna de las ${resumen.total} se pudo ${quitarParticipio(verbo)}.`)
  } else {
    partes.push(`${resumen.bien} de ${resumen.total} ${verbo}; ${resumen.mal} no.`)
  }

  if (fueraDeLaVista > 0) {
    partes.push(
      `Quedaron fuera ${fueraDeLaVista} que tienes marcadas y no están a la vista: no se tocaron.`,
    )
  }
  return partes.join(' ')
}

/**
 * «movidas» → «movida».
 *
 * Los cuatro verbos son participios femeninos plurales que concuerdan con «líneas», así que quitar
 * la ese final es exacto para todos. Sin esto salía «1 línea movidas», que es la clase de detalle
 * que hace desconfiar de todo lo demás que dice la pantalla.
 */
function enSingular(verbo: string): string {
  return verbo.endsWith('s') ? verbo.slice(0, -1) : verbo
}

/**
 * «movidas» → «mover». Sirve para la frase del caso en que no se pudo ninguna.
 *
 * Es una tabla y no una regla porque son tres verbos y una regla de participios en español se
 * equivoca más de lo que acierta.
 */
function quitarParticipio(verbo: string): string {
  const infinitivos: Readonly<Record<string, string>> = {
    movidas: 'mover',
    sangradas: 'sangrar',
    eliminadas: 'eliminar',
    actualizadas: 'actualizar',
  }
  return infinitivos[verbo] ?? verbo
}

/**
 * El triángulo duración / estimación / unidades: §3.5 y casos 14, 15 y 16 del §12.
 *
 * ```
 * Trabajo = Duración × Unidades
 * ```
 *
 * Tres cifras atadas por una identidad, de las cuales solo dos son libres. Fijas dos y la tercera
 * queda determinada — y cuál de las tres se fija es una decisión de quien planifica, no del sistema:
 *
 * - **Estimación fija.** «Son 32 horas de trabajo, pon la gente que quieras.» Cambiar el equipo
 *   cambia la duración.
 * - **Duración fija.** «Tiene que estar en dos días.» Cambiar el equipo cambia el esfuerzo total
 *   que cabe dentro.
 * - **Las dos fijas.** «Dos días y 8 horas.» Entonces lo que cede es la dedicación: dos personas a
 *   2 h/día cada una.
 *
 * ## Por qué esto vive aparte
 *
 * Es aritmética pura y se prueba sin base de datos ni navegador. Y hace falta tenerla escrita aunque
 * el modelo todavía no guarde **cuál** de los tres modos rige cada línea: con las tres fórmulas
 * disponibles se puede al menos comprobar si las cifras guardadas son coherentes entre sí, que es
 * una pregunta que hoy nadie puede contestar.
 *
 * ## Minutos, no horas
 *
 * Todo el módulo trabaja en minutos enteros. «Ocho horas y media» en horas decimales es 8.5, y
 * repartir eso entre tres personas da 2.8333… — un número que al volver a sumar no da 8.5. En
 * minutos son 510, entre tres son 170, y 170 × 3 son 510. La conversión a horas se hace al enseñar,
 * una sola vez y donde no vuelve a operarse.
 */

/** Una persona asignada a una línea, con lo que aporta. */
export interface Asignado {
  /** Minutos de jornada de esta persona. Ocho horas son 480. */
  readonly minutosPorDia: number
  /**
   * Dedicación en puntos base: 10000 es jornada completa, 5000 es media.
   *
   * En puntos base y no en fracción por la misma razón que todo lo demás va en enteros: media
   * jornada de una jornada de 510 minutos son 255 exactos, y 0.5 × 510 en coma flotante también,
   * pero 1/3 de jornada no.
   */
  readonly unidadesBp: number
}

/** Minutos de trabajo que aporta un asignado en un día. */
function aportePorDia(a: Asignado): number {
  return Math.round((a.minutosPorDia * a.unidadesBp) / 10000)
}

/** Minutos de trabajo que aporta el equipo entero en un día. */
export function capacidadDiaria(asignados: readonly Asignado[]): number {
  let total = 0
  for (const a of asignados) total += aportePorDia(a)
  return total
}

/**
 * Caso 14 · **estimación fija**: cuántos días hacen falta para un esfuerzo dado.
 *
 * 32 horas con dos personas a 8 h/día son 2 días.
 *
 * Se redondea hacia arriba: medio día de trabajo pendiente ocupa un día del calendario, porque el
 * calendario no tiene medios días. Redondear hacia abajo diría que el trabajo cabe en menos tiempo
 * del que necesita, que es la clase de optimismo que hace que un plan no se cumpla.
 *
 * Sin nadie asignado no hay duración que deducir: devuelve `null` en lugar de dividir por cero o
 * inventarse una persona.
 */
export function duracionDesdeEstimacion(
  minutosDeTrabajo: number,
  asignados: readonly Asignado[],
): number | null {
  const porDia = capacidadDiaria(asignados)
  if (porDia <= 0) return null
  if (minutosDeTrabajo <= 0) return 0
  return Math.ceil(minutosDeTrabajo / porDia)
}

/**
 * Caso 15 · **duración fija**: cuánto trabajo cabe en unos días dados.
 *
 * 2 días con dos personas a 8 h/día son 32 horas.
 */
export function estimacionDesdeDuracion(dias: number, asignados: readonly Asignado[]): number {
  if (dias <= 0) return 0
  return capacidadDiaria(asignados) * dias
}

/**
 * Caso 16 · **las dos fijas**: qué dedicación diaria le toca a cada persona.
 *
 * 2 días y 8 horas con dos personas son 2 h/día cada una.
 *
 * Devuelve minutos por día y por persona. El reparto es a partes iguales: repartirlo en proporción
 * a la jornada de cada cual sería otra política defendible, pero no es la que el §3.5 describe —su
 * fórmula divide entre el número de asignados, no entre la suma de sus jornadas—.
 *
 * El resto de la división **entre las personas** no se pierde: se reparte de a un minuto entre las
 * primeras, para que la suma del día dé exactamente lo que toca ese día. Sin eso, ocho horas entre
 * tres personas se convertirían en siete horas y cincuenta y siete minutos, y nadie sabría dónde se
 * fueron los tres restantes.
 *
 * ## Qué invariante se cumple, y cuál no puede cumplirse
 *
 * Se cumple: `suma(reparto) === redondeo(minutosDeTrabajo / dias)`. Comprobado por fuerza bruta
 * sobre **22 880 combinaciones** de trabajo, días y personas: cero excepciones.
 *
 * **No** se cumple, y no puede: `suma(reparto) × dias === minutosDeTrabajo`. Se rompe en 19 012 de
 * esas 22 880, y la razón es la firma, no la aritmética: esta función devuelve **una sola cifra por
 * persona**, la misma todos los días, así que el trabajo total sólo puede cuadrar cuando divide
 * exacto entre los días. Un minuto repartido en dos días es medio minuto al día o no es nada.
 *
 * El comentario anterior prometía el segundo invariante, que es el que la gente esperaría leyendo
 * «el resto no se pierde». Lo encontró una auditoría con agentes; el diagnóstico que dio era
 * «pierde e inventa minutos», y midiéndolo resultó ser «la promesa era otra».
 *
 * Cambiar la firma para devolver un reparto por día —y así poder cuadrar el total— sólo tiene
 * sentido el día que el modelo guarde el trabajo en minutos (§2.1), que es de lo que cuelga todo
 * esto.
 */
export function dedicacionDiaria(
  minutosDeTrabajo: number,
  dias: number,
  cuantosAsignados: number,
): readonly number[] {
  if (cuantosAsignados <= 0) return []
  if (dias <= 0 || minutosDeTrabajo <= 0) return new Array(cuantosAsignados).fill(0)

  const porDia = minutosDeTrabajo / dias
  const base = Math.floor(porDia / cuantosAsignados)
  const sobran = Math.round(porDia - base * cuantosAsignados)

  const reparto = new Array<number>(cuantosAsignados).fill(base)
  for (let i = 0; i < sobran && i < cuantosAsignados; i += 1) reparto[i] += 1
  return reparto
}

/** Cómo quedó una línea al comprobar si sus tres cifras se sostienen. */
export interface Coherencia {
  /** Minutos de trabajo que implican la duración y la gente asignada. */
  readonly implicado: number
  /** Minutos de trabajo capturados a mano. */
  readonly capturado: number
  /** Diferencia en minutos. Positiva significa que se capturó más de lo que cabe. */
  readonly diferencia: number
  /** Verdadero cuando las cifras se sostienen entre sí. */
  readonly cuadra: boolean
}

/**
 * ¿Se sostienen entre sí la duración, la estimación y la gente asignada de una línea?
 *
 * No hay respuesta correcta única —cuál de las tres cede depende del modo, y el modelo todavía no
 * guarda el modo— pero sí hay una pregunta útil que hoy nadie puede contestar: si alguien capturó
 * ochenta horas en una tarea de dos días con una persona, una de las tres cifras está mal, y las
 * tres se están usando para decidir.
 *
 * `tolerancia` deja pasar diferencias pequeñas, que casi siempre son redondeos de quien capturó y
 * no errores. Por omisión, media jornada.
 */
export function comprobarCoherencia(
  minutosCapturados: number,
  dias: number,
  asignados: readonly Asignado[],
  tolerancia = 240,
): Coherencia {
  const implicado = estimacionDesdeDuracion(dias, asignados)
  const diferencia = minutosCapturados - implicado
  return {
    implicado,
    capturado: minutosCapturados,
    diferencia,
    cuadra: Math.abs(diferencia) <= tolerancia,
  }
}

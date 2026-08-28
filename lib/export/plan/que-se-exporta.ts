/**
 * Qué se lleva la exportación: la regla «lo que se ve es lo que baja».
 *
 * Son cuatro líneas y vive aparte por una razón concreta: mientras estuvo dentro de un `useMemo`
 * de `plan-workspace.tsx` —un componente de mil doscientas líneas que ninguna prueba monta— la
 * regla no estaba protegida por nada. Se comprobó de la forma dura: cambiarla para que exportara
 * SIEMPRE el plan entero, ignorando a la vez el filtro y el nivel de detalle, dejaba las 4 265
 * pruebas en verde. No es que su resultado no se comprobara; es que la línea no llegaba a correr.
 *
 * La regla en sí es la promesa más simple que puede hacer un botón de exportar: que baje lo que hay
 * delante. Filtro y nivel de detalle plegado incluidos, porque los dos cambian lo que se ve.
 */

export interface QueSeExporta {
  /**
   * Los identificadores a pedir, o `null` para el plan entero.
   *
   * `null` no es «no hay nada»: es «no hace falta la lista». El servidor lo entiende, y así una
   * descarga sin recortes no arrastra mil trescientos identificadores por la red.
   */
  readonly ids: string[] | null
  /** Cuántas líneas van a salir. Es el número que el rótulo enseña, del mismo cálculo. */
  readonly cuantas: number
}

/**
 * @param idsVisibles Las filas que la rejilla está dibujando, en su orden.
 * @param totalDelPlan Cuántas líneas tiene el plan completo.
 */
export function queSeExporta(
  idsVisibles: readonly string[],
  totalDelPlan: number,
): QueSeExporta {
  // Sólo cuando se ve el plan entero se manda `null`. Cualquier recorte —de filtro o de plegado—
  // viaja como lista, para que el archivo no pueda traer más de lo que había en pantalla.
  return idsVisibles.length === totalDelPlan
    ? { ids: null, cuantas: totalDelPlan }
    : { ids: [...idsVisibles], cuantas: idsVisibles.length }
}

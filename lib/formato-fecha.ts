/**
 * Cómo se enseña una fecha del plan.
 *
 * ## Por qué no se usa `Intl.DateTimeFormat` sobre un `Date`
 *
 * Las fechas del plan son **civiles**: «el 12 de junio», no «el 12 de junio a las cero horas en
 * algún huso». La base las devuelve como instantes ISO en UTC. Al construir un `Date` y formatearlo,
 * el formateador traduce ese instante al huso de quien mira, y en cualquier huso al oeste de
 * Greenwich —Bolivia está en UTC-4— la medianoche UTC cae la tarde del día anterior.
 *
 * Eso no es una imprecisión de horas: cambia el día. Se vio en pantalla comparando la misma línea
 * en dos vistas del mismo proyecto: el panel del Gantt decía «Del 2026-06-12 al 2026-06-18» —fechas
 * del motor, que trabaja en ordinales de día hábil y no toca el reloj— y la Lista decía «11/06/2026
 * — 17/06/2026». Un día antes, las dos verosímiles, y ninguna manera de saber cuál creer.
 *
 * Aquí no hay `Date`: se parten los diez primeros caracteres de la cadena ISO, que son la fecha
 * civil tal como se guardó, y se recomponen. Sin husos no hay corrimiento posible.
 */

/** Los diez primeros caracteres de un ISO son la fecha civil: `AAAA-MM-DD`. */
function partes(iso: string): readonly [string, string, string] | null {
  if (iso.length < 10) return null
  const a = iso.slice(0, 4)
  const m = iso.slice(5, 7)
  const d = iso.slice(8, 10)
  if (iso.charAt(4) !== '-' || iso.charAt(7) !== '-') return null
  if (!/^\d{4}$/.test(a) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) return null
  return [a, m, d]
}

/**
 * `2026-06-12T00:00:00.000Z` → `12/06/2026`.
 *
 * Devuelve `null` cuando no hay fecha o la cadena no es una fecha: quien dibuja decide qué poner en
 * el hueco, que no siempre es lo mismo —una raya en una tabla, nada en una tarjeta—.
 */
export function fechaCorta(iso: string | null | undefined): string | null {
  if (!iso) return null
  const p = partes(iso)
  return p === null ? null : `${p[2]}/${p[1]}/${p[0]}`
}

/**
 * `2026-06-12T00:00:00.000Z` → `2026-06-12`.
 *
 * La forma que habla el motor. Sirve para comparar lo que guardó la base con lo que programó el
 * plan sin que la comparación dependa del huso de quien mira.
 */
export function fechaIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const p = partes(iso)
  return p === null ? null : `${p[0]}-${p[1]}-${p[2]}`
}

/**
 * Hoy, en fecha civil `AAAA-MM-DD`, con la aritmética local de quien mira.
 *
 * **No** con `toISOString().slice(0, 10)`, que devuelve el día en UTC: de noche en cualquier huso
 * negativo —Bolivia lo es— eso da mañana. El calendario marca un día del calendario de quien mira,
 * y una tarea que vence hoy no puede aparecer vencida a las nueve de la noche.
 *
 * Estaba escrita tres veces, en tres archivos distintos, con tres comentarios que decían lo mismo.
 * Tres copias de una regla son tres oportunidades de que una se quede atrás.
 */
export function hoyCivil(ahora: Date = new Date()): string {
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${ahora.getFullYear()}-${mes}-${dia}`
}

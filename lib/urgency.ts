export type Urgency = 'overdue' | 'soon' | 'stale' | 'blocked' | null

/**
 * Lee una fecha civil `AAAA-MM-DD` a medianoche **local**.
 *
 * `new Date('2026-06-08')` no sirve: la norma dice que una fecha sin hora se lee en UTC, así que
 * al oeste de Greenwich el objeto cae en el día anterior y una línea que vence hoy aparece vencida
 * ayer. El día del calendario es el de quien mira la pantalla.
 */
function aFechaLocal(fecha: string): Date {
  const [anio, mes, dia] = fecha.slice(0, 10).split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

/** Estados en los que una línea ya no puede estar atrasada porque ya no está en juego. */
const ESTADOS_TERMINALES = new Set(['DONE', 'CLOSED', 'CANCELLED'])

/**
 * ¿Esta línea ya salió de juego?
 *
 * Se exporta porque quien dibuja una tarjeta necesita la misma respuesta: hasta ahora este archivo
 * tenía **dos** definiciones de «terminada» —`isOverdue` miraba el conjunto entero y
 * `computeUrgency` comparaba sólo con `DONE`— y una línea `CLOSED` con la fecha pasada se colaba
 * por la rendija y acababa etiquetada «vence pronto».
 */
export function estaTerminada(status: string): boolean {
  return ESTADOS_TERMINALES.has(status)
}

/**
 * ¿Esta línea está atrasada?
 *
 * Una sola definición, consumida por el resaltado de la lista y por el contador del panel de
 * control. El §9.3 pide que ambos coincidan exactamente, y la única forma de que coincidan el día
 * que alguien cambie el criterio es que no haya dos criterios.
 *
 * Atrasada = su fecha de fin ya pasó, no está terminada y no llegó al 100 %. Estar bloqueada no la
 * salva: un bloqueo explica el atraso, no lo cancela. (`computeUrgency` sí antepone el bloqueo,
 * pero eso es una prioridad de qué etiqueta enseñar, no una definición distinta de atraso.)
 *
 * @param hoy Fecha civil de referencia. Entra por parámetro para que la función sea comprobable.
 */
export function isOverdue(
  item: { estimatedEndDate?: string | null; status: string; progressPct?: number | null },
  hoy: Date = new Date(),
): boolean {
  if (!item.estimatedEndDate) return false
  if (ESTADOS_TERMINALES.has(item.status)) return false
  if ((item.progressPct ?? 0) >= 1) return false

  const corte = new Date(hoy)
  corte.setHours(0, 0, 0, 0)
  return aFechaLocal(item.estimatedEndDate).getTime() < corte.getTime()
}

export interface UrgencyResult {
  urgency: Urgency
  daysFromDue: number | null
  daysStale: number | null
}

/**
 * Qué etiqueta de urgencia le toca a una línea.
 *
 * @param hoy Fecha civil de referencia. Entra por parámetro por la misma razón que en `isOverdue`:
 *   sin ella la función no se puede probar, y de hecho no tenía ni una prueba. Dos defectos vivieron
 *   ahí dentro hasta que se vieron en una tarjeta.
 */
export function computeUrgency(
  item: {
    estimatedEndDate?: string
    status: string
    activeBlockers?: number
    lastUpdatedAt?: string
    priority: string
  },
  hoy: Date = new Date(),
): UrgencyResult {
  const now = new Date(hoy)
  now.setHours(0, 0, 0, 0)

  const due = item.estimatedEndDate ? aFechaLocal(item.estimatedEndDate) : null

  const done = estaTerminada(item.status)
  const blocked = (item.activeBlockers ?? 0) > 0

  let daysFromDue: number | null = null
  if (due) {
    daysFromDue = Math.round((due.getTime() - now.getTime()) / 86400000)
  }

  let daysStale: number | null = null
  if (item.lastUpdatedAt) {
    const lastUpdated = new Date(item.lastUpdatedAt)
    lastUpdated.setHours(0, 0, 0, 0)
    daysStale = Math.round((now.getTime() - lastUpdated.getTime()) / 86400000)
  }

  if (done) return { urgency: null, daysFromDue, daysStale: null }
  if (blocked) return { urgency: 'blocked', daysFromDue, daysStale: null }
  if (isOverdue(item, now)) return { urgency: 'overdue', daysFromDue, daysStale: null }
  if (due && daysFromDue! <= 2) return { urgency: 'soon', daysFromDue, daysStale: null }

  // Stale: stuck in BACKLOG/TODO with no updates for N days
  const threshold = item.priority === 'HIGH' || item.priority === 'CRITICAL' ? 7 : 14
  if ((item.status === 'BACKLOG' || item.status === 'TODO') && daysStale !== null && daysStale >= threshold) {
    return { urgency: 'stale', daysFromDue, daysStale }
  }

  return { urgency: null, daysFromDue, daysStale }
}

export function urgencyDueLabel(daysFromDue: number | null): string {
  if (daysFromDue === null) return ''
  if (daysFromDue < 0) return `${Math.abs(daysFromDue)}d vencida`
  if (daysFromDue === 0) return 'Hoy'
  if (daysFromDue === 1) return 'Mañana'
  return `en ${daysFromDue}d`
}

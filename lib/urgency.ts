export type Urgency = 'overdue' | 'soon' | 'stale' | 'blocked' | null

export interface UrgencyResult {
  urgency: Urgency
  daysFromDue: number | null
  daysStale: number | null
}

export function computeUrgency(item: {
  estimatedEndDate?: string
  status: string
  activeBlockers?: number
  lastUpdatedAt?: string
  priority: string
}): UrgencyResult {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const due = item.estimatedEndDate ? new Date(item.estimatedEndDate) : null
  if (due) due.setHours(0, 0, 0, 0)

  const done = item.status === 'DONE'
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
  if (due && daysFromDue! < 0) return { urgency: 'overdue', daysFromDue, daysStale: null }
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

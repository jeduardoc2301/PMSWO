/**
 * Las cifras del reporte, calculadas en un solo lugar.
 *
 * Vivían dentro del handler del DOCX. Salieron de ahí cuando apareció el correo diario: dos
 * consumidores calculando "porcentaje de avance" por su cuenta terminan, tarde o temprano,
 * mandando dos números distintos del mismo proyecto el mismo día —y el que recibe los dos no
 * tiene forma de saber cuál creer. Se calculan aquí y se le entregan hechas al modelo, que
 * argumenta sobre ellas en vez de inventarlas.
 *
 * Nada aquí toca la base ni la red: recibe filas y devuelve números, que es lo que lo hace
 * verificable con una prueba y reutilizable desde un job sin sesión.
 */

export interface SnapshotWorkItem {
  title: string
  status: string
  phase?: string | null
  estimatedEndDate: Date
  completedAt?: Date | null
}

export interface SnapshotBlocker {
  description: string
  severity: string
  resolvedAt?: Date | null
}

export interface SnapshotRisk {
  description: string
  riskLevel: string
  status: string
}

export interface SnapshotProject {
  name: string
  client: string
  status: string
  startDate: Date
  estimatedEndDate: Date
}

export interface SnapshotInput {
  project: SnapshotProject
  workItems: SnapshotWorkItem[]
  blockers: SnapshotBlocker[]
  risks: SnapshotRisk[]
  now?: Date
}

export interface OverdueItem {
  title: string
  phase: string | null
  daysLate: number
}

export interface ProjectSnapshot {
  now: Date
  total: number
  done: number
  /** Vencidas, de la más atrasada a la menos. */
  overdue: OverdueItem[]
  totalDays: number
  elapsedDays: number
  remainingDays: number
  /** Porcentaje de tareas cerradas. */
  scopePct: number
  /** Porcentaje del calendario consumido. */
  timePct: number
  /**
   * Alcance sobre calendario. Por debajo de 1 el proyecto avanza más lento de lo que corre el
   * reloj. Es el único número del reporte que no se puede leer de dos maneras.
   */
  progressIndex: number
  byStatus: Record<string, number>
  openBlockers: SnapshotBlocker[]
  openRisks: SnapshotRisk[]
}

/** Días calendario entre dos fechas, redondeados. */
function days(a: Date, b: Date): number {
  return Math.round((+a - +b) / 86400000)
}

export function buildProjectSnapshot(input: SnapshotInput): ProjectSnapshot {
  const { project, workItems: items, blockers, risks } = input
  const now = input.now ?? new Date()

  const total = items.length
  const done = items.filter((w) => w.status === 'DONE' || w.completedAt).length

  const overdue = items
    .filter((w) => w.status !== 'DONE' && !w.completedAt && w.estimatedEndDate < now)
    .sort((a, b) => +a.estimatedEndDate - +b.estimatedEndDate)
    .map((w) => ({
      title: w.title,
      phase: w.phase ?? null,
      daysLate: days(now, w.estimatedEndDate),
    }))

  // El mínimo de 1 evita dividir entre cero en un proyecto que empieza y termina el mismo día.
  const totalDays = Math.max(1, days(project.estimatedEndDate, project.startDate))
  // Acotado por los dos lados: antes de arrancar no se ha consumido calendario, y después de la
  // fecha comprometida el consumo se queda en 100 % en vez de dispararse a 340 %.
  const elapsedDays = Math.max(0, Math.min(totalDays, days(now, project.startDate)))

  const scopePct = total ? (done / total) * 100 : 0
  const timePct = (elapsedDays / totalDays) * 100

  const byStatus = items.reduce<Record<string, number>>((acc, w) => {
    acc[w.status] = (acc[w.status] ?? 0) + 1
    return acc
  }, {})

  return {
    now,
    total,
    done,
    overdue,
    totalDays,
    elapsedDays,
    remainingDays: Math.max(0, days(project.estimatedEndDate, now)),
    scopePct: Number(scopePct.toFixed(1)),
    timePct: Number(timePct.toFixed(1)),
    // Sin calendario consumido todavía no hay atraso posible, así que el índice arranca en 1.
    progressIndex: Number((timePct > 0 ? scopePct / timePct : 1).toFixed(2)),
    byStatus,
    openBlockers: blockers.filter((b) => !b.resolvedAt),
    openRisks: risks.filter((r) => r.status !== 'CLOSED'),
  }
}

/**
 * Las mismas cifras, con los nombres que espera el prompt de `generateExecutiveBrief`.
 *
 * Las llaves están en español a propósito: el modelo escribe en español y acierta más cuando los
 * datos no le llegan traducidos a medias.
 */
export function toBriefFacts(
  project: SnapshotProject,
  snap: ProjectSnapshot
): Record<string, unknown> {
  return {
    proyecto: project.name,
    cliente: project.client,
    ventana: `${project.startDate.toISOString().slice(0, 10)} → ${project.estimatedEndDate.toISOString().slice(0, 10)}`,
    diasTotales: snap.totalDays,
    diasTranscurridos: snap.elapsedDays,
    diasRestantes: snap.remainingDays,
    tareasTotales: snap.total,
    tareasCerradas: snap.done,
    pctAlcance: snap.scopePct,
    pctCalendario: snap.timePct,
    indiceAvance: snap.progressIndex,
    tareasVencidas: snap.overdue.length,
    vencidasTop: snap.overdue.slice(0, 10).map((w) => ({
      tarea: w.title,
      fase: w.phase,
      diasAtraso: w.daysLate,
    })),
    porEstado: snap.byStatus,
    bloqueosAbiertos: snap.openBlockers.map((b) => ({
      descripcion: b.description,
      severidad: b.severity,
    })),
    riesgosAbiertos: snap.openRisks.map((r) => ({
      descripcion: r.description,
      nivel: r.riskLevel,
    })),
  }
}

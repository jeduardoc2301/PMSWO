/**
 * Todo lo que el reporte ejecutivo necesita saber, reunido en un solo objeto.
 *
 * Es la capa que va a la base y corre el motor. Nada de esto decide cómo se ve el correo; eso es
 * `lib/reports/correo-ejecutivo.ts`. Separado a propósito: la forma de las cifras se prueba sin
 * maquetar nada, y el maquetado se prueba sin base de datos.
 *
 * ## De dónde sale cada cifra, y por qué de ahí
 *
 * El avance sale del **Panel** (`loadProjectDashboard`), que ya lo pondera por duración hábil
 * sobre hojas. No se recalcula aquí. Es la regla más importante de este archivo: una sola fuente
 * por cifra. Cuando el correo y la pantalla dan números distintos del mismo proyecto el mismo día,
 * quien recibe los dos no tiene forma de saber cuál creer, y deja de creer los dos.
 *
 * Los atrasos salen de `calcularAtrasos`, que trabaja solo sobre hojas y en días hábiles.
 *
 * La respuesta al «¿llegamos?» sale de `construirInformeDelPlan`, que corre el motor y además
 * proyecta el cierre — porque el motor a secas siempre contesta que sí.
 */
import prisma from '@/lib/prisma'
import { calcularAtrasos, type Atrasos } from '@/lib/reports/atrasos'
import { calendarioDesde } from '@/lib/scheduling/project-calendar'
import { loadProjectDashboard, type PanelDeProyecto } from '@/services/project-dashboard.service'
import { construirInformeDelPlan, type InformeDelPlan } from '@/services/informe-del-plan.service'
import { logWarning } from '@/lib/logger'

export interface BloqueoDelReporte {
  readonly descripcion: string
  readonly severidad: string
  readonly bloqueadoPor: string
  readonly diasAbierto: number
  readonly resuelto: boolean
}

export interface RiesgoDelReporte {
  readonly descripcion: string
  readonly nivel: string
  readonly estado: string
  readonly probabilidad: number
  readonly impacto: number
  readonly mitigacion: string
  readonly diasAbierto: number
}

export interface AcuerdoDelReporte {
  readonly titulo: string
  readonly estado: string
  readonly acordadoEl: Date
  readonly diasDesdeQueSeAcordo: number
  readonly participantes: string
  /** Fecha más tardía de las líneas del plan que cuelgan de este acuerdo, si las hay. */
  readonly comprometidoPara: Date | null
  readonly lineasVinculadas: number
}

export interface Expediente {
  readonly proyecto: {
    readonly id: string
    readonly nombre: string
    readonly cliente: string
    readonly inicio: Date
    readonly comprometidoPara: Date
    readonly estado: string
  }
  /** Fecha civil del corte, `AAAA-MM-DD`. Cadena y no `Date`: ver `EntradaDeAtrasos.corte`. */
  readonly corte: string
  readonly panel: PanelDeProyecto
  readonly atrasos: Atrasos
  /** Nulo cuando el motor no pudo con el plan. El correo sale igual, sin la proyección. */
  readonly plan: InformeDelPlan | null
  readonly bloqueos: readonly BloqueoDelReporte[]
  readonly riesgos: readonly RiesgoDelReporte[]
  readonly acuerdos: readonly AcuerdoDelReporte[]
  /**
   * Verdadero cuando no hay NI un bloqueo, NI un riesgo, NI un acuerdo registrados.
   *
   * No es un detalle de maquetado: en un proyecto con deuda de meses, un registro de gobierno
   * vacío es en sí mismo el hallazgo. El reporte lo dice con todas sus letras en vez de omitir
   * tres secciones en silencio, que se leería como «no hay nada de qué preocuparse».
   */
  readonly gobiernoVacio: boolean
}

const dias = (a: Date, b: Date) => Math.max(0, Math.round((+a - +b) / 86400000))

export async function reunirExpediente(
  projectId: string,
  organizationId: string,
  /** Fecha civil de corte, `AAAA-MM-DD`, resuelta en la zona de la suscripción. */
  corte: string
): Promise<Expediente | null> {
  // Las columnas `@db.Date` de Prisma viven en medianoche UTC, así que la antigüedad de bloqueos,
  // riesgos y acuerdos se mide contra la misma medianoche UTC del día de corte.
  const corteUtc = new Date(`${corte}T00:00:00.000Z`)

  const proyecto = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: {
      id: true,
      name: true,
      client: true,
      status: true,
      startDate: true,
      estimatedEndDate: true,
    },
  })
  if (!proyecto) return null

  // El Panel y el motor van en paralelo: son dos lecturas independientes de la misma base y
  // encadenarlas duplicaría la espera sin ganar nada.
  const [panel, plan, lineas, bloqueosCrudos, riesgosCrudos, acuerdosCrudos] = await Promise.all([
    loadProjectDashboard(projectId, organizationId, corte),
    construirInformeDelPlan(projectId, organizationId, corte),
    prisma.workItem.findMany({
      where: { projectId },
      select: {
        id: true,
        parentId: true,
        title: true,
        phase: true,
        kind: true,
        party: true,
        status: true,
        progressPct: true,
        startDate: true,
        estimatedEndDate: true,
      },
    }),
    prisma.blocker.findMany({
      where: { projectId, organizationId },
      orderBy: { startDate: 'asc' },
      select: { description: true, severity: true, blockedBy: true, startDate: true, resolvedAt: true },
    }),
    prisma.risk.findMany({
      where: { projectId, organizationId },
      orderBy: { identifiedAt: 'asc' },
      select: {
        description: true,
        riskLevel: true,
        status: true,
        probability: true,
        impact: true,
        mitigationPlan: true,
        identifiedAt: true,
      },
    }),
    prisma.agreement.findMany({
      where: { projectId, organizationId },
      orderBy: { agreementDate: 'desc' },
      select: {
        title: true,
        status: true,
        agreementDate: true,
        participants: true,
        workItems: { select: { workItem: { select: { estimatedEndDate: true } } } },
      },
    }),
  ])

  if (!panel) {
    logWarning('[Expediente] el panel no devolvió nada', { projectId, organizationId })
    return null
  }

  const atrasos = calcularAtrasos({
    lineas,
    // El mismo calendario con el que programó el motor. Si el motor no pudo con el plan, se cae al
    // de siempre —lunes a viernes, sin festivos—, que es lo que este proyecto tiene configurado de
    // todos modos; suponerlo en silencio sería peor, así que el maquetado lo dice.
    calendar: plan?.calendar ?? calendarioDesde(undefined),
    corte,
    inicioDelProyecto: proyecto.startDate,
    finDelProyecto: proyecto.estimatedEndDate,
  })

  const bloqueos: BloqueoDelReporte[] = bloqueosCrudos.map((b) => ({
    descripcion: b.description,
    severidad: b.severity,
    bloqueadoPor: b.blockedBy,
    diasAbierto: dias(b.resolvedAt ?? corteUtc, b.startDate),
    resuelto: Boolean(b.resolvedAt),
  }))

  const riesgos: RiesgoDelReporte[] = riesgosCrudos.map((r) => ({
    descripcion: r.description,
    nivel: r.riskLevel,
    estado: r.status,
    probabilidad: r.probability,
    impacto: r.impact,
    mitigacion: r.mitigationPlan,
    diasAbierto: dias(corteUtc, r.identifiedAt),
  }))

  const acuerdos: AcuerdoDelReporte[] = acuerdosCrudos.map((a) => {
    // `Agreement` NO tiene fecha de vencimiento: `agreementDate` es cuándo se acordó, no cuándo
    // vence. Inventarle un vencimiento sería fabricar un dato. Lo más cercano honesto es la fecha
    // comprometida de las líneas del plan que cuelgan de él.
    const fechas = a.workItems.map((w) => w.workItem.estimatedEndDate).filter(Boolean)
    const comprometidoPara = fechas.length
      ? new Date(Math.max(...fechas.map((f) => +f)))
      : null
    return {
      titulo: a.title,
      estado: a.status,
      acordadoEl: a.agreementDate,
      diasDesdeQueSeAcordo: dias(corteUtc, a.agreementDate),
      participantes: a.participants,
      comprometidoPara,
      lineasVinculadas: a.workItems.length,
    }
  })

  return {
    proyecto: {
      id: proyecto.id,
      nombre: proyecto.name,
      cliente: proyecto.client,
      inicio: proyecto.startDate,
      comprometidoPara: proyecto.estimatedEndDate,
      estado: proyecto.status,
    },
    corte,
    panel,
    atrasos,
    plan,
    bloqueos,
    riesgos,
    acuerdos,
    gobiernoVacio: bloqueos.length === 0 && riesgos.length === 0 && acuerdos.length === 0,
  }
}

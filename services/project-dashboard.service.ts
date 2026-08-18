/**
 * Carga el corte que alimenta el panel de control del proyecto (§9).
 *
 * Una sola consulta y un solo cálculo, como pide el §9.2. La alternativa —seis consultas desde el
 * navegador, una por widget— no sólo cuesta seis viajes: cada una vería el plan en un instante
 * distinto, y bastaría con que alguien moviera una fecha a media carga para que el panel se
 * contradijera a sí mismo en la misma pantalla.
 *
 * El cálculo en sí no vive aquí sino en `lib/projects/dashboard-metrics.ts`, que es una función
 * pura sin base de datos. Este archivo sólo trae los datos y les pone la fecha de corte.
 */

import prisma from '@/lib/prisma'
import { type MetricasDelPanel, dashboardMetrics } from '@/lib/projects/dashboard-metrics'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { type IsoDate } from '@/lib/scheduling/date'

/** Una fecha de la base a `AAAA-MM-DD`, leyéndola como fecha civil. */
function isoDe(fecha: Date): IsoDate {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(
    fecha.getUTCDate(),
  ).padStart(2, '0')}` as IsoDate
}

export interface PanelDeProyecto {
  readonly projectId: string
  readonly nombre: string
  readonly cliente: string
  readonly descripcion: string
  readonly propietario: { readonly nombre: string; readonly correo: string } | null
  readonly equipo: readonly { readonly nombre: string; readonly correo: string }[]
  readonly metricas: MetricasDelPanel
}

/**
 * @param hoy Fecha civil de corte. La pone quien llama —la ruta la toma del servidor— para que el
 *   cálculo sea reproducible y comprobable.
 * @returns `null` si el proyecto no existe o no es de la organización. Quien llama decide el 404.
 */
export async function loadProjectDashboard(
  projectId: string,
  organizationId: string,
  hoy: IsoDate,
): Promise<PanelDeProyecto | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: {
      id: true,
      name: true,
      client: true,
      description: true,
      startDate: true,
      estimatedEndDate: true,
      updatedAt: true,
      owner: { select: { name: true, email: true } },
      collaborators: { select: { user: { select: { name: true, email: true } } } },
      // Las líneas viajan con el proyecto: una sola ida a la base en lugar de dos.
      workItems: {
        select: {
          id: true,
          title: true,
          kind: true,
          status: true,
          startDate: true,
          estimatedEndDate: true,
          progressPct: true,
          parentId: true,
          party: true,
          clientOwner: true,
        },
      },
    },
  })
  if (!project) return null

  // El calendario laborable del proyecto. Hoy es el de por omisión —lunes a viernes— igual que en
  // el resto del motor; el día que `ProjectCalendar` se consulte de verdad, se consulta aquí y las
  // seis métricas cambian a la vez porque todas salen del mismo objeto.
  const calendar = createWorkCalendar()

  const metricas = dashboardMetrics({
    lineas: project.workItems.map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      status: item.status,
      startDate: isoDe(item.startDate),
      estimatedEndDate: isoDe(item.estimatedEndDate),
      progressPct: item.progressPct,
      parentId: item.parentId,
      party: item.party,
      clientOwner: item.clientOwner,
    })),
    proyecto: {
      startDate: isoDe(project.startDate),
      estimatedEndDate: isoDe(project.estimatedEndDate),
      updatedAt: project.updatedAt.toISOString(),
    },
    calendar,
    hoy,
  })

  return {
    projectId: project.id,
    nombre: project.name,
    cliente: project.client,
    descripcion: project.description,
    propietario: project.owner ? { nombre: project.owner.name, correo: project.owner.email } : null,
    equipo: project.collaborators.map((c) => ({ nombre: c.user.name, correo: c.user.email })),
    metricas,
  }
}

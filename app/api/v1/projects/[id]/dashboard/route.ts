/**
 * GET /api/v1/projects/[id]/dashboard
 *
 * El paquete completo de métricas del panel de control (§9.2): una consulta, un cálculo, una
 * respuesta. El navegador no calcula nada aquí —al revés que en el Gantt, donde el motor corre en
 * el cliente para que plegar y filtrar no cueste red— porque un panel se mira, no se manipula.
 *
 * La fecha de corte la pone el servidor y viaja en la respuesta. Así el navegador puede enseñar
 * «al 17 de agosto» sin volver a leer su propio reloj, que es lo que hacía que dos pestañas
 * abiertas a distinta hora del día dijeran cosas distintas.
 */

import { NextRequest, NextResponse } from 'next/server'

import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import { type IsoDate } from '@/lib/scheduling/date'
import { loadProjectDashboard } from '@/services/project-dashboard.service'
import { Permission } from '@/types'

/**
 * Un panel no necesita ser exacto al segundo (§9.2). Sesenta segundos de gracia evitan que diez
 * personas mirando el mismo proyecto disparen diez recorridos del plan por minuto.
 */
export const revalidate = 60

/** Hoy en fecha civil del servidor, sin pasar por UTC. */
function hoyCivil(): IsoDate {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(
    ahora.getDate(),
  ).padStart(2, '0')}` as IsoDate
}

async function getDashboardHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const hoy = hoyCivil()
    const panel = await loadProjectDashboard(id, authContext.organizationId, hoy)

    if (!panel) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Project not found' },
        { status: 404 },
      )
    }

    return NextResponse.json({ panel, hoy }, { status: 200 })
  } catch (error) {
    console.error('[GET /api/v1/projects/[id]/dashboard] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to load project dashboard' },
      { status: 500 },
    )
  }
}

export const GET = withAuth(getDashboardHandler, {
  requiredPermissions: [Permission.PROJECT_VIEW],
})

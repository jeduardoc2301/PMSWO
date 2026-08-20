/**
 * GET /api/v1/projects/[id]/schedule
 *
 * El plan del proyecto en el vocabulario del motor: tareas con su clase, parte y clasificación, y
 * los vínculos con tipo y desfase. El navegador corre el motor sobre esto —programar 1 368 líneas
 * cuesta 17 milisegundos— así que el servidor no calcula nada: entrega los datos y se aparta. Eso
 * mantiene la interacción (plegar, filtrar, seleccionar) sin viajes de red.
 */

import { NextRequest, NextResponse } from 'next/server'

import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import { exigirPermiso } from '@/lib/middleware/exigir-permiso'
import { loadProjectPlan } from '@/services/schedule.service'
import { Permission } from '@/types'

async function getScheduleHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params

    /**
     * El permiso de **vista** del §10.1, en la puerta y no sólo en la barra de pestañas.
     *
     * `vistasVisibles` ya recorta lo que se dibuja —comprobado: un cliente ve siete pestañas— pero
     * eso es decoración si la ruta contesta igual a quien la pida a mano. Un permiso que sólo esconde
     * el botón no es un permiso: es una sugerencia.
     *
     * Salió barriendo la lista de comprobación del §13 con agentes: las escrituras estaban guardadas
     * desde hacía rato y **ninguna lectura** lo estaba.
     */
    const negado = await exigirPermiso(authContext.userId, id, 'view_gantt', 'No tienes acceso al plan de este proyecto.')
    if (negado) return negado

    // Acotado por organización dentro de la consulta: un proyecto ajeno simplemente no existe.
    const plan = await loadProjectPlan(id, authContext.organizationId)

    if (!plan) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Project not found' },
        { status: 404 },
      )
    }

    return NextResponse.json({ plan }, { status: 200 })
  } catch (error) {
    console.error('[GET /api/v1/projects/[id]/schedule] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to load project schedule' },
      { status: 500 },
    )
  }
}

export const GET = withAuth(getScheduleHandler, {
  requiredPermissions: [Permission.PROJECT_VIEW],
})

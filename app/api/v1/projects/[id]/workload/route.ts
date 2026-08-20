/**
 * GET  /api/v1/projects/[id]/workload — el corte de carga del proyecto (§8).
 * POST /api/v1/projects/[id]/workload — siembra recursos y asignaciones desde lo que ya había.
 *
 * El GET entrega los datos crudos y la matriz se arma en el navegador. Es lo contrario del panel de
 * control, y a propósito: el panel se mira, la carga se manipula —cambiar de horas a porcentajes, de
 * rango, desplegar un recurso— y cada una de esas cosas costaría un viaje si el servidor calculara
 * la matriz. Armarla cuesta menos de un milisegundo con 50 recursos y tres meses.
 *
 * El POST existe porque la vista necesita `Assignment` y los planes que ya están en la base no lo
 * tienen. Es idempotente: se puede llamar tantas veces como haga falta.
 */

import { NextRequest, NextResponse } from 'next/server'

import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import { exigirPermiso } from '@/lib/middleware/exigir-permiso'
import { sembrarRecursosDelProyecto } from '@/services/resource.service'
import { loadProjectWorkload } from '@/services/workload.service'
import { Permission } from '@/types'

async function getHandler(
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
    const negado = await exigirPermiso(authContext.userId, id, 'view_workload', 'No tienes acceso a la Carga de trabajo de este proyecto.')
    if (negado) return negado

    const corte = await loadProjectWorkload(id, authContext.organizationId)

    if (!corte) {
      return NextResponse.json({ error: 'Not Found', message: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ corte }, { status: 200 })
  } catch (error) {
    console.error('[GET /api/v1/projects/[id]/workload] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to load workload' },
      { status: 500 },
    )
  }
}

async function postHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const resultado = await sembrarRecursosDelProyecto(id, authContext.organizationId)
    const corte = await loadProjectWorkload(id, authContext.organizationId)

    if (!corte) {
      return NextResponse.json({ error: 'Not Found', message: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ resultado, corte }, { status: 200 })
  } catch (error) {
    console.error('[POST /api/v1/projects/[id]/workload] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to seed resources' },
      { status: 500 },
    )
  }
}

export const GET = withAuth(getHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const POST = withAuth(postHandler, { requiredPermissions: [Permission.PROJECT_UPDATE] })

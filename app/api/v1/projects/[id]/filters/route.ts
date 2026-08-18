/**
 * GET    /api/v1/projects/[id]/filters      — los filtros guardados que esta persona puede usar.
 * POST   /api/v1/projects/[id]/filters      — guarda uno con nombre.
 * DELETE /api/v1/projects/[id]/filters?id=… — borra uno propio.
 *
 * El filtro que está puesto en pantalla no pasa por aquí: vive en el navegador y se comparte entre
 * las seis vistas sin tocar la red (§10.2). Esto es sólo para los que se guardan con nombre.
 *
 * Guardar no pide permiso de escritura del proyecto: guardar una vista propia no cambia el plan.
 * Compartirla con el equipo tampoco lo cambia, y quien puede ver el proyecto puede proponer cómo
 * mirarlo.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import { FiltroInvalido } from '@/lib/projects/filter'
import { borrarFiltro, guardarFiltro, listarFiltros } from '@/services/saved-filter.service'
import { Permission } from '@/types'

const esquemaDeCreacion = z.object({
  name: z.string().trim().min(1, 'El filtro necesita un nombre').max(80),
  // La forma del árbol la valida el motor de filtros, no zod: es él quien sabe qué campos existen
  // y qué operador vale para cada tipo, y duplicar esa tabla aquí sería duplicar la verdad.
  expression: z.unknown(),
  isShared: z.boolean().default(false),
})

async function getHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const filtros = await listarFiltros(id, authContext.organizationId, authContext.userId)
    return NextResponse.json({ filtros }, { status: 200 })
  } catch (error) {
    console.error('[GET /api/v1/projects/[id]/filters] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to load filters' },
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
    const cuerpo = await request.json().catch(() => ({}))
    const datos = esquemaDeCreacion.parse(cuerpo)

    const filtro = await guardarFiltro(id, authContext.organizationId, authContext.userId, datos)
    if (!filtro) {
      return NextResponse.json({ error: 'Not Found', message: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ filtro }, { status: 201 })
  } catch (error) {
    if (error instanceof FiltroInvalido) {
      return NextResponse.json({ error: 'Bad Request', message: error.message }, { status: 400 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Bad Request', message: error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      )
    }
    console.error('[POST /api/v1/projects/[id]/filters] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to save filter' },
      { status: 500 },
    )
  }
}

async function deleteHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const filtroId = request.nextUrl.searchParams.get('id')
    if (!filtroId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Hace falta el id del filtro' },
        { status: 400 },
      )
    }

    const borrado = await borrarFiltro(id, authContext.organizationId, authContext.userId, filtroId)
    if (!borrado) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Ese filtro no existe o no es tuyo' },
        { status: 404 },
      )
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[DELETE /api/v1/projects/[id]/filters] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to delete filter' },
      { status: 500 },
    )
  }
}

export const GET = withAuth(getHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const POST = withAuth(postHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const DELETE = withAuth(deleteHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })

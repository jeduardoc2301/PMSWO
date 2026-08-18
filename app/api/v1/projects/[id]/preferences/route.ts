/**
 * GET / PUT /api/v1/projects/[id]/preferences?view=PANEL
 *
 * Cómo tiene cada persona configurada cada vista del proyecto (§10.4). Es preferencia de pantalla,
 * así que no lleva permiso de escritura del proyecto: quien puede ver el proyecto puede decidir
 * cómo lo ve. Lo que sí lleva es el usuario de la sesión, nunca uno que venga en la petición —
 * dejar elegir de quién es la preferencia sería dejar a cualquiera reconfigurarle la pantalla a
 * cualquiera.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import prisma from '@/lib/prisma'
import {
  VISTAS,
  type Vista,
  guardarPreferencia,
  leerPreferencia,
} from '@/services/view-preference.service'
import { Permission } from '@/types'

function vistaDe(request: NextRequest): Vista | null {
  const pedida = request.nextUrl.searchParams.get('view')
  return VISTAS.includes(pedida as Vista) ? (pedida as Vista) : null
}

/** El proyecto tiene que ser de la organización de quien pregunta, o no existe. */
async function existeEnLaOrganizacion(projectId: string, organizationId: string): Promise<boolean> {
  const encontrado = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  })
  return encontrado !== null
}

async function getHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const view = vistaDe(request)
  if (!view) {
    return NextResponse.json(
      { error: 'Bad Request', message: `El parámetro view debe ser uno de: ${VISTAS.join(', ')}` },
      { status: 400 },
    )
  }
  if (!(await existeEnLaOrganizacion(id, authContext.organizationId))) {
    return NextResponse.json({ error: 'Not Found', message: 'Project not found' }, { status: 404 })
  }

  const settings = await leerPreferencia(authContext.userId, id, view)
  return NextResponse.json({ view, settings }, { status: 200 })
}

async function putHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const view = vistaDe(request)
  if (!view) {
    return NextResponse.json(
      { error: 'Bad Request', message: `El parámetro view debe ser uno de: ${VISTAS.join(', ')}` },
      { status: 400 },
    )
  }
  if (!(await existeEnLaOrganizacion(id, authContext.organizationId))) {
    return NextResponse.json({ error: 'Not Found', message: 'Project not found' }, { status: 404 })
  }

  try {
    const cuerpo = await request.json()
    const settings = await guardarPreferencia(
      authContext.organizationId,
      authContext.userId,
      id,
      view,
      cuerpo?.settings,
    )
    return NextResponse.json({ view, settings }, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'La preferencia no tiene la forma esperada', issues: error.issues },
        { status: 400 },
      )
    }
    console.error('[PUT /api/v1/projects/[id]/preferences] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to save preference' },
      { status: 500 },
    )
  }
}

export const GET = withAuth(getHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const PUT = withAuth(putHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })

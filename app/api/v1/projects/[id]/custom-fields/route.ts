/**
 * GET / POST / PATCH /api/v1/projects/[id]/custom-fields
 *
 * Los campos personalizados de un proyecto (§2, §10.2, §4.2).
 *
 * El spec los pide en dos sitios: entre los criterios del filtro unificado —«todos los campos
 * personalizados»— y en el catálogo de columnas del Gantt.
 *
 * ## No hay DELETE, y es a propósito
 *
 * Un filtro guardado puede apuntar a un campo, y el §10.2 dice que los filtros se guardan con nombre
 * y se comparten. Borrar el campo dejaría el filtro señalando algo que nadie conoce, y el filtro
 * **no avisaría**: devolvería cero líneas y parecería que no hay nada que enseñar.
 *
 * `PATCH` con `archivado: true` lo retira del selector y deja de admitir valores nuevos. Lo que ya
 * está capturado sigue ahí, y el filtro que lo usa sigue diciendo la verdad.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { exigirPermiso } from '@/lib/middleware/exigir-permiso'
import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import { TIPOS_DE_CAMPO } from '@/lib/projects/campos-personalizados'
import { AppError } from '@/lib/errors'
import { archivarCampo, catalogoDelProyecto, crearCampo } from '@/services/custom-field.service'
import { Permission } from '@/types'

const MOTIVO = 'Los campos personalizados son parte de la configuración del proyecto.'

const alta = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(TIPOS_DE_CAMPO),
  options: z
    .array(z.object({ id: z.string().min(1), label: z.string().min(1), color: z.string().optional() }))
    .optional(),
})

const cambio = z.object({
  fieldId: z.string().uuid(),
  archivado: z.boolean(),
})

/** Traduce un error del servicio a una respuesta, sin perder el mensaje. */
function comoRespuesta(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.name, message: error.message }, { status: error.statusCode })
  }
  throw error
}

async function getHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id: projectId } = await context.params
  // Ver el catálogo es parte de ver el proyecto: quien mira un filtro guardado necesita saber por
  // qué campo filtra aunque no pueda administrarlos.
  /**
   * Cualquiera de las seis vistas, porque el catalogo es del **filtro** y el filtro es transversal.
   *
   * Pedía `view_gantt` a secas, y de aqui salen los campos personalizados que el §10.2 nombra
   * entre los criterios del filtro compartido. Un perfil con `view_list` y sin Gantt recibia 403,
   * el cliente se caía de pie a un catálogo vacío —sin romperse— y **el filtro perdia sus campos
   * propios en las seis vistas** sin decir por que. Es el mismo molde que `/schedule`: una ruta que
   * sirve a varias vistas exigiendo el permiso de una.
   */
  const negado = await exigirPermiso(authContext.userId, projectId, [
    'view_gantt',
    'view_list',
    'view_board',
    'view_calendar',
    'view_workload',
    'view_dashboard',
  ])
  if (negado) return negado

  const campos = await catalogoDelProyecto(projectId, authContext.organizationId)
  return NextResponse.json({ campos })
}

async function postHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id: projectId } = await context.params
  const negado = await exigirPermiso(authContext.userId, projectId, 'manage_project_settings', MOTIVO)
  if (negado) return negado

  const datos = alta.safeParse(await request.json().catch(() => null))
  if (!datos.success) {
    return NextResponse.json(
      { error: 'Validation Error', message: `Se espera un nombre y uno de estos tipos: ${TIPOS_DE_CAMPO.join(', ')}.` },
      { status: 400 },
    )
  }

  try {
    const campo = await crearCampo({
      projectId,
      organizationId: authContext.organizationId,
      name: datos.data.name,
      type: datos.data.type,
      options: datos.data.options ?? null,
    })
    return NextResponse.json({ campo }, { status: 201 })
  } catch (error) {
    return comoRespuesta(error)
  }
}

async function patchHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id: projectId } = await context.params
  const negado = await exigirPermiso(authContext.userId, projectId, 'manage_project_settings', MOTIVO)
  if (negado) return negado

  const datos = cambio.safeParse(await request.json().catch(() => null))
  if (!datos.success) {
    return NextResponse.json(
      { error: 'Validation Error', message: 'Se esperan fieldId y archivado (verdadero o falso).' },
      { status: 400 },
    )
  }

  try {
    const campo = await archivarCampo(datos.data.fieldId, authContext.organizationId, datos.data.archivado)
    return NextResponse.json({ campo })
  } catch (error) {
    return comoRespuesta(error)
  }
}

export const GET = withAuth(getHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const POST = withAuth(postHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const PATCH = withAuth(patchHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })

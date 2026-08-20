/**
 * GET  /api/v1/projects/[id]/baselines            — las fotos guardadas del plan.
 * POST /api/v1/projects/[id]/baselines            — toma una foto nueva.
 * GET  /api/v1/projects/[id]/baselines?compare=ID — el plan de hoy contra esa foto.
 *
 * La comparación va en el mismo recurso y no en uno aparte porque es una *lectura* de la línea
 * base: no hay nada que guardar y nada que puedan divergir. Lo que sí calcula el servidor es la
 * comparación entera, y no los datos crudos, porque hace falta el plan programado de las dos
 * fechas y programarlo dos veces en el navegador costaría el doble por nada.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import { exigirPermiso } from '@/lib/middleware/exigir-permiso'
import {
  borrarLineaBase,
  compararConLineaBase,
  listarLineasBase,
  tomarLineaBase,
} from '@/services/baseline.service'
import { Permission } from '@/types'

const esquemaDeCreacion = z.object({
  // Un nombre en blanco convierte el desplegable en una lista de renglones vacíos indistinguibles.
  name: z.string().trim().min(1, 'La línea base necesita un nombre').max(120),
})

async function getHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const comparar = request.nextUrl.searchParams.get('compare')

    if (comparar) {
      const resumen = await compararConLineaBase(id, authContext.organizationId, comparar)
      if (!resumen) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Baseline not found' },
          { status: 404 },
        )
      }
      return NextResponse.json({ resumen }, { status: 200 })
    }

    const baselines = await listarLineasBase(id, authContext.organizationId)
    return NextResponse.json({ baselines }, { status: 200 })
  } catch (error) {
    console.error('[GET /api/v1/projects/[id]/baselines] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to load baselines' },
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

    // Tomar una línea base congela el plan como referencia contra la que se medirá todo lo que
    // venga: es un acto sobre el plan, no sobre el seguimiento (§10.1).
    const negado = await exigirPermiso(
      authContext.userId,
      id,
      'edit_schedule',
      'Tomar una línea base fija la referencia del plan del proyecto.',
    )
    if (negado) return negado

    const cuerpo = await request.json().catch(() => ({}))
    const { name } = esquemaDeCreacion.parse(cuerpo)

    const foto = await tomarLineaBase(id, authContext.organizationId, authContext.userId, name)
    if (!foto) {
      return NextResponse.json({ error: 'Not Found', message: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json({ baseline: foto }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Bad Request', message: error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      )
    }
    console.error('[POST /api/v1/projects/[id]/baselines] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to create baseline' },
      { status: 500 },
    )
  }
}

/**
 * Borra una foto guardada.
 *
 * `borrarLineaBase` llevaba escrita, con su JSDoc y su cascada, sin handler que la llamara ni botón
 * que la ofreciera: las fotos se acumulaban sin forma de quitarlas. Sólo puede borrarlas quien
 * puede escribir en el proyecto — una línea base compartida la mira más gente, y que cualquiera la
 * quite de en medio convierte una referencia acordada en algo que desaparece sin explicación.
 */
async function deleteHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params

    // Quitar una línea base borra la referencia contra la que se mide el plan (§10.1). El comentario
    // de arriba ya decía «sólo quien puede escribir en el proyecto»; lo comprobaba el permiso de
    // organización, que no distingue en qué proyecto.
    const negado = await exigirPermiso(
      authContext.userId,
      id,
      'edit_schedule',
      'Quitar una línea base borra la referencia del plan del proyecto.',
    )
    if (negado) return negado

    const baselineId = request.nextUrl.searchParams.get('baselineId')
    if (!baselineId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Hace falta el id de la línea base' },
        { status: 400 },
      )
    }

    const borrada = await borrarLineaBase(id, authContext.organizationId, baselineId)
    if (!borrada) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Esa línea base no existe en este proyecto' },
        { status: 404 },
      )
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[DELETE /api/v1/projects/[id]/baselines] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to delete baseline' },
      { status: 500 },
    )
  }
}

export const GET = withAuth(getHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const POST = withAuth(postHandler, { requiredPermissions: [Permission.PROJECT_UPDATE] })
export const DELETE = withAuth(deleteHandler, { requiredPermissions: [Permission.PROJECT_UPDATE] })

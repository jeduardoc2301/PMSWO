/**
 * POST   /api/v1/projects/[id]/dependencies   — capturar un vínculo entre dos líneas
 * DELETE /api/v1/projects/[id]/dependencies   — quitarlo (par predecessor/successor por query)
 *
 * La validación de fondo vive en el servicio: puntas del mismo proyecto, sin duplicados y —la que
 * no negocia— sin ciclos, con el error del motor nombrando las líneas del ciclo. Aquí solo se
 * valida la forma del cuerpo y se traducen los errores a códigos HTTP.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { NotFoundError, ValidationError } from '@/lib/errors'
import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import { addDependency, removeDependency } from '@/services/dependency.service'
import { Permission } from '@/types'

const cuerpoDeAlta = z.object({
  predecessorId: z.string().min(1),
  successorId: z.string().min(1),
  type: z.enum(['FS', 'SS', 'FF', 'SF']),
  lag: z.number().int(),
})

async function postHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const cuerpo = cuerpoDeAlta.safeParse(await request.json().catch(() => null))
    if (!cuerpo.success) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'Cuerpo inválido: se esperan predecessorId, successorId, type (FS/SS/FF/SF) y lag entero.' },
        { status: 400 },
      )
    }

    const creado = await addDependency({
      projectId: id,
      organizationId: authContext.organizationId,
      ...cuerpo.data,
    })
    return NextResponse.json({ dependency: { id: creado.id, ...cuerpo.data } }, { status: 201 })
  } catch (error) {
    return traducir(error, 'No se pudo capturar el vínculo')
  }
}

async function deleteHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const predecessorId = request.nextUrl.searchParams.get('predecessorId')
    const successorId = request.nextUrl.searchParams.get('successorId')
    if (!predecessorId || !successorId) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'Faltan predecessorId y successorId en la consulta.' },
        { status: 400 },
      )
    }

    await removeDependency({
      projectId: id,
      organizationId: authContext.organizationId,
      predecessorId,
      successorId,
    })
    return NextResponse.json({ message: 'Vínculo eliminado' }, { status: 200 })
  } catch (error) {
    return traducir(error, 'No se pudo quitar el vínculo')
  }
}

/**
 * Los errores del servicio, a códigos HTTP; lo demás, 500 sin filtrar detalles inventados.
 *
 * Se reconoce por `name`, no por `instanceof`: el empaquetador de desarrollo puede cargar dos
 * copias del módulo de errores —una por la cadena de la ruta y otra por la del servicio— y entonces
 * la clase es la misma a los ojos de cualquiera menos de `instanceof`. Pasó aquí: un ciclo bien
 * detectado y bien redactado salía como 500 genérico, que es la peor versión de un buen error.
 */
function traducir(error: unknown, contexto: string): NextResponse {
  const nombre = error instanceof Error ? error.name : ''
  if (error instanceof ValidationError || nombre === 'ValidationError') {
    return NextResponse.json(
      { error: 'Validation Error', message: (error as Error).message },
      { status: 400 },
    )
  }
  if (error instanceof NotFoundError || nombre === 'NotFoundError') {
    return NextResponse.json({ error: 'Not Found', message: (error as Error).message }, { status: 404 })
  }
  console.error(`[dependencies] ${contexto}:`, error)
  return NextResponse.json({ error: 'Internal Server Error', message: contexto }, { status: 500 })
}

export const POST = withAuth(postHandler, {
  requiredPermissions: [Permission.WORK_ITEM_UPDATE],
})

export const DELETE = withAuth(deleteHandler, {
  requiredPermissions: [Permission.WORK_ITEM_UPDATE],
})

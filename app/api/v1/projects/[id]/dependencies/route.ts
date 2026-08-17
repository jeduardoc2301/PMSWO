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
 * Se reconoce por `name` además de por `instanceof`. El respaldo por nombre entró aquí con un
 * diagnóstico equivocado —se culpó al empaquetador de cargar dos copias de `lib/errors`—. La causa
 * real era `AppError` fijando `AppError.prototype` en vez de `new.target.prototype`, que aplanaba
 * toda subclase y volvía `instanceof ValidationError` siempre falso; está corregida en su raíz. El
 * respaldo se conserva porque no cuesta nada y protege de que alguien vuelva a romper la cadena.
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

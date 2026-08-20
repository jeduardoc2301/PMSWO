/**
 * GET / POST / DELETE de las ausencias de un recurso (§8.1, §8.5).
 *
 * `ResourceAbsence` llevaba creada, se leía en el corte de carga y el motor la calculaba, pero
 * **ninguna línea del repositorio la escribía**: no había endpoint, ni servicio, ni pantalla. El
 * criterio del §8.5 empieza con «poner vacaciones a un recurso el día X», es decir, con un verbo
 * que nadie podía ejecutar.
 *
 * El recurso se comprueba contra la organización antes de tocar nada: un id de recurso ajeno no
 * puede acabar con vacaciones puestas desde otra empresa.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import { exigirPermiso } from '@/lib/middleware/exigir-permiso'
import prisma from '@/lib/prisma'
import { Permission } from '@/types'

const esquemaDeAlta = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va en formato AAAA-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va en formato AAAA-MM-DD'),
    reason: z.string().trim().max(120).optional(),
  })
  // Un tramo al revés dejaría una ausencia que no cubre ningún día y que nadie entendería en la
  // matriz: se rechaza al entrar, no se corrige por la espalda.
  .refine((a) => a.startDate <= a.endDate, {
    message: 'El primer día de la ausencia no puede ir después del último',
  })

function aFecha(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

/** El recurso tiene que ser de la organización de quien pide, o no existe. */
async function recursoDeLaOrganizacion(resourceId: string, organizationId: string) {
  return prisma.resource.findFirst({
    where: { id: resourceId, organizationId },
    select: { id: true, name: true },
  })
}

async function getHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string; resourceId: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { resourceId } = await context.params
  if (!(await recursoDeLaOrganizacion(resourceId, authContext.organizationId))) {
    return NextResponse.json({ error: 'Not Found', message: 'Recurso no encontrado' }, { status: 404 })
  }

  const ausencias = await prisma.resourceAbsence.findMany({
    where: { resourceId },
    orderBy: { startDate: 'asc' },
    select: { id: true, startDate: true, endDate: true, reason: true },
  })

  return NextResponse.json(
    {
      ausencias: ausencias.map((a) => ({
        id: a.id,
        startDate: a.startDate.toISOString().slice(0, 10),
        endDate: a.endDate.toISOString().slice(0, 10),
        reason: a.reason,
      })),
    },
    { status: 200 },
  )
}

async function postHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string; resourceId: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  try {
    const { id, resourceId } = await context.params

    // Una ausencia **estira las tareas** de quien falta: es el cronograma, no una nota de agenda
    // (§12 caso 17). Pide el permiso del plan en ESTE proyecto, no sólo el cargo de organización.
    const negado = await exigirPermiso(
      authContext.userId,
      id,
      'edit_schedule',
      'Registrar una ausencia mueve las fechas de las líneas de esa persona.',
    )
    if (negado) return negado

    const recurso = await recursoDeLaOrganizacion(resourceId, authContext.organizationId)
    if (!recurso) {
      return NextResponse.json({ error: 'Not Found', message: 'Recurso no encontrado' }, { status: 404 })
    }

    const datos = esquemaDeAlta.parse(await request.json().catch(() => ({})))

    const creada = await prisma.resourceAbsence.create({
      data: {
        resourceId,
        startDate: aFecha(datos.startDate),
        endDate: aFecha(datos.endDate),
        reason: datos.reason ?? null,
      },
      select: { id: true },
    })

    return NextResponse.json({ ausencia: { id: creada.id, ...datos } }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Bad Request', message: error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      )
    }
    console.error('[POST absences] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'No se pudo crear la ausencia' },
      { status: 500 },
    )
  }
}

async function deleteHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string; resourceId: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id, resourceId } = await context.params

  // Quitar una ausencia también mueve fechas — al revés, pero las mueve. Misma guardia que el alta.
  const negado = await exigirPermiso(
    authContext.userId,
    id,
    'edit_schedule',
    'Quitar una ausencia mueve las fechas de las líneas de esa persona.',
  )
  if (negado) return negado

  const ausenciaId = request.nextUrl.searchParams.get('absenceId')
  if (!ausenciaId) {
    return NextResponse.json(
      { error: 'Bad Request', message: 'Hace falta el id de la ausencia' },
      { status: 400 },
    )
  }

  // Acotada por recurso Y por organización: borrar por id a secas dejaría quitar las vacaciones de
  // cualquiera con sólo conocer el identificador.
  const existe = await prisma.resourceAbsence.findFirst({
    where: {
      id: ausenciaId,
      resourceId,
      resource: { organizationId: authContext.organizationId },
    },
    select: { id: true },
  })
  if (!existe) {
    return NextResponse.json({ error: 'Not Found', message: 'Ausencia no encontrada' }, { status: 404 })
  }

  await prisma.resourceAbsence.delete({ where: { id: ausenciaId } })
  return NextResponse.json({ ok: true }, { status: 200 })
}

export const GET = withAuth(getHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const POST = withAuth(postHandler, { requiredPermissions: [Permission.PROJECT_UPDATE] })
export const DELETE = withAuth(deleteHandler, { requiredPermissions: [Permission.PROJECT_UPDATE] })

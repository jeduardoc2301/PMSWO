/**
 * GET / PUT / DELETE /api/v1/work-items/[id]/assignments
 *
 * Quién trabaja en una línea y con cuánta dedicación (§3.7).
 *
 * La tabla `Assignment` existía y la sembraba la importación del plan; lo que faltaba era poder
 * asignar y desasignar sin entrar a la base — y sin eso, la vista de carga sólo puede enseñar lo
 * que vino del archivo.
 *
 * Pide `edit_schedule` porque el reparto es plan: cambiar quién hace algo y en qué proporción es lo
 * que decide si una persona sale sobrecargada, y eso es una decisión de quien lleva el cronograma.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { exigirPermiso } from '@/lib/middleware/exigir-permiso'
import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import prisma from '@/lib/prisma'
import { porQueNoSeAdmite } from '@/lib/scheduling/asignaciones'
import { Permission } from '@/types'

const MOTIVO = 'Repartir el trabajo cambia la carga del equipo, que es parte del plan.'

const cuerpo = z.object({
  resourceId: z.string().uuid(),
  /** Puntos base: 10 000 es jornada completa. */
  unitsBp: z.number().int(),
  /**
   * De quién se quita, cuando esto es un **movimiento** y no un alta (§8.4, nivelación manual).
   *
   * Va aquí y no como dos llamadas del navegador porque quitar y poner tienen que pasar o no pasar
   * juntas: entre una y otra, media falla deja la línea asignada a los dos —y la carga contada
   * dos veces, que es exactamente lo que quien mueve estaba intentando arreglar—.
   */
  desdeResourceId: z.string().uuid().optional(),
})

/** De qué proyecto es la línea. Sin esto no se puede preguntar por el permiso. */
async function proyectoDe(workItemId: string): Promise<string | null> {
  const w = await prisma.workItem.findUnique({
    where: { id: workItemId },
    select: { projectId: true },
  })
  return w?.projectId ?? null
}

async function getHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const projectId = await proyectoDe(id)
  if (!projectId) {
    return NextResponse.json({ error: 'Not Found', message: 'Esa línea no existe' }, { status: 404 })
  }
  const negado = await exigirPermiso(authContext.userId, projectId, 'view_workload')
  if (negado) return negado

  const filas = await prisma.assignment.findMany({
    where: { workItemId: id },
    select: { unitsBp: true, resource: { select: { id: true, name: true, kind: true, dailyMinutes: true } } },
  })

  return NextResponse.json(
    {
      asignaciones: filas.map((f) => ({
        resourceId: f.resource.id,
        nombre: f.resource.name,
        clase: f.resource.kind,
        unitsBp: f.unitsBp,
        jornadaMin: f.resource.dailyMinutes,
      })),
    },
    { status: 200 },
  )
}

async function putHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const projectId = await proyectoDe(id)
  if (!projectId) {
    return NextResponse.json({ error: 'Not Found', message: 'Esa línea no existe' }, { status: 404 })
  }
  const negado = await exigirPermiso(authContext.userId, projectId, 'edit_schedule', MOTIVO)
  if (negado) return negado

  const datos = cuerpo.safeParse(await request.json().catch(() => null))
  if (!datos.success) {
    return NextResponse.json(
      { error: 'Validation Error', message: 'Se esperan resourceId y unitsBp (entero, puntos base).' },
      { status: 400 },
    )
  }

  // La misma regla que aplica la pantalla, desde el mismo sitio: dos copias de una frontera acaban
  // siendo dos fronteras distintas.
  const motivo = porQueNoSeAdmite(datos.data.unitsBp)
  if (motivo) {
    return NextResponse.json({ error: 'Validation Error', message: motivo }, { status: 400 })
  }

  // El recurso es de la **organización**, no del proyecto: la misma persona trabaja en varios, y
  // esa es justamente la razón de que la vista de carga tenga sentido. Lo que sí se comprueba es
  // que sea de la misma casa, o se estaría poniendo carga a alguien de otra organización.
  const recurso = await prisma.resource.findFirst({
    where: { id: datos.data.resourceId, organizationId: authContext.organizationId },
    select: { id: true },
  })
  if (!recurso) {
    return NextResponse.json(
      { error: 'Not Found', message: 'Ese recurso no existe en esta organización' },
      { status: 404 },
    )
  }

  const { desdeResourceId } = datos.data
  if (desdeResourceId === datos.data.resourceId) {
    return NextResponse.json(
      { error: 'Validation Error', message: 'Mover una línea a quien ya la tiene no cambia nada.' },
      { status: 400 },
    )
  }

  const poner = prisma.assignment.upsert({
    where: { workItemId_resourceId: { workItemId: id, resourceId: datos.data.resourceId } },
    create: {
      workItemId: id,
      resourceId: datos.data.resourceId,
      unitsBp: datos.data.unitsBp,
      organizationId: authContext.organizationId,
    },
    update: { unitsBp: datos.data.unitsBp },
  })

  if (desdeResourceId === undefined) {
    await poner
    return NextResponse.json({ ok: true, movida: false }, { status: 200 })
  }

  // Las dos en la misma transacción: ver `cuerpo.desdeResourceId`.
  await prisma.$transaction([
    poner,
    prisma.assignment.deleteMany({ where: { workItemId: id, resourceId: desdeResourceId } }),
  ])

  return NextResponse.json({ ok: true, movida: true }, { status: 200 })
}

async function deleteHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const projectId = await proyectoDe(id)
  if (!projectId) {
    return NextResponse.json({ error: 'Not Found', message: 'Esa línea no existe' }, { status: 404 })
  }
  const negado = await exigirPermiso(authContext.userId, projectId, 'edit_schedule', MOTIVO)
  if (negado) return negado

  const resourceId = request.nextUrl.searchParams.get('resourceId')
  if (!resourceId) {
    return NextResponse.json(
      { error: 'Validation Error', message: 'Falta resourceId en la consulta.' },
      { status: 400 },
    )
  }

  // `deleteMany` y no `delete`: quitar algo que ya no estaba no es un error, es el mismo resultado.
  const { count } = await prisma.assignment.deleteMany({ where: { workItemId: id, resourceId } })
  return NextResponse.json({ ok: true, quitadas: count }, { status: 200 })
}

export const GET = withAuth(getHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const PUT = withAuth(putHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const DELETE = withAuth(deleteHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })

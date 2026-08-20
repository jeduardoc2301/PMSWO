/**
 * POST /api/v1/projects/[id]/work-items/restore
 *
 * Repone una línea borrada, **con su mismo identificador** (§10.6).
 *
 * Existe separada del alta normal por una razón que importa: crear y reponer no son lo mismo. Al
 * crear, el identificador lo pone la base; al reponer hay que conservarlo, porque los vínculos de
 * esa línea —y las hijas que colgaban de ella— apuntan a él. Reponerla con otro identificador
 * dejaría todo eso señalando a una línea que ya no existe, y el plan parecería íntegro estando roto.
 *
 * Dejar que el alta normal aceptara un identificador cualquiera sería peor: cualquiera podría
 * escribir sobre el hueco de una línea ajena. Aquí se comprueba que **no exista** antes de reponer.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { exigirPermiso } from '@/lib/middleware/exigir-permiso'
import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import prisma from '@/lib/prisma'
import { Permission } from '@/types'

const esquema = z.object({
  /** La foto que se tomó antes de borrar. */
  linea: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(255),
    description: z.string(),
    status: z.string(),
    priority: z.string(),
    kind: z.string().optional(),
    party: z.string().optional(),
    phase: z.string().nullable().optional(),
    ownerId: z.string().uuid(),
    kanbanColumnId: z.string().uuid(),
    parentId: z.string().uuid().nullable().optional(),
    startDate: z.string().min(10),
    estimatedEndDate: z.string().min(10),
    estimatedHours: z.number().nullable().optional(),
    progressPct: z.number().optional(),
  }),
})

async function postHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id: projectId } = await context.params
  const negado = await exigirPermiso(
    authContext.userId,
    projectId,
    'edit_schedule',
    'Reponer una línea cambia el plan del proyecto.',
  )
  if (negado) return negado

  const datos = esquema.safeParse(await request.json().catch(() => null))
  if (!datos.success) {
    return NextResponse.json(
      { error: 'Validation Error', message: 'La foto de la línea no tiene la forma esperada.' },
      { status: 400 },
    )
  }
  const l = datos.data.linea

  // Que el proyecto sea de quien pregunta, y que la línea no exista ya: reponer encima de una línea
  // viva sería escribir sobre datos de otro con el nombre de «deshacer».
  const [proyecto, yaEsta] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, organizationId: authContext.organizationId },
      select: { id: true, organizationId: true },
    }),
    prisma.workItem.findUnique({ where: { id: l.id }, select: { id: true } }),
  ])
  if (!proyecto) {
    return NextResponse.json({ error: 'Not Found', message: 'Ese proyecto no existe' }, { status: 404 })
  }
  if (yaEsta) {
    return NextResponse.json(
      { error: 'Conflict', message: 'Esa línea ya existe: no hay nada que reponer.' },
      { status: 409 },
    )
  }

  // La madre se repone sólo si sigue viva. Si se borró la rama entera y esta línea vuelve primero,
  // colgarla de una madre que ya no está reventaría la clave foránea y dejaría el deshacer a
  // medias; sin madre queda en la raíz, que es visible y se arregla a mano.
  const madreViva = l.parentId
    ? await prisma.workItem.findUnique({ where: { id: l.parentId }, select: { id: true } })
    : null

  await prisma.workItem.create({
    data: {
      id: l.id,
      projectId,
      organizationId: proyecto.organizationId,
      ownerId: l.ownerId,
      kanbanColumnId: l.kanbanColumnId,
      title: l.title,
      description: l.description,
      status: l.status,
      priority: l.priority,
      ...(l.kind ? { kind: l.kind } : {}),
      ...(l.party ? { party: l.party } : {}),
      phase: l.phase ?? null,
      ...(madreViva ? { parentId: madreViva.id } : {}),
      startDate: new Date(l.startDate),
      estimatedEndDate: new Date(l.estimatedEndDate),
      estimatedHours: l.estimatedHours ?? null,
      progressPct: l.progressPct ?? 0,
    },
  })

  return NextResponse.json({ ok: true, id: l.id }, { status: 200 })
}

export const POST = withAuth(postHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })

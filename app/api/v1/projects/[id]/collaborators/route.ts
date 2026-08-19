/**
 * GET / PUT / DELETE /api/v1/projects/[id]/collaborators
 *
 * Quién está sentado en el proyecto y con qué papel (§10.1). Es lo que hasta ahora sólo se podía
 * tocar con un guion.
 *
 * Todo lo que escribe pide `manage_project_settings`, que es el permiso del propietario: repartir
 * papeles es repartir permisos, y quien pudiera hacerlo sin ese permiso podría dárselo a sí mismo.
 * Leer pide sólo ver el proyecto — saber quién más está es parte de trabajar en él.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { exigirPermiso } from '@/lib/middleware/exigir-permiso'
import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import prisma from '@/lib/prisma'
import { ROLES_DE_PROYECTO, type RolDeProyecto } from '@/lib/projects/permisos'
import { Permission } from '@/types'

const cuerpo = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES_DE_PROYECTO as unknown as [RolDeProyecto, ...RolDeProyecto[]]),
})

async function getHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const negado = await exigirPermiso(authContext.userId, id, 'view_dashboard')
  if (negado) return negado

  const [proyecto, filas] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      select: {
        ownerId: true,
        projectManagerId: true,
        owner: { select: { id: true, name: true, email: true } },
        projectManager: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.projectCollaborator.findMany({
      where: { projectId: id },
      select: { role: true, user: { select: { id: true, name: true, email: true } } },
    }),
  ])
  if (!proyecto) {
    return NextResponse.json({ error: 'Not Found', message: 'Ese proyecto no existe' }, { status: 404 })
  }

  /**
   * El dueño y el gestor salen en la lista aunque no tengan fila de colaborador.
   *
   * Lo son por construcción —así lo decide `papelEnElProyecto`— y una pantalla que no los enseñara
   * diría que el proyecto no tiene propietario. Van marcados como `implicito` para que se vea que su
   * papel no se cambia desde aquí, sino cambiando el dueño del proyecto.
   */
  const gente: {
    id: string
    nombre: string
    correo: string
    papel: RolDeProyecto
    implicito: boolean
  }[] = []
  const vistos = new Set<string>()

  if (proyecto.owner) {
    gente.push({
      id: proyecto.owner.id,
      nombre: proyecto.owner.name,
      correo: proyecto.owner.email,
      papel: 'OWNER',
      implicito: true,
    })
    vistos.add(proyecto.owner.id)
  }
  if (proyecto.projectManager && !vistos.has(proyecto.projectManager.id)) {
    gente.push({
      id: proyecto.projectManager.id,
      nombre: proyecto.projectManager.name,
      correo: proyecto.projectManager.email,
      papel: 'MANAGER',
      implicito: true,
    })
    vistos.add(proyecto.projectManager.id)
  }
  for (const fila of filas) {
    if (vistos.has(fila.user.id)) continue
    gente.push({
      id: fila.user.id,
      nombre: fila.user.name,
      correo: fila.user.email,
      // Un papel que no reconocemos se enseña como el más restrictivo, igual que lo trata la
      // guardia: la pantalla no puede decir que alguien tiene más permisos de los que tiene.
      papel: (ROLES_DE_PROYECTO as readonly string[]).includes(fila.role)
        ? (fila.role as RolDeProyecto)
        : 'CLIENT',
      implicito: false,
    })
  }

  return NextResponse.json({ gente }, { status: 200 })
}

async function putHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const negado = await exigirPermiso(
    authContext.userId,
    id,
    'manage_project_settings',
    'Repartir papeles es repartir permisos: sólo puede hacerlo quien administra el proyecto.',
  )
  if (negado) return negado

  const datos = cuerpo.safeParse(await request.json().catch(() => null))
  if (!datos.success) {
    return NextResponse.json(
      {
        error: 'Validation Error',
        message: `Se esperan userId y role (${ROLES_DE_PROYECTO.join(', ')}).`,
      },
      { status: 400 },
    )
  }

  const proyecto = await prisma.project.findUnique({ where: { id }, select: { ownerId: true } })
  if (!proyecto) {
    return NextResponse.json({ error: 'Not Found', message: 'Ese proyecto no existe' }, { status: 404 })
  }
  // El papel del dueño no se toca desde aquí: lo es por ser dueño, y una fila de colaborador que
  // dijera otra cosa sería una segunda verdad que la guardia ignora — la pantalla enseñaría un
  // papel y el servidor aplicaría otro.
  if (datos.data.userId === proyecto.ownerId) {
    return NextResponse.json(
      {
        error: 'Conflict',
        message:
          'El propietario lo es por serlo del proyecto. Para cambiarlo, cambia el propietario del proyecto.',
      },
      { status: 409 },
    )
  }

  await prisma.projectCollaborator.upsert({
    where: { projectId_userId: { projectId: id, userId: datos.data.userId } },
    create: { projectId: id, userId: datos.data.userId, role: datos.data.role },
    update: { role: datos.data.role },
  })
  return NextResponse.json({ ok: true }, { status: 200 })
}

async function deleteHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const negado = await exigirPermiso(
    authContext.userId,
    id,
    'manage_project_settings',
    'Repartir papeles es repartir permisos: sólo puede hacerlo quien administra el proyecto.',
  )
  if (negado) return negado

  const userId = request.nextUrl.searchParams.get('userId')
  if (!userId) {
    return NextResponse.json(
      { error: 'Validation Error', message: 'Falta userId en la consulta.' },
      { status: 400 },
    )
  }
  await prisma.projectCollaborator.deleteMany({ where: { projectId: id, userId } })
  return NextResponse.json({ ok: true }, { status: 200 })
}

export const GET = withAuth(getHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const PUT = withAuth(putHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const DELETE = withAuth(deleteHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })

/**
 * GET / PUT / DELETE /api/v1/projects/[id]/calendar
 *
 * El calendario laborable del proyecto (§3.1): qué días de la semana se trabaja y qué fechas son
 * festivas.
 *
 * Existía en el modelo y lo leía el motor, pero sólo se podía crear escribiendo en la base. Sin
 * esto, un proyecto que trabaja sábados o que tiene el calendario de un país concreto no se puede
 * configurar sin un cliente de MySQL.
 *
 * ## Por qué pide el permiso del plan
 *
 * Porque cambiarlo **mueve fechas**. Quitar el viernes de la semana laborable corre el cierre de
 * mil líneas; añadir un festivo, también. No es un ajuste de pantalla: es la decisión de plan más
 * silenciosa que hay, porque el efecto no se ve donde se pulsa.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { exigirPermiso } from '@/lib/middleware/exigir-permiso'
import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import prisma from '@/lib/prisma'
import {
  SEMANA_POR_OMISION,
  normalizarSemana,
  porQueNoEsFestivoValido,
  porQueNoEsSemanaValida,
} from '@/lib/scheduling/calendario-editable'
import { Permission } from '@/types'

const MOTIVO =
  'Cambiar el calendario mueve las fechas de todo el plan. Puedes actualizar estado y avance, pero no el plan.'

const cuerpo = z.object({
  /** Días de la semana laborables: 0 domingo, 6 sábado. */
  semana: z.array(z.number()).optional(),
  /** País de festivos, o `null` para ninguno. */
  pais: z.string().length(2).nullable().optional(),
  /** Fechas no laborables propias, en formato AAAA-MM-DD. */
  festivos: z.array(z.object({ fecha: z.string(), nombre: z.string().max(80).optional() })).optional(),
})

async function getHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const negado = await exigirPermiso(authContext.userId, id, 'view_gantt')
  if (negado) return negado

  const cal = await prisma.projectCalendar.findUnique({
    where: { projectId: id },
    select: {
      workingWeekdays: true,
      holidayCountry: true,
      holidays: { select: { date: true, name: true }, orderBy: { date: 'asc' } },
    },
  })

  // Sin fila, se devuelve lo de por omisión y no un 404: el proyecto **tiene** calendario —lunes a
  // viernes— aunque nadie haya escrito la fila. Un 404 haría creer que no hay calendario.
  return NextResponse.json(
    {
      semana: Array.isArray(cal?.workingWeekdays)
        ? (cal.workingWeekdays as number[])
        : [...SEMANA_POR_OMISION],
      pais: cal?.holidayCountry ?? null,
      festivos: (cal?.holidays ?? []).map((h) => ({
        fecha: h.date.toISOString().slice(0, 10),
        nombre: h.name,
      })),
      // Se dice si la fila existe: quien administra necesita saber si está mirando lo guardado o lo
      // de por omisión, porque lo segundo cambia en cuanto alguien toque el valor por omisión.
      guardado: cal !== null,
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
  const negado = await exigirPermiso(authContext.userId, id, 'edit_schedule', MOTIVO)
  if (negado) return negado

  const datos = cuerpo.safeParse(await request.json().catch(() => null))
  if (!datos.success) {
    return NextResponse.json(
      { error: 'Validation Error', message: 'Se esperan semana, pais o festivos.' },
      { status: 400 },
    )
  }

  // Las mismas reglas que aplica la pantalla, desde el mismo sitio.
  if (datos.data.semana) {
    const motivo = porQueNoEsSemanaValida(datos.data.semana)
    if (motivo) return NextResponse.json({ error: 'Validation Error', message: motivo }, { status: 400 })
  }
  for (const f of datos.data.festivos ?? []) {
    const motivo = porQueNoEsFestivoValido(f.fecha)
    if (motivo) {
      return NextResponse.json(
        { error: 'Validation Error', message: `${f.fecha}: ${motivo}` },
        { status: 400 },
      )
    }
  }

  const proyecto = await prisma.project.findFirst({
    where: { id, organizationId: authContext.organizationId },
    select: { organizationId: true },
  })
  if (!proyecto) {
    return NextResponse.json({ error: 'Not Found', message: 'Ese proyecto no existe' }, { status: 404 })
  }

  const semana = datos.data.semana ? normalizarSemana(datos.data.semana) : undefined

  await prisma.$transaction(async (tx) => {
    const cal = await tx.projectCalendar.upsert({
      where: { projectId: id },
      create: {
        projectId: id,
        organizationId: proyecto.organizationId,
        workingWeekdays: semana ?? [...SEMANA_POR_OMISION],
        holidayCountry: datos.data.pais ?? null,
      },
      update: {
        ...(semana ? { workingWeekdays: semana } : {}),
        ...(datos.data.pais !== undefined ? { holidayCountry: datos.data.pais } : {}),
      },
      select: { id: true },
    })

    // Los festivos se reemplazan enteros y no se van añadiendo: quien manda la lista manda **la**
    // lista, y con un añadido incremental no habría forma de quitar uno sin una ruta más.
    if (datos.data.festivos) {
      await tx.projectHoliday.deleteMany({ where: { calendarId: cal.id } })
      if (datos.data.festivos.length > 0) {
        await tx.projectHoliday.createMany({
          data: datos.data.festivos.map((f) => ({
            calendarId: cal.id,
            date: new Date(`${f.fecha}T00:00:00Z`),
            name: f.nombre ?? 'No laborable',
          })),
          skipDuplicates: true,
        })
      }
    }
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}

async function deleteHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const negado = await exigirPermiso(authContext.userId, id, 'edit_schedule', MOTIVO)
  if (negado) return negado

  // Borrar la fila devuelve el proyecto al calendario de por omisión. Es la forma de decir «vuelve
  // a lunes a viernes sin festivos propios» sin tener que enumerarlo.
  await prisma.projectCalendar.deleteMany({ where: { projectId: id } })
  return NextResponse.json({ ok: true }, { status: 200 })
}

export const GET = withAuth(getHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const PUT = withAuth(putHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const DELETE = withAuth(deleteHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })

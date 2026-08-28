/**
 * GET  /api/v1/projects/[id]/export/config — cómo está configurada la exportación
 * PUT  /api/v1/projects/[id]/export/config — cambiarla
 *
 * Lo que aquí se guarda es **el tema**: qué color y qué peso visual lleva cada clase de línea, y
 * qué texto encabeza el archivo. Nunca contenido: ni qué líneas salen ni qué columnas hay.
 *
 * Existe esta pantalla porque sin ella la parte configurable del exportador era inalcanzable.
 * El mapa se podía poner —yo mismo lo puse la primera vez— sólo con SQL directo contra la base,
 * que no es una forma de configurar un producto: no queda rastro de quién lo cambió, no se puede
 * revisar antes de guardar, y nadie que no tenga la contraseña de la base puede tocarlo.
 *
 * El GET devuelve además **los tipos que ese plan usa de verdad, con su carga**. Ofrecer la lista
 * completa de clases del sistema haría configurar tipos que ese proyecto no tiene, y esconde el
 * dato que de verdad ayuda a decidir: que «Entrega cliente» son 130 líneas y «Compuerta» son 4.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import prisma from '@/lib/prisma'
import { exigirPermiso } from '@/lib/middleware/exigir-permiso'
import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import { etiquetaDeClase } from '@/lib/export/plan/clases'
import { ASPECTO, PAPELES, esPapel } from '@/lib/export/plan/roles'
import { Permission } from '@/types'

const MOTIVO_ESCRITURA =
  'Cambiar cómo se ve el plan exportado es configuración del proyecto, y necesita permiso para gestionarla.'

/**
 * Cuánto texto se admite.
 *
 * No es una regla de negocio: es que estos textos van a una celda de Excel, y una celda no admite
 * más de 32 767 caracteres. Un tope holgado y muy por debajo evita que el archivo salga cortado
 * sin avisar.
 */
const LARGO_MAXIMO = 2_000

const cuerpo = z.object({
  /** Tipo del plan → papel semántico. Un tipo ausente cae en los respaldos automáticos. */
  papeles: z.record(z.string().min(1).max(120), z.string()).optional(),
  descripcion: z.string().max(LARGO_MAXIMO).nullable().optional(),
  advertencias: z.array(z.string().max(LARGO_MAXIMO)).max(10).optional(),
})

async function leer(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params

  const negado = await exigirPermiso(
    authContext.userId,
    id,
    'view_gantt',
    'No tienes acceso al plan de este proyecto.',
  )
  if (negado) return negado

  const proyecto = await prisma.project.findFirst({
    where: { id, organizationId: authContext.organizationId },
    select: { id: true },
  })
  if (!proyecto) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'Proyecto no encontrado' }, { status: 404 })
  }

  // Los tipos que este plan usa, con su carga. Se agrupa en la base y no en memoria: el plan de
  // referencia tiene 1 368 líneas y aquí sólo hacen falta siete filas.
  const porClase = await prisma.workItem.groupBy({
    by: ['kind'],
    where: { projectId: id },
    _count: { _all: true },
  })

  const guardada = await prisma.projectExportConfig
    .findUnique({ where: { projectId: id } })
    .catch(() => null)

  const puedeEditar =
    (await exigirPermiso(authContext.userId, id, 'manage_project_settings', MOTIVO_ESCRITURA)) === null

  return NextResponse.json({
    puedeEditar,
    tipos: porClase
      .map((c) => ({ clave: etiquetaDeClase(c.kind), cuantas: c._count._all }))
      .sort((a, b) => b.cuantas - a.cuantas || a.clave.localeCompare(b.clave, 'es')),
    // El catálogo de papeles con su aspecto, para que la pantalla pueda enseñar el color de cada
    // uno sin tener una segunda copia de la paleta.
    papelesPosibles: PAPELES.map((papel) => ({ papel, aspecto: ASPECTO[papel] })),
    config: {
      papeles: (guardada?.roleMap as Record<string, string> | null) ?? {},
      descripcion: guardada?.headerDescription ?? null,
      advertencias: Array.isArray(guardada?.headerWarnings)
        ? (guardada.headerWarnings as unknown[]).filter((a): a is string => typeof a === 'string')
        : [],
    },
  })
}

async function guardar(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params

  const negado = await exigirPermiso(authContext.userId, id, 'manage_project_settings', MOTIVO_ESCRITURA)
  if (negado) return negado

  const pedido = cuerpo.safeParse(await request.json().catch(() => null))
  if (!pedido.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'Cuerpo inválido: se esperan papeles, descripcion y advertencias.' },
      { status: 400 },
    )
  }

  const proyecto = await prisma.project.findFirst({
    where: { id, organizationId: authContext.organizationId },
    select: { id: true },
  })
  if (!proyecto) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'Proyecto no encontrado' }, { status: 404 })
  }

  // Un papel que no existe se RECHAZA, no se ignora en silencio. El exportador sí lo ignora —ahí
  // conviene aguantar una configuración vieja antes que tumbar una descarga— pero al guardar lo
  // que hace falta es lo contrario: quien se equivoca escribiendo tiene que enterarse en el
  // momento, no descubrir semanas después que un color nunca se aplicó.
  const papeles: Record<string, string> = {}
  for (const [tipo, papel] of Object.entries(pedido.data.papeles ?? {})) {
    if (papel === '') continue // «automático»: se quita del mapa y manda el respaldo
    if (!esPapel(papel)) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: `«${papel}» no es un papel válido.` },
        { status: 400 },
      )
    }
    papeles[tipo.trim()] = papel
  }

  const descripcion = pedido.data.descripcion?.trim() || null
  const advertencias = (pedido.data.advertencias ?? []).map((a) => a.trim()).filter(Boolean)

  await prisma.projectExportConfig.upsert({
    where: { projectId: id },
    create: {
      projectId: id,
      roleMap: papeles,
      headerDescription: descripcion,
      headerWarnings: advertencias,
    },
    update: {
      roleMap: papeles,
      headerDescription: descripcion,
      headerWarnings: advertencias,
    },
  })

  return NextResponse.json({ papeles, descripcion, advertencias })
}

export const GET = withAuth(leer, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const PUT = withAuth(guardar, { requiredPermissions: [Permission.PROJECT_UPDATE] })

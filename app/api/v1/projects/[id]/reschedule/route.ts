/**
 * POST /api/v1/projects/[id]/reschedule
 *
 * Mueve una línea del plan y empuja lo que quede en falso (§3.0, §7.2).
 *
 * Con `confirm: false` —lo de por omisión— **no escribe nada**: devuelve qué pasaría. Arrastrar una
 * barra puede empujar quinientas líneas, y hacerlo sin avisar sería peor que no poder arrastrar.
 *
 * Es POST también para previsualizar, aunque no escriba: la petición lleva cuerpo y no es
 * cacheable, y un GET con cuerpo es una trampa para cualquier proxy que se cruce.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import { type IsoDate } from '@/lib/scheduling/date'
import { confirmar, previsualizar, restaurarFechas } from '@/services/reschedule.service'
import { Permission } from '@/types'

/**
 * Devolver unas fechas exactas. Es lo que manda deshacer.
 *
 * Va por esta misma ruta y no por la general de la línea porque tiene que ser **una** transacción:
 * deshacer una reprogramación de 394 líneas con 394 peticiones deja el plan medio revertido en
 * cuanto una falle, y quien pulsó Ctrl+Z creía estar volviendo atrás.
 */
const esquemaDeRestauracion = z.object({
  restore: z
    .array(
      z.object({
        id: z.string().uuid(),
        start: z.string().min(10).max(10),
        finish: z.string().min(10).max(10),
        constraintType: z.string().nullable().default(null),
        constraintDate: z.string().min(10).max(10).nullable().default(null),
      }),
    )
    .min(1),
})

const esquema = z.object({
  taskId: z.string().uuid(),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va en formato AAAA-MM-DD'),
  confirm: z.boolean().default(false),
})

async function postHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const cuerpo = await request.json().catch(() => ({}))

    const restauracion = esquemaDeRestauracion.safeParse(cuerpo)
    if (restauracion.success) {
      const escritas = await restaurarFechas(
        id,
        authContext.organizationId,
        restauracion.data.restore.map((f) => ({
          id: f.id,
          fechas: {
            start: f.start as IsoDate,
            finish: f.finish as IsoDate,
            constraintType: f.constraintType,
            constraintDate: f.constraintDate as IsoDate | null,
          },
        })),
      )
      if (escritas === null) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Ese proyecto no existe' },
          { status: 404 },
        )
      }
      return NextResponse.json({ restauradas: escritas }, { status: 200 })
    }

    const { taskId, start, confirm } = esquema.parse(cuerpo)

    if (!confirm) {
      const previsualizacion = await previsualizar(
        id,
        authContext.organizationId,
        taskId,
        start as IsoDate,
      )
      if (!previsualizacion) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Ese proyecto o esa línea no existen' },
          { status: 404 },
        )
      }
      return NextResponse.json({ previsualizacion }, { status: 200 })
    }

    const resultado = await confirmar(id, authContext.organizationId, taskId, start as IsoDate)
    if (!resultado) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Ese proyecto o esa línea no existen' },
        { status: 404 },
      )
    }

    return NextResponse.json({ resultado }, { status: 200 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Bad Request', message: error.issues[0]?.message ?? 'Datos inválidos' },
        { status: 400 },
      )
    }
    console.error('[POST /api/v1/projects/[id]/reschedule] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'No se pudo reprogramar' },
      { status: 500 },
    )
  }
}

// Previsualizar no escribe, pero se pide el mismo permiso: enseñar el efecto de una reprogramación
// a quien no puede aplicarla es ofrecerle un gesto que no va a poder terminar.
export const POST = withAuth(postHandler, { requiredPermissions: [Permission.PROJECT_UPDATE] })

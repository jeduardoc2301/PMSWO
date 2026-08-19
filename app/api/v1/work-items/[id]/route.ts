/**
 * GET /api/v1/work-items/[id]
 * Get a work item by ID
 * 
 * PATCH /api/v1/work-items/[id]
 * Update a work item
 */

import { NextRequest, NextResponse } from 'next/server'

import { confirmar } from '@/services/reschedule.service'
import { type IsoDate } from '@/lib/scheduling/date'

/** La fecha civil de una fecha guardada. En UTC, que es como se guardan. */
function isoDeFecha(fecha: Date): IsoDate {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(
    fecha.getUTCDate(),
  ).padStart(2, '0')}` as IsoDate
}
import { columnaAlCambiarProgreso, estadoDeLaColumna } from '@/lib/projects/status-progress'
import { z } from 'zod'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { hasPermission } from '@/lib/rbac'
import { NotFoundError, ValidationError } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { verificarPadre } from '@/services/workitem.service'
import { Permission, UserRole, WorkItemStatus, WorkItemPriority } from '@/types'

const updateWorkItemSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.nativeEnum(WorkItemStatus).optional(),
  priority: z.nativeEnum(WorkItemPriority).optional(),
  startDate: z.string().optional(),
  estimatedEndDate: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  phase: z.string().nullable().optional(),
  estimatedHours: z.number().int().min(0).nullable().optional(),
  // Avance real de 0 a 1, como lo captura quien revisa el plan. Es el insumo del estado al corte y
  // del atraso en días; el resumen no se captura, se acumula ponderado desde las hojas.
  progressPct: z.number().min(0).max(1).optional(),
  // Mover la línea en la jerarquía. null la sube a raíz; ausente la deja donde está. Las reglas de
  // forma del árbol (padre del mismo proyecto, sin ciclos) las aplica `verificarPadre`.
  parentId: z.string().nullable().optional(),
})

async function getWorkItemHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const organizationId = authContext.organizationId

    // Get work item with details
    const workItem = await prisma.workItem.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!workItem) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Work item not found',
        },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        workItem,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[Get Work Item] Error:', error)
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to get work item',
      },
      { status: 500 }
    )
  }
}

async function updateWorkItemHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const organizationId = authContext.organizationId

    // Parse and validate request body
    const body = await request.json()
    const validationResult = updateWorkItemSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid request data',
          details: validationResult.error.issues.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        },
        { status: 400 }
      )
    }

    const updateData = validationResult.data

    // Verify work item exists and belongs to user's organization
    const workItem = await prisma.workItem.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        project: true,
      },
    })

    if (!workItem) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Work item not found',
        },
        { status: 404 }
      )
    }

    // Mover en la jerarquía se juzga antes de escribir: un ciclo guardado rompe el prorrateo del
    // avance y con él todas las pantallas que recorren el árbol. Truena con ValidationError o
    // NotFoundError, que el catch traduce a 400 y 404.
    if (updateData.parentId !== undefined) {
      await verificarPadre(workItem.projectId, id, updateData.parentId)
    }

    // ── El otro sentido del acoplamiento estado ↔ avance (§4.7) ──────────────────────────────
    // Capturar el 100 % en la rejilla tiene que mover la tarjeta a la columna terminal, igual que
    // arrastrarla allí pone el avance al 100 %. Antes esto sólo escribía `status: DONE` y dejaba
    // `kanbanColumnId` donde estaba: la línea decía «terminada» y la tarjeta seguía en «Backlog»,
    // que es exactamente la contradicción que el acoplamiento existe para evitar.
    let movimientoPorAvance: { kanbanColumnId: string; status: WorkItemStatus } | null = null
    if (updateData.progressPct !== undefined && updateData.progressPct !== workItem.progressPct) {
      const columnas = await prisma.kanbanColumn.findMany({
        where: { projectId: workItem.projectId },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, isInitial: true, isDone: true, columnType: true },
      })
      const actual = columnas.find((c) => c.id === workItem.kanbanColumnId)
      const destino = columnaAlCambiarProgreso(updateData.progressPct, actual, columnas)
      // `null` significa «la columna que tiene ya sirve»: no se escribe para dejar todo igual.
      if (destino) {
        movimientoPorAvance = {
          kanbanColumnId: destino.id,
          status: estadoDeLaColumna(destino) as WorkItemStatus,
        }
      }
    }

    // Update work item
    const updatedWorkItem = await prisma.workItem.update({
      where: { id },
      data: {
        ...(updateData.title && { title: updateData.title }),
        ...(updateData.description !== undefined && { description: updateData.description }),
        ...(updateData.status && { status: updateData.status }),
        ...(updateData.priority && { priority: updateData.priority }),
        ...(updateData.startDate && { startDate: new Date(updateData.startDate) }),
        ...(updateData.estimatedEndDate && { estimatedEndDate: new Date(updateData.estimatedEndDate) }),
        ...(updateData.ownerId && { ownerId: updateData.ownerId }),
        ...(updateData.phase !== undefined && { phase: updateData.phase }),
        ...(updateData.estimatedHours !== undefined && { estimatedHours: updateData.estimatedHours }),
        // Contra undefined y no por verdadero: null significa «súbela a la raíz», y por verdadero
        // ese movimiento se perdería en silencio.
        ...(updateData.parentId !== undefined && { parentId: updateData.parentId }),
        ...(updateData.progressPct !== undefined && { progressPct: updateData.progressPct }),
        // El movimiento va después del avance para que su estado mande: si los dos escribieran
        // `status`, el último ganaría por accidente en vez de por decisión.
        ...(movimientoPorAvance ?? {}),
        ...(updateData.status === WorkItemStatus.DONE && !workItem.completedAt && {
          completedAt: new Date(),
        }),
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    /**
     * Mover una fecha aquí tiene que significar lo mismo que moverla en el Gantt (§6.3, criterio 4).
     *
     * Antes esta ruta escribía la fecha **y nada más**: las sucesoras se quedaban donde estaban y el
     * plan salía con vínculos incumplidos, en silencio. Dos vistas con dos ideas distintas de qué es
     * mover una fecha, y la de aquí dejaba el cronograma peor de lo que lo encontró.
     *
     * Se llama al mismo motor que usa el arrastre —no a una copia de sus reglas— y **después** de
     * escribir, para que un cambio de duración (mover el fin) también empuje lo que dependa de ella.
     * Sólo empuja: una sucesora con holgura se queda donde está.
     */
    let empujadas = 0
    if (updateData.startDate !== undefined || updateData.estimatedEndDate !== undefined) {
      /**
       * Mover fechas es tocar el plan, y el plan pide el permiso del plan (§10.1).
       *
       * Es la distinción `edit_schedule` / `edit_tracking` que el spec llama «el permiso más útil
       * de todo el sistema»: quien ejecuta actualiza el estado y el avance de sus líneas sin poder
       * alterar el cronograma. Aquí se expresa con los permisos que ya existen — el mismo que exige
       * la ruta de reprogramar.
       *
       * Hacía falta desde el momento en que esta ruta empezó a reprogramar: `INTERNAL_CONSULTANT`
       * tiene `WORK_ITEM_UPDATE` y no `PROJECT_UPDATE`, así que no puede llamar a `/reschedule`
       * pero sí llegaba aquí — y desde aquí movía las mismas cientos de líneas. La guardia de la
       * otra ruta se saltaba por la puerta de al lado.
       */
      if (!hasPermission(authContext.roles as UserRole[], Permission.PROJECT_UPDATE)) {
        return NextResponse.json(
          {
            error: 'Forbidden',
            message:
              'Cambiar las fechas mueve el cronograma y el trabajo que depende de él. Puedes actualizar estado y avance, pero no las fechas.',
          },
          { status: 403 },
        )
      }
      const resultado = await confirmar(
        workItem.projectId,
        organizationId,
        id,
        isoDeFecha(updatedWorkItem.startDate),
      )
      // `null` sólo puede venir de que el proyecto o la línea no sean de esta organización, y eso
      // ya se comprobó arriba: si pasara, es mejor devolver la línea escrita que fingir un 404.
      empujadas = resultado ? Math.max(0, resultado.escritas - 1) : 0
    }

    return NextResponse.json(
      {
        workItem: updatedWorkItem,
        // Cuántas sucesoras se movieron detrás. Quien edite desde una tabla merece saber que su
        // cambio de una celda movió otras doce líneas.
        empujadas,
      },
      { status: 200 }
    )
  } catch (error) {
    /**
     * Los errores del servicio, a códigos HTTP. Se reconocen también por `name`, además de por
     * `instanceof`.
     *
     * El respaldo por nombre nació de un diagnóstico equivocado —se creyó que el empaquetador
     * cargaba dos copias de `lib/errors`—. La causa real era otra y ya está corregida en su raíz:
     * `AppError` fijaba `AppError.prototype` en vez de `new.target.prototype`, así que **toda**
     * subclase quedaba aplanada y `instanceof ValidationError` era siempre falso. Hoy `instanceof`
     * basta; el respaldo se conserva porque no cuesta nada y protege de que alguien vuelva a
     * aplanar la cadena de prototipos sin darse cuenta.
     */
    const nombre = error instanceof Error ? error.name : ''

    if (error instanceof ValidationError || nombre === 'ValidationError') {
      return NextResponse.json(
        { error: 'Validation Error', message: (error as Error).message },
        { status: 400 }
      )
    }

    if (error instanceof NotFoundError || nombre === 'NotFoundError') {
      return NextResponse.json(
        { error: 'Not Found', message: (error as Error).message },
        { status: 404 }
      )
    }

    console.error('[Update Work Item] Error:', error)
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to update work item',
      },
      { status: 500 }
    )
  }
}

async function deleteWorkItemHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext
): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const organizationId = authContext.organizationId

    // Verify work item exists and belongs to user's organization
    const workItem = await prisma.workItem.findFirst({
      where: {
        id,
        organizationId,
      },
    })

    if (!workItem) {
      return NextResponse.json(
        {
          error: 'Not Found',
          message: 'Work item not found',
        },
        { status: 404 }
      )
    }

    // Delete work item (cascade will handle related records)
    await prisma.workItem.delete({
      where: { id },
    })

    return NextResponse.json(
      {
        message: 'Work item deleted successfully',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[Delete Work Item] Error:', error)
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to delete work item',
      },
      { status: 500 }
    )
  }
}

export const GET = withAuth(getWorkItemHandler, {
  requiredPermissions: [Permission.WORK_ITEM_VIEW],
})

export const PATCH = withAuth(updateWorkItemHandler, {
  requiredPermissions: [Permission.WORK_ITEM_UPDATE],
})

export const DELETE = withAuth(deleteWorkItemHandler, {
  requiredPermissions: [Permission.WORK_ITEM_DELETE],
})

/**
 * GET /api/v1/work-items/[id]
 * Get a work item by ID
 * 
 * PATCH /api/v1/work-items/[id]
 * Update a work item
 */

import { NextRequest, NextResponse } from 'next/server'
import { authorize } from '@/services/project-authorize.service'
import { exigirPermiso } from '@/lib/middleware/exigir-permiso'

import { confirmar } from '@/services/reschedule.service'
import { type IsoDate } from '@/lib/scheduling/date'

/** La fecha civil de una fecha guardada. En UTC, que es como se guardan. */
function isoDeFecha(fecha: Date): IsoDate {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(
    fecha.getUTCDate(),
  ).padStart(2, '0')}` as IsoDate
}
import { columnaAlCambiarProgreso, estadoDeLaColumna } from '@/lib/projects/status-progress'
import { porQueNoSeAdmiteLaRestriccion } from '@/lib/scheduling/restricciones'
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
  // Las ocho del §3.4. `null` quita la restricción; ausente la deja como está. La combinación
  // código↔fecha la juzga `porQueNoSeAdmiteLaRestriccion`, que es la misma función que usa el
  // diálogo — dos redacciones del mismo rechazo acaban divergiendo, y la que se queda atrás es
  // siempre la del servidor.
  constraintType: z.string().nullable().optional(),
  constraintDate: z.string().nullable().optional(),
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

    /**
     * La otra mitad de la distinción del §10.1: escribir cualquier cosa en una línea pide
     * `edit_tracking` **en este proyecto**.
     *
     * Va aquí, antes de cualquier escritura y después de saber de qué proyecto es la línea: la ruta
     * recibe el identificador de la línea, no el del proyecto, así que hasta este punto no se puede
     * preguntar. Sin esta guardia, un cliente externo con permiso de organización para editar
     * líneas podía capturar avance en un proyecto donde sólo se le invitó a mirar — se vio midiendo:
     * mover la fecha daba 403 y capturar avance daba 200.
     */
    try {
      await authorize(authContext.userId, workItem.projectId, 'edit_tracking')
    } catch (error) {
      if (error instanceof Error && error.name === 'AuthorizationError') {
        return NextResponse.json(
          {
            error: 'Forbidden',
            message: 'No puedes editar líneas de este proyecto.',
          },
          { status: 403 },
        )
      }
      throw error
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

    /**
     * Mover fechas es tocar el plan, y el plan pide el permiso del plan (§10.1).
     *
     * Es la distinción `edit_schedule` / `edit_tracking` que el spec llama «el permiso más útil de
     * todo el sistema»: quien ejecuta actualiza el estado y el avance de sus líneas sin poder
     * alterar el cronograma.
     *
     * **Esta pregunta estuvo colocada después del `update`**, y ahí no servía de nada: se medía el
     * código de respuesta, salía 403, y la fecha ya estaba escrita. Medido contra el servidor con un
     * colaborador —que tiene `edit_tracking` y no `edit_schedule`—: la línea pasaba de 2026-06-12 a
     * 2027-03-15 y la respuesta decía «no puedes cambiar las fechas». Peor aún, sólo se escribía el
     * inicio: la línea quedaba empezando nueve meses después de terminar.
     *
     * Una guardia que responde después de escribir no es una guardia, es un cartel. Va antes de
     * cualquier escritura, como la de `edit_tracking`.
     */
    const tocaLaRestriccion =
      updateData.constraintType !== undefined || updateData.constraintDate !== undefined
    const tocaElCronograma =
      updateData.startDate !== undefined ||
      updateData.estimatedEndDate !== undefined ||
      // Cambiar la restricción mueve la línea y lo que cuelgue de ella, igual que cambiar la fecha.
      // Si no entrara aquí, quien no puede tocar el cronograma lo tocaría por la puerta de al lado
      // — que es exactamente el agujero que abrió esta guardia en su día.
      tocaLaRestriccion

    if (tocaLaRestriccion) {
      const codigo =
        updateData.constraintType !== undefined ? updateData.constraintType : workItem.constraintType
      const fecha =
        updateData.constraintDate !== undefined
          ? updateData.constraintDate
          : workItem.constraintDate
            ? isoDeFecha(workItem.constraintDate)
            : null
      // Se juzga la combinación resultante, no lo que llegó: mandar sólo el código sobre una línea
      // que ya tenía fecha es válido, y mandar sólo la fecha sobre una que no tenía código no.
      const motivo = porQueNoSeAdmiteLaRestriccion(codigo, fecha)
      if (motivo) {
        return NextResponse.json({ error: 'Bad Request', message: motivo }, { status: 400 })
      }
    }

    if (tocaElCronograma) {
      /**
       * Una línea no puede empezar después de terminar.
       *
       * Parece obvio y no lo comprobaba nadie: el esquema valida cada fecha por separado, y esta
       * ruta admite mandar **una sola**. Mandando sólo el inicio se escribía contra el fin guardado
       * sin mirarlo, y la línea quedaba empezando nueve meses después de acabar — medido: 2027-03-15
       * → 2026-06-18 sobre el plan de referencia, con un 200 y sin una palabra.
       *
       * De ahí en adelante todo lo que la toque miente: el motor le calcula una duración negativa y
       * la corrige a 1 día, el Gantt le dibuja una barra de ancho raro, y la holgura sale de una
       * tarea que no existe. Se compara contra lo guardado cuando sólo llega una de las dos, que es
       * el caso en que el error aparece.
       */
      const inicio = updateData.startDate ?? isoDeFecha(workItem.startDate)
      const fin = updateData.estimatedEndDate ?? isoDeFecha(workItem.estimatedEndDate)
      if (inicio > fin) {
        return NextResponse.json(
          {
            error: 'Bad Request',
            message: `Una línea no puede empezar después de terminar: ${inicio} va después de ${fin}. Manda las dos fechas si quieres mover la línea entera.`,
          },
          { status: 400 },
        )
      }

      try {
        await authorize(authContext.userId, workItem.projectId, 'edit_schedule')
      } catch (error) {
        if (error instanceof Error && error.name === 'AuthorizationError') {
          return NextResponse.json(
            {
              error: 'Forbidden',
              message:
                'Cambiar las fechas mueve el cronograma y el trabajo que depende de él. Puedes actualizar estado y avance, pero no las fechas.',
            },
            { status: 403 },
          )
        }
        throw error
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
        // Contra undefined, no por verdadero: `null` significa «quita la restricción» y por
        // verdadero ese borrado se perdería en silencio.
        ...(updateData.constraintType !== undefined && { constraintType: updateData.constraintType }),
        ...(updateData.constraintDate !== undefined && {
          constraintDate: updateData.constraintDate ? new Date(updateData.constraintDate) : null,
        }),
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
    if (tocaElCronograma) {
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

    /**
     * Borrar una línea es tocar el plan, y es lo más destructivo que se puede hacer con una sola
     * (§10.1).
     *
     * Se lleva por delante sus vínculos en cascada, así que deshacerlo pide reponer la línea **y** la
     * red que colgaba de ella — por eso el deshacer del §10.6 tiene un canal propio para las bajas.
     *
     * Esta puerta se quedó sin guardia cuando se pusieron las demás: `withAuth` exige
     * `WORK_ITEM_DELETE`, que es el cargo de organización, y ese cargo no dice **en qué proyecto**.
     * La encontró un agente refutando el informe de otro sobre la lista del §13.
     */
    const negado = await exigirPermiso(
      authContext.userId,
      workItem.projectId,
      'edit_schedule',
      'Borrar una línea cambia el plan del proyecto y se lleva sus vínculos con ella.',
    )
    if (negado) return negado

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

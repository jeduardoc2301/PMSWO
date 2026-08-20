/**
 * GET / POST / PATCH / DELETE /api/v1/projects/[id]/columns
 *
 * Las columnas del tablero de un proyecto (§5, §5.5).
 *
 * El spec lo pide con esta frase: «los estados son configurables por proyecto, no un enum fijo: el
 * Tablero se agrupa por ellos y el usuario necesita poder añadir columnas». La tabla existía desde
 * el principio; lo que faltaba era poder tocarla sin entrar a la base.
 *
 * ## Las dos columnas que no se pueden quedar sin dueño
 *
 * Una de las columnas es la **inicial** —donde nace lo que se crea— y otra es la de **terminado**,
 * de la que depende el acoplamiento estado↔avance. Borrar cualquiera de las dos sin que otra tome
 * el relevo dejaría el proyecto sin sitio donde poner una tarea nueva, o sin forma de decir que
 * algo acabó. Se comprueba antes de borrar.
 *
 * ## Y una columna con tarjetas no se borra a la ligera
 *
 * Borrarla se llevaría por delante el estado de todas ellas. Aquí se exige decir **a dónde** van
 * primero: mover y luego borrar, en una transacción, para que no exista el instante en que las
 * tarjetas apuntan a una columna que ya no está.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { exigirPermiso } from '@/lib/middleware/exigir-permiso'
import { porQueNoEsUnOrdenValido } from '@/lib/projects/columnas-del-tablero'
import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import prisma from '@/lib/prisma'
import { Permission } from '@/types'

const MOTIVO = 'Cambiar las columnas del tablero cambia los estados del proyecto.'

const alta = z.object({
  name: z.string().trim().min(1).max(60),
  /** Dónde va. Si no se dice, al final. */
  order: z.number().int().min(0).optional(),
})

/**
 * Lo que se puede cambiar de una columna.
 *
 * **El orden no está aquí**, y no es un olvido: `KanbanColumn` tiene `@@unique([projectId, order])`,
 * así que mover una columna a un puesto ocupado no es un `update` sino recolocarlas todas. Aceptar
 * un `order` suelto en este cuerpo daría un error de clave única disfrazado de fallo del servidor.
 *
 * Reordenar entra por el otro cuerpo que admite este mismo `PATCH`: `{ orden: [...ids] }`, la lista
 * **completa** en su orden final. Se resuelve más abajo, en `recolocar`.
 */
const cambio = z.object({
  columnId: z.string().uuid(),
  name: z.string().trim().min(1).max(60).optional(),
  isInitial: z.boolean().optional(),
  isDone: z.boolean().optional(),
})

/**
 * El otro cuerpo que admite el `PATCH`: la lista completa de columnas en su orden final.
 *
 * Se pide la lista entera y no «mueve esta al puesto 2» porque con un único puesto el servidor
 * tendría que adivinar qué hacer con la que ya estaba ahí — y las dos respuestas razonables
 * (empujar hacia abajo, intercambiar) dan tableros distintos. Con la lista no adivina nada.
 */
const reorden = z.object({
  orden: z.array(z.string().uuid()).min(1),
})

async function getHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const negado = await exigirPermiso(authContext.userId, id, 'view_board')
  if (negado) return negado

  const columnas = await prisma.kanbanColumn.findMany({
    where: { projectId: id },
    orderBy: { order: 'asc' },
    select: {
      id: true,
      name: true,
      order: true,
      isInitial: true,
      isDone: true,
      columnType: true,
      _count: { select: { workItems: true } },
    },
  })

  return NextResponse.json(
    {
      // La cuenta de tarjetas viaja con cada columna: sin ella, la pantalla no puede avisar de que
      // borrar una se lleva por delante el estado de treinta tareas.
      columnas: columnas.map((c) => ({
        id: c.id,
        nombre: c.name,
        orden: c.order,
        esInicial: c.isInitial,
        esTerminado: c.isDone,
        tarjetas: c._count.workItems,
      })),
    },
    { status: 200 },
  )
}

async function postHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const negado = await exigirPermiso(authContext.userId, id, 'manage_project_settings', MOTIVO)
  if (negado) return negado

  const datos = alta.safeParse(await request.json().catch(() => null))
  if (!datos.success) {
    return NextResponse.json(
      { error: 'Validation Error', message: 'Se espera un nombre de columna de 1 a 60 caracteres.' },
      { status: 400 },
    )
  }

  const ultima = await prisma.kanbanColumn.aggregate({
    where: { projectId: id },
    _max: { order: true },
  })
  const columna = await prisma.kanbanColumn.create({
    data: {
      projectId: id,
      name: datos.data.name,
      order: datos.data.order ?? (ultima._max.order ?? -1) + 1,
      // Una columna nueva no es ni la inicial ni la de terminado: ésas se marcan a mano, y
      // heredarlas por descuido movería dónde nacen las tareas sin que nadie lo hubiera pedido.
      isInitial: false,
      isDone: false,
      columnType: 'CUSTOM',
    },
    select: { id: true, name: true, order: true },
  })

  return NextResponse.json({ columna }, { status: 201 })
}

async function patchHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const negado = await exigirPermiso(authContext.userId, id, 'manage_project_settings', MOTIVO)
  if (negado) return negado

  const cuerpo = await request.json().catch(() => null)

  // Dos cuerpos, un verbo. El de reordenar se reconoce por traer `orden` y se resuelve aparte:
  // mezclarlo con el cambio de campos haría un manejador que hace dos cosas distintas según qué
  // llaves trae, y esa clase de rama es la que acaba escribiendo lo que no toca.
  const queRecoloca = reorden.safeParse(cuerpo)
  if (queRecoloca.success) return await recolocar(id, queRecoloca.data.orden)

  const datos = cambio.safeParse(cuerpo)
  if (!datos.success) {
    return NextResponse.json(
      { error: 'Validation Error', message: 'Se espera columnId y al menos un campo a cambiar, o bien orden con todas las columnas.' },
      { status: 400 },
    )
  }
  const { columnId, ...campos } = datos.data

  const columna = await prisma.kanbanColumn.findFirst({
    where: { id: columnId, projectId: id },
    select: { id: true },
  })
  if (!columna) {
    return NextResponse.json({ error: 'Not Found', message: 'Esa columna no existe' }, { status: 404 })
  }

  // Inicial y terminado son **una sola** por proyecto: marcar otra desmarca la anterior. Sin esto
  // habría dos columnas iniciales y dónde nace una tarea dependería del orden de la consulta.
  await prisma.$transaction(async (tx) => {
    if (campos.isInitial === true) {
      await tx.kanbanColumn.updateMany({ where: { projectId: id }, data: { isInitial: false } })
    }
    if (campos.isDone === true) {
      await tx.kanbanColumn.updateMany({ where: { projectId: id }, data: { isDone: false } })
    }
    await tx.kanbanColumn.update({ where: { id: columnId }, data: campos })
  })

  return NextResponse.json({ ok: true }, { status: 200 })
}

/**
 * Recoloca las columnas del tablero en el orden recibido (§5).
 *
 * ## Por qué son dos vueltas y no una
 *
 * `@@unique([projectId, order])` no admite ni un instante con dos columnas en el mismo puesto, y
 * MySQL comprueba la unicidad **por sentencia**, no al cerrar la transacción. Escribir los puestos
 * finales de uno en uno choca en cuanto la primera columna aterriza donde aún está otra.
 *
 * Así que primero se aparcan todas en puestos **negativos** —que ninguna columna real ocupa nunca,
 * porque el alta reparte desde cero hacia arriba— y después se bajan a su sitio. En la primera
 * vuelta no chocan entre sí porque cada una recibe un negativo distinto, y no chocan con las que
 * todavía están en positivo porque los signos no se cruzan. En la segunda, todas vienen de negativo,
 * así que el destino está libre.
 *
 * ## Y por qué se exige la lista completa
 *
 * Con una lista parcial, la segunda vuelta dejaría a las que faltan en su puesto viejo y a las
 * enviadas encima. O choca la clave única a mitad, o —peor— una columna se queda abandonada en un
 * puesto negativo y el tablero la dibuja antes que todas para siempre.
 */
async function recolocar(projectId: string, orden: readonly string[]): Promise<NextResponse> {
  const actuales = await prisma.kanbanColumn.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
    select: { id: true, name: true, order: true, isInitial: true, isDone: true },
  })

  const motivo = porQueNoEsUnOrdenValido(
    actuales.map((c) => ({
      id: c.id,
      nombre: c.name,
      orden: c.order,
      esInicial: c.isInitial,
      esTerminado: c.isDone,
      tarjetas: 0,
    })),
    orden,
  )
  if (motivo) {
    return NextResponse.json({ error: 'Validation Error', message: motivo }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < orden.length; i += 1) {
      await tx.kanbanColumn.update({ where: { id: orden[i] }, data: { order: -(i + 1) } })
    }
    for (let i = 0; i < orden.length; i += 1) {
      await tx.kanbanColumn.update({ where: { id: orden[i] }, data: { order: i } })
    }
  })

  return NextResponse.json({ ok: true, orden }, { status: 200 })
}

async function deleteHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params
  const negado = await exigirPermiso(authContext.userId, id, 'manage_project_settings', MOTIVO)
  if (negado) return negado

  const columnId = request.nextUrl.searchParams.get('columnId')
  const destinoId = request.nextUrl.searchParams.get('destinoId')
  if (!columnId) {
    return NextResponse.json(
      { error: 'Validation Error', message: 'Falta columnId en la consulta.' },
      { status: 400 },
    )
  }

  const columnas = await prisma.kanbanColumn.findMany({
    where: { projectId: id },
    select: { id: true, name: true, isInitial: true, isDone: true, _count: { select: { workItems: true } } },
  })
  const victima = columnas.find((c) => c.id === columnId)
  if (!victima) {
    return NextResponse.json({ error: 'Not Found', message: 'Esa columna no existe' }, { status: 404 })
  }
  if (columnas.length <= 1) {
    return NextResponse.json(
      { error: 'Conflict', message: 'Un tablero sin columnas no es un tablero.' },
      { status: 409 },
    )
  }
  if (victima.isInitial) {
    return NextResponse.json(
      {
        error: 'Conflict',
        message:
          'Es la columna donde nacen las tareas nuevas. Marca otra como inicial antes de borrar ésta.',
      },
      { status: 409 },
    )
  }
  if (victima.isDone) {
    return NextResponse.json(
      {
        error: 'Conflict',
        message:
          'Es la columna de terminado, de la que depende el avance al 100 %. Marca otra antes de borrar ésta.',
      },
      { status: 409 },
    )
  }
  if (victima._count.workItems > 0 && !destinoId) {
    return NextResponse.json(
      {
        error: 'Conflict',
        message: `Esa columna tiene ${victima._count.workItems} ${
          victima._count.workItems === 1 ? 'tarjeta' : 'tarjetas'
        }. Di a qué columna van antes de borrarla.`,
      },
      { status: 409 },
    )
  }
  if (destinoId && !columnas.some((c) => c.id === destinoId && c.id !== columnId)) {
    return NextResponse.json(
      { error: 'Validation Error', message: 'La columna de destino no existe en este proyecto.' },
      { status: 400 },
    )
  }

  // Mover y borrar en una transacción: si no, existiría el instante en que las tarjetas apuntan a
  // una columna que ya no está, y cualquiera que mirara el tablero en ese momento vería un hueco.
  await prisma.$transaction(async (tx) => {
    if (destinoId) {
      await tx.workItem.updateMany({
        where: { projectId: id, kanbanColumnId: columnId },
        data: { kanbanColumnId: destinoId },
      })
    }
    await tx.kanbanColumn.delete({ where: { id: columnId } })
  })

  return NextResponse.json({ ok: true, movidas: destinoId ? victima._count.workItems : 0 }, { status: 200 })
}

export const GET = withAuth(getHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const POST = withAuth(postHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const PATCH = withAuth(patchHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })
export const DELETE = withAuth(deleteHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })

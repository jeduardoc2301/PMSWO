/**
 * Preferencias de vista por usuario × proyecto × vista (§10.4).
 *
 * `settings` es JSON en la base, así que la garantía de que ahí dentro hay algo con sentido tiene
 * que ponerla este archivo: cada vista declara su esquema de zod y nada se guarda sin pasar por él.
 * Un JSON libre en una columna es cómodo el día que se escribe y caro cada día después, cuando la
 * pantalla revienta porque alguien guardó `{"widgets": "todos"}` desde una consola.
 *
 * Al leer también se valida, y una preferencia corrupta o de una versión vieja **no es un error**:
 * se devuelve la de por omisión. Que a alguien se le rompa la pantalla del panel porque su fila de
 * preferencias quedó de otra época es exactamente el fallo que esto evita.
 */

import { z } from 'zod'

import prisma from '@/lib/prisma'
import { GANTT_POR_OMISION } from '@/lib/plan/gantt-columns'
import { CRITERIOS, type CriterioDeAgrupacion } from '@/lib/projects/kanban-group'
import { CAMPOS_DE_ORDEN, type CampoDeOrden } from '@/lib/projects/kanban-sort'
import { PANEL_POR_OMISION, WIDGETS_DEL_PANEL } from '@/lib/projects/dashboard-widgets'

/** Las vistas que pueden guardar preferencia. */
export const VISTAS = ['PANEL', 'GANTT', 'TABLERO', 'LISTA', 'CALENDARIO', 'CARGA'] as const
export type Vista = (typeof VISTAS)[number]

const esquemaDelPanel = z.object({
  widgets: z.array(z.enum(WIDGETS_DEL_PANEL)),
})

/**
 * Lo que el Gantt guarda por usuario (§4.8, criterio 8).
 *
 * Los anchos entran como número suelto y se acotan al **leer**, no aquí: lo guardado puede venir de
 * otra versión del catálogo, y rechazarlo dejaría a alguien sin sus preferencias por un cambio que
 * no hizo él. Los identificadores de columna tampoco se validan contra el catálogo por lo mismo —
 * `columnasVisibles` descarta los que ya no existen.
 */
const esquemaDelGantt = z.object({
  columnas: z.array(z.string()).max(40),
  anchos: z.record(z.string(), z.number()),
  escala: z.enum(['MES', 'SEMANA']),
  nivel: z.number().int().min(0).max(32),
  flechas: z.enum(['NINGUNO', 'SELECCION', 'TODOS']),
})

/**
 * Lo que la Lista guarda por usuario (§6.3, criterio 1: «la elección se recuerda»).
 *
 * Va aparte del Gantt a propósito, como recomienda el §6.2: en la Lista se suelen querer más
 * columnas, y compartir la preferencia obligaría a elegir una sola respuesta para dos preguntas
 * distintas.
 */
const esquemaDeLaLista = z.object({
  formato: z.enum(['ESQUEMA', 'LISTA', 'AGRUPADA']),
  agruparPor: z.enum(['status', 'priority', 'owner', 'phase']),
})

/**
 * Lo que el Tablero guarda por usuario (§10.4).
 *
 * Agrupación y orden y nada más. Los filtros de la barra —persona, prioridad, urgencia, búsqueda—
 * **no** se guardan a propósito: el §10.2 los define como un dato del proyecto compartido por las
 * seis vistas, y duplicarlos aquí daría dos filtros con la misma cara y respuestas distintas según
 * por dónde se hubieran puesto.
 */
const esquemaDelTablero = z.object({
  // Los valores salen de los catálogos del propio Tablero y no se repiten aquí a mano: escribirlos
  // de memoria ya dio una lista que no existía —«fase», «avance»— y habría guardado preferencias
  // que ninguna pantalla sabe leer.
  agruparPor: z.enum(CRITERIOS.map((c) => c.clave) as [CriterioDeAgrupacion, ...CriterioDeAgrupacion[]]),
  ordenarPor: z.enum(CAMPOS_DE_ORDEN.map((c) => c.clave) as [CampoDeOrden, ...CampoDeOrden[]]),
  sentido: z.enum(['asc', 'desc']),
})

/**
 * Lo que la Carga guarda por usuario (§10.4).
 *
 * El modo de lectura, que es la elección que se rehace en cada visita: quien planifica capacidad
 * mira horas, quien reparte gente mira porcentajes, y cada cual vuelve siempre al suyo.
 *
 * El rango de fechas no se guarda: es dónde estás mirando, no cómo lees. Guardarlo devolvería a
 * alguien a una ventana de hace tres semanas sin que hubiera pedido viajar allí.
 */
const esquemaDeLaCarga = z.object({
  modo: z.enum(['horas', 'tareas', 'porcentaje']),
})

const ESQUEMAS: Partial<Record<Vista, z.ZodTypeAny>> = {
  PANEL: esquemaDelPanel,
  GANTT: esquemaDelGantt,
  LISTA: esquemaDeLaLista,
  TABLERO: esquemaDelTablero,
  CARGA: esquemaDeLaCarga,
  // CALENDARIO no tiene ninguno, y no es un olvido: sus únicas elecciones son el mes que se mira
  // —que es dónde estás, no cómo lees— y el filtro, que ya vive en el proyecto por el §10.2.
  // Inventarle una preferencia para que la cuenta diera seis sería peor que reconocer que no la
  // necesita.
}
const POR_OMISION: Partial<Record<Vista, unknown>> = {
  PANEL: PANEL_POR_OMISION,
  GANTT: GANTT_POR_OMISION,
  // El esquema es el formato por omisión que pide el §6.1: es el que enseña la forma del plan.
  LISTA: { formato: 'ESQUEMA', agruparPor: 'status' },
  // Por estado y en orden de EDT: es como llega el plan del archivo y como lo lee quien lo conoce.
  TABLERO: { agruparPor: 'estado', ordenarPor: 'wbs', sentido: 'asc' },
  CARGA: { modo: 'horas' },
}

/**
 * Valida lo que entra para una vista.
 *
 * @throws z.ZodError si la forma no cuadra. Quien llama lo traduce a un 400: guardar basura en
 *   silencio es peor que rechazarla, porque el fallo aparece luego y lejos.
 */
export function validarPreferencia(view: Vista, settings: unknown): unknown {
  const esquema = ESQUEMAS[view]
  // Una vista sin esquema declarado todavía no guarda nada. Mejor decirlo que aceptar cualquier
  // cosa y descubrir el formato el día que haya que leerlo.
  if (!esquema) throw new z.ZodError([{ code: 'custom', path: ['view'], message: `La vista ${view} todavía no guarda preferencias.` }])
  return esquema.parse(settings)
}

export function preferenciaPorOmision(view: Vista): unknown {
  return POR_OMISION[view] ?? null
}

export async function leerPreferencia(
  userId: string,
  projectId: string,
  view: Vista,
): Promise<unknown> {
  const fila = await prisma.viewPreference.findUnique({
    where: { userId_projectId_view: { userId, projectId, view } },
    select: { settings: true },
  })
  if (!fila) return preferenciaPorOmision(view)

  const esquema = ESQUEMAS[view]
  if (!esquema) return preferenciaPorOmision(view)

  const resultado = esquema.safeParse(fila.settings)
  // Guardada en otra época o tocada a mano: se cae de pie a la de por omisión en vez de romper la
  // pantalla de quien no hizo nada malo.
  return resultado.success ? resultado.data : preferenciaPorOmision(view)
}

export async function guardarPreferencia(
  organizationId: string,
  userId: string,
  projectId: string,
  view: Vista,
  settings: unknown,
): Promise<unknown> {
  const limpio = validarPreferencia(view, settings)
  const guardado = limpio as object

  await prisma.viewPreference.upsert({
    where: { userId_projectId_view: { userId, projectId, view } },
    create: { organizationId, userId, projectId, view, settings: guardado },
    update: { settings: guardado },
  })

  return limpio
}

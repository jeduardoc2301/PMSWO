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

const ESQUEMAS: Partial<Record<Vista, z.ZodTypeAny>> = {
  PANEL: esquemaDelPanel,
  GANTT: esquemaDelGantt,
}
const POR_OMISION: Partial<Record<Vista, unknown>> = {
  PANEL: PANEL_POR_OMISION,
  GANTT: GANTT_POR_OMISION,
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

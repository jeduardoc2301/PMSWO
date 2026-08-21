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
import { COLUMNAS_POR_OMISION } from '@/lib/projects/list-columns'

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
  // Las seis del §4.3. La de hora entró cuando la duración empezó a guardarse en minutos (§2):
  // hasta entonces ninguna tarea tenía nada por debajo del día y el eje habría dibujado ocho
  // columnas idénticas por jornada.
  escala: z.enum(['HORA', 'DIA', 'SEMANA', 'MES', 'TRIMESTRE', 'ANIO']),
  nivel: z.number().int().min(0).max(32),
  flechas: z.enum(['NINGUNO', 'SELECCION', 'TODOS']),
  // Los conmutadores del §4.6 que el §10.4 nombra en su ejemplo: `overdue`, `criticalPath` y
  // `float`. Opcionales por lo mismo que `conResumenes`: una preferencia guardada antes tiene que
  // seguir valiendo.
  atrasadas: z.boolean().optional(),
  rutaCritica: z.boolean().optional(),
  reserva: z.boolean().optional(),
  // El identificador de la foto que se compara, o null. `nullable` **y** `optional`: null es
  // «ninguna», que es una elección; ausente es «esta preferencia se guardó antes del campo».
  baseline: z.string().nullable().optional(),
  // Dónde cae el divisor entre la rejilla y la línea de tiempo (§4.1, `splitterPosition` del
  // §10.4). `null` es «lo que ocupen las columnas», que es una elección y no una ausencia.
  divisor: z.number().nullable().optional(),
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
  /**
   * Por qué columna se ordena, o `null` para el orden del plan (`sortBy` del §10.4).
   *
   * `nullable` **y** `optional`, y no son lo mismo: `null` es «el orden del plan», que es una
   * elección que hay que poder guardar; ausente es «esta preferencia se guardó antes del campo».
   */
  orden: z
    .object({ campo: z.string(), sentido: z.enum(['asc', 'desc']) })
    .nullable()
    .optional(),
  /** Anchos de columna tocados a mano (§10.4, `columns[].width`). */
  anchos: z.record(z.string(), z.number()).optional(),
  /**
   * Las columnas encendidas (§6.2).
   *
   * Los identificadores no se validan contra el catálogo, igual que en el Gantt: lo guardado puede
   * venir de otra versión, y rechazar la preferencia entera por un identificador retirado dejaría a
   * alguien sin sus columnas por un cambio que no hizo él. `columnasVisiblesDeLaLista` descarta las
   * que ya no existen al leer.
   */
  columnas: z.array(z.string()).max(40).optional(),
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
  // El §5.3 lo llama «preferencia» con esa palabra: «las tareas resumen se muestran o no según
  // preferencia; por omisión sólo hojas e hitos». Opcional para que una fila guardada antes de que
  // existiera el campo siga valiendo — si no, la primera visita de cada persona perdería su
  // agrupación por culpa de una casilla nueva.
  conResumenes: z.boolean().optional(),
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

/**
 * Lo que el Calendario guarda por usuario (§10.4).
 *
 * Aquí decía que el Calendario no guardaba nada y **que no era un olvido**: «sus únicas elecciones
 * son el mes que se mira —que es dónde estás, no cómo lees— y el filtro». Eso era cierto cuando el
 * Calendario sólo tenía el mes. Después llegaron la vista semanal y la de agenda del §7, y el modo
 * es exactamente «cómo lees», que es el criterio que el propio comentario usaba para decidir.
 *
 * Es el tercer comentario de esta sesión que defendía algo cierto el día que se escribió y falso
 * desde que alguien añadió lo de al lado.
 *
 * El ancla sigue sin guardarse, y por la razón que el comentario viejo daba bien: en qué mes estás
 * es dónde estás mirando. Abrir el calendario en marzo porque marzo fue lo último sería una
 * sorpresa, no una comodidad.
 */
const esquemaDelCalendario = z.object({
  modo: z.enum(['MES', 'SEMANA', 'AGENDA']),
})

const ESQUEMAS: Partial<Record<Vista, z.ZodTypeAny>> = {
  PANEL: esquemaDelPanel,
  GANTT: esquemaDelGantt,
  LISTA: esquemaDeLaLista,
  TABLERO: esquemaDelTablero,
  CARGA: esquemaDeLaCarga,
  CALENDARIO: esquemaDelCalendario,
}
const POR_OMISION: Partial<Record<Vista, unknown>> = {
  PANEL: PANEL_POR_OMISION,
  GANTT: GANTT_POR_OMISION,
  // El esquema es el formato por omisión que pide el §6.1: es el que enseña la forma del plan.
  LISTA: { formato: 'ESQUEMA', agruparPor: 'status', columnas: [...COLUMNAS_POR_OMISION] },
  // Por estado y en orden de EDT: es como llega el plan del archivo y como lo lee quien lo conoce.
  TABLERO: { agruparPor: 'estado', ordenarPor: 'wbs', sentido: 'asc' },
  CARGA: { modo: 'horas' },
  // El mes, que es como llega el calendario y como lo lee quien no ha elegido otra cosa.
  CALENDARIO: { modo: 'MES' },
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

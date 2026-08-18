/**
 * Mover una línea del plan y empujar lo que quede en falso (§3.0, §7.2, §4.4).
 *
 * ## Previsualizar y confirmar son dos operaciones
 *
 * Arrastrar una barra puede empujar quinientas líneas. Escribirlas sin avisar sería peor que no
 * poder arrastrar: quien mueve una fecha por curiosidad no espera reprogramar medio proyecto. Por
 * eso `previsualizar` no toca la base y devuelve exactamente lo que pasaría —cuántas líneas, y si
 * el cierre del proyecto se mueve—, y `confirmar` escribe eso mismo.
 *
 * ## Se guarda además la restricción
 *
 * La línea arrastrada queda con `DEBE_EMPEZAR_EL` en su nueva fecha. Sin eso, el siguiente cálculo
 * del plan la devolvería a donde la manden sus predecesoras y el arrastre se desharía solo. Es una
 * decisión explícita de quien la movió, y el modelo tiene que recordarla.
 */

import prisma from '@/lib/prisma'
import { type IsoDate } from '@/lib/scheduling/date'
import { type ResultadoDeReprogramacion, reprogramarDesde } from '@/lib/scheduling/reschedule'
import { calendarioDesde } from '@/lib/scheduling/project-calendar'
import { loadProjectPlan } from '@/services/schedule.service'

function aFecha(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

function isoDe(fecha: Date): IsoDate {
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(
    fecha.getUTCDate(),
  ).padStart(2, '0')}` as IsoDate
}

/**
 * Qué pasaría si se moviera esa línea a esa fecha. No escribe nada.
 *
 * @returns `null` si el proyecto o la línea no existen en esa organización.
 */
export async function previsualizar(
  projectId: string,
  organizationId: string,
  taskId: string,
  nuevaFecha: IsoDate,
): Promise<ResultadoDeReprogramacion | null> {
  const plan = await loadProjectPlan(projectId, organizationId)
  if (!plan) return null
  if (!plan.tasks.some((t) => t.id === taskId)) return null

  // Las fechas vigentes salen de la base, no del motor: son las ancladas, que es contra lo que se
  // empuja. Pedírselas al motor daría las mismas —porque el ancla las fija— pero acoplaría esta
  // operación a que ese ancla siga existiendo.
  const filas = await prisma.workItem.findMany({
    where: { projectId },
    select: { id: true, startDate: true, estimatedEndDate: true },
  })
  const fechas = new Map(
    filas.map((f) => [f.id, { start: isoDe(f.startDate), finish: isoDe(f.estimatedEndDate) }]),
  )

  return reprogramarDesde({
    tasks: plan.tasks,
    dependencies: plan.dependencies,
    calendar: calendarioDesde(plan.calendar),
    fechas,
    movida: { id: taskId, start: nuevaFecha },
  })
}

export interface ResultadoDeConfirmacion {
  readonly escritas: number
  readonly cierreAntes: IsoDate
  readonly cierreDespues: IsoDate
}

/**
 * Escribe la reprogramación.
 *
 * Vuelve a calcularla en vez de fiarse de lo que el navegador mandó: entre la previsualización y la
 * confirmación alguien pudo mover otra cosa, y aplicar unas fechas calculadas contra un plan que ya
 * cambió dejaría el cronograma en un estado que nadie pidió.
 *
 * @returns `null` si el proyecto o la línea no existen en esa organización.
 */
export async function confirmar(
  projectId: string,
  organizationId: string,
  taskId: string,
  nuevaFecha: IsoDate,
): Promise<ResultadoDeConfirmacion | null> {
  const resultado = await previsualizar(projectId, organizationId, taskId, nuevaFecha)
  if (!resultado) return null

  // En una transacción: media reprogramación escrita deja el plan con vínculos incumplidos y sin
  // forma de saber cuáles.
  await prisma.$transaction(async (tx) => {
    for (const cambio of resultado.cambios) {
      await tx.workItem.update({
        where: { id: cambio.id },
        data: {
          startDate: aFecha(cambio.hasta.start),
          estimatedEndDate: aFecha(cambio.hasta.finish),
          // Sólo la arrastrada gana restricción. Las empujadas se movieron por consecuencia, y
          // fijarlas convertiría un efecto colateral en una decisión que nadie tomó.
          ...(cambio.arrastrada
            ? { constraintType: 'DEBE_EMPEZAR_EL', constraintDate: aFecha(cambio.hasta.start) }
            : {}),
        },
      })
    }
  })

  return {
    escritas: resultado.cambios.length,
    cierreAntes: resultado.cierreAntes,
    cierreDespues: resultado.cierreDespues,
  }
}

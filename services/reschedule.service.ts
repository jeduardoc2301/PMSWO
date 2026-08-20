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
import { sePierdeAlArrastrar } from '@/lib/scheduling/restricciones'
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
/**
 * Lo que devuelve la previsualización: el reprograma del motor, más lo que el diálogo tiene que
 * poder decir antes de escribir.
 */
export interface PrevisualizacionDeArrastre extends ResultadoDeReprogramacion {
  /**
   * El compromiso que el arrastre va a reemplazar, o `null`.
   *
   * Existe porque `WorkItem` tiene **una sola** pareja de columnas de restricción y el arrastre clava
   * un `DEBE_EMPEZAR_EL`: lo que hubiera se pierde. El ancla no cuenta — se reemplaza un ancla por
   * otra y eso no es perder nada.
   */
  readonly restriccionQueSePierde: { readonly tipo: string; readonly fecha: string | null } | null
}

export async function previsualizar(
  projectId: string,
  organizationId: string,
  taskId: string,
  nuevaFecha: IsoDate,
): Promise<PrevisualizacionDeArrastre | null> {
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

  /**
   * La restricción que la línea arrastrada tiene guardada, si es un **compromiso**.
   *
   * `confirmar()` clava la arrastrada con `DEBE_EMPEZAR_EL` en su fecha nueva, y `WorkItem` tiene
   * **una sola** pareja de columnas: lo que hubiera se pierde. Para el ancla —`NO_ANTES_DE`, que es
   * con lo que llega cada línea— eso es correcto: se reemplaza un ancla por otra.
   *
   * Lo que no puede pasar en silencio es perder un **compromiso** —«no termina después del 18»,
   * «debe terminar el 18»—, que es lo único que distingue una fecha negociada de una calculada y lo
   * más caro de capturar del §3.4. Se devuelve para que el diálogo lo diga **antes** de escribir.
   */
  const arrastrada = await prisma.workItem.findUnique({
    where: { id: taskId },
    select: { constraintType: true, constraintDate: true },
  })
  const guardada =
    arrastrada?.constraintType && sePierdeAlArrastrar(arrastrada.constraintType)
      ? {
          tipo: arrastrada.constraintType,
          fecha: arrastrada.constraintDate ? isoDe(arrastrada.constraintDate) : null,
        }
      : null

  const resultado = reprogramarDesde({
    tasks: plan.tasks,
    dependencies: plan.dependencies,
    calendar: calendarioDesde(plan.calendar),
    fechas,
    movida: { id: taskId, start: nuevaFecha },
  })

  return { ...resultado, restriccionQueSePierde: guardada }
}


export interface ResultadoDeConfirmacion {
  readonly escritas: number
  readonly cierreAntes: IsoDate
  readonly cierreDespues: IsoDate
  /**
   * Cómo quedó cada línea y cómo estaba, para poder deshacerlo.
   *
   * Va aquí y no se recalcula al deshacer: entre la reprogramación y el Ctrl+Z el plan pudo cambiar,
   * y volver a calcular «lo contrario» daría unas fechas que no son las que había.
   */
  readonly cambios: readonly {
    readonly id: string
    readonly antes: FechasDeLinea
    readonly despues: FechasDeLinea
  }[]
}

/** Las cuatro columnas que una reprogramación toca. */
export interface FechasDeLinea {
  readonly start: IsoDate
  readonly finish: IsoDate
  readonly constraintType: string | null
  readonly constraintDate: IsoDate | null
}

/**
 * Escribe unas fechas exactas, sin calcular nada.
 *
 * Es lo que necesita deshacer: la pila guarda los valores que había y aquí se vuelven a poner. En
 * una transacción, porque devolver media reprogramación deja el plan en un estado que nadie pidió
 * — y al deshacer eso es peor todavía, porque quien pulsó Ctrl+Z creía estar volviendo atrás.
 *
 * @returns cuántas filas se escribieron, o `null` si el proyecto no es de esa organización.
 */
export async function restaurarFechas(
  projectId: string,
  organizationId: string,
  filas: readonly { readonly id: string; readonly fechas: FechasDeLinea }[],
): Promise<number | null> {
  const proyecto = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  })
  if (!proyecto) return null

  // Sólo líneas de este proyecto: sin esto, un cuerpo con ids de otra organización escribiría en
  // ella. El proyecto ya está comprobado; las líneas no.
  const propias = await prisma.workItem.findMany({
    where: { projectId, id: { in: filas.map((f) => f.id) } },
    select: { id: true },
  })
  const permitidas = new Set(propias.map((p) => p.id))
  const aplicables = filas.filter((f) => permitidas.has(f.id))

  await prisma.$transaction(
    async (tx) => {
      for (const fila of aplicables) {
        await tx.workItem.update({
          where: { id: fila.id },
          data: {
            startDate: aFecha(fila.fechas.start),
            estimatedEndDate: aFecha(fila.fechas.finish),
            constraintType: (fila.fechas.constraintType ?? null) as never,
            constraintDate: fila.fechas.constraintDate ? aFecha(fila.fechas.constraintDate) : null,
          },
        })
      }
    },
    { timeout: 120000 },
  )

  return aplicables.length
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

  // Las restricciones que había antes de tocar nada. Sin esto, deshacer devolvería las fechas pero
  // dejaría puesta el ancla que la reprogramación creó, y el siguiente cálculo del plan volvería a
  // moverlo todo — un deshacer que no deshace.
  const previas = await prisma.workItem.findMany({
    where: { id: { in: resultado.cambios.map((c) => c.id) } },
    select: { id: true, constraintType: true, constraintDate: true },
  })
  const anclas = new Map(
    previas.map((p) => [
      p.id,
      { tipo: (p.constraintType as string | null) ?? null, fecha: p.constraintDate ? isoDe(p.constraintDate) : null },
    ]),
  )

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
    cambios: resultado.cambios.map((cambio) => ({
      id: cambio.id,
      antes: {
        start: cambio.desde.start,
        finish: cambio.desde.finish,
        constraintType: anclas.get(cambio.id)?.tipo ?? null,
        constraintDate: anclas.get(cambio.id)?.fecha ?? null,
      },
      despues: {
        start: cambio.hasta.start,
        finish: cambio.hasta.finish,
        constraintType: cambio.arrastrada ? 'DEBE_EMPEZAR_EL' : (anclas.get(cambio.id)?.tipo ?? null),
        constraintDate: cambio.arrastrada
          ? cambio.hasta.start
          : (anclas.get(cambio.id)?.fecha ?? null),
      },
    })),
  }
}

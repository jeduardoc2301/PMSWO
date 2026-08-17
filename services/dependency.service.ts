/**
 * Capturar y quitar vínculos entre líneas del plan.
 *
 * Es la pieza que vuelve **editable** lo que la importación trae hecho: «esta tarea depende de
 * aquella, fin-comienzo, tres días después». Un vínculo no es un dato decorativo — de los vínculos
 * salen la ruta crítica, la holgura y la fecha de cierre — así que aquí no se guarda nada que el
 * motor no pueda digerir después.
 *
 * ## La validación que no negocia: ciclos
 *
 * Un plan con un ciclo —A espera a B, B espera a C, C espera a A— no se puede programar: no existe
 * un orden en que esas tareas ocurran. Si el ciclo entra a la base, **todas** las pantallas que
 * corren el motor sobre este proyecto se caen al mismo tiempo. Por eso el ciclo se detecta antes de
 * escribir, armando el grafo con el vínculo candidato incluido y dejando que el motor lo rechace;
 * el error del motor nombra las líneas del ciclo, y ese nombre viaja tal cual a quien captura,
 * porque «hay un ciclo» sin decir dónde obliga a buscarlo a mano entre mil líneas.
 */

import { randomUUID } from 'crypto'

import { NotFoundError, ValidationError } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { DependencyCycleError, buildDependencyGraph } from '@/lib/scheduling/dependencies'
import { LINK_TYPES, type Dependency, type LinkType, type PlanTask } from '@/lib/scheduling/types'

export interface AddDependencyInput {
  readonly projectId: string
  readonly organizationId: string
  readonly predecessorId: string
  readonly successorId: string
  readonly type: LinkType
  /** Desfase en días hábiles, con signo. Positivo espera; negativo solapa. */
  readonly lag: number
}

export async function addDependency(input: AddDependencyInput): Promise<{ id: string }> {
  if (input.predecessorId === input.successorId) {
    throw new ValidationError('Una línea no puede depender de sí misma.')
  }
  if (!LINK_TYPES.includes(input.type)) {
    throw new ValidationError(`Tipo de vínculo desconocido: ${input.type}. Los válidos son FS, SS, FF y SF.`)
  }
  if (!Number.isInteger(input.lag) || Math.abs(input.lag) > 260) {
    // Un año hábil de desfase ya no es un desfase: es una fecha disfrazada de vínculo.
    throw new ValidationError('El desfase debe ser un entero entre −260 y 260 días hábiles.')
  }

  // Las dos puntas tienen que ser líneas de este proyecto y esta organización. Un vínculo que cruza
  // proyectos mezclaría dos planes en un solo grafo.
  const puntas = await prisma.workItem.findMany({
    where: {
      id: { in: [input.predecessorId, input.successorId] },
      projectId: input.projectId,
      organizationId: input.organizationId,
    },
    select: { id: true },
  })
  if (puntas.length !== 2) {
    throw new NotFoundError('Una de las dos líneas del vínculo no está en este proyecto')
  }

  const existente = await prisma.taskDependency.findFirst({
    where: { predecessorId: input.predecessorId, successorId: input.successorId },
    select: { id: true },
  })
  if (existente) {
    throw new ValidationError('Ese vínculo ya existe. Para cambiar su tipo o desfase, quítalo y captúralo de nuevo.')
  }

  // El ciclo se busca sobre el plan completo más el candidato. Con los nombres reales: un error que
  // dice «hay un ciclo entre 288 → 302 → 288» se corrige en un minuto; uno que no los nombra, no.
  const [items, vinculos] = await Promise.all([
    prisma.workItem.findMany({ where: { projectId: input.projectId }, select: { id: true, title: true } }),
    prisma.taskDependency.findMany({
      where: { projectId: input.projectId },
      select: { predecessorId: true, successorId: true, linkType: true, lagDays: true },
    }),
  ])

  const tareas: PlanTask[] = items.map((item) => ({ id: item.id, name: item.title, duration: 1 }))
  const grafo: Dependency[] = [
    ...vinculos.map((v) => ({
      predecessorId: v.predecessorId,
      successorId: v.successorId,
      type: v.linkType as LinkType,
      lag: v.lagDays,
    })),
    { predecessorId: input.predecessorId, successorId: input.successorId, type: input.type, lag: input.lag },
  ]

  try {
    buildDependencyGraph(tareas, grafo)
  } catch (error) {
    if (error instanceof DependencyCycleError) {
      throw new ValidationError(`Ese vínculo crearía un ciclo y el plan dejaría de poder programarse. ${error.message}`)
    }
    throw error
  }

  const id = randomUUID()
  await prisma.taskDependency.create({
    data: {
      id,
      organizationId: input.organizationId,
      projectId: input.projectId,
      predecessorId: input.predecessorId,
      successorId: input.successorId,
      linkType: input.type,
      lagDays: input.lag,
    },
  })

  return { id }
}

export async function removeDependency(input: {
  readonly projectId: string
  readonly organizationId: string
  readonly predecessorId: string
  readonly successorId: string
}): Promise<void> {
  const borrados = await prisma.taskDependency.deleteMany({
    where: {
      projectId: input.projectId,
      organizationId: input.organizationId,
      predecessorId: input.predecessorId,
      successorId: input.successorId,
    },
  })
  if (borrados.count === 0) {
    throw new NotFoundError('Ese vínculo no existe en este proyecto')
  }
}

/**
 * Los campos personalizados de un proyecto (§2, §10.2, §4.2).
 *
 * ## Se archivan, no se borran
 *
 * Es la decisión que gobierna todo este archivo. Un filtro guardado puede apuntar a un campo, y el
 * §10.2 dice que los filtros se guardan con nombre y se comparten. Borrar el campo dejaría el filtro
 * señalando algo que nadie conoce — y el filtro **no avisaría**: devolvería cero líneas y parecería
 * que no hay nada que enseñar.
 *
 * Archivado, el campo sigue existiendo para quien lo mire, deja de ofrecerse para uno nuevo, y el
 * filtro que lo usa sigue diciendo la verdad.
 *
 * ## El catálogo se lee con los archivados dentro
 *
 * `catalogoDelProyecto` los trae todos y marca cuáles están archivados. Quien construye un filtro
 * nuevo se queda con los vivos; quien **evalúa** uno guardado los necesita todos.
 */

import { randomUUID } from 'node:crypto'

import prisma from '@/lib/prisma'
import { NotFoundError, ValidationError } from '@/lib/errors'
import {
  type CampoPersonalizado,
  type OpcionDeCampo,
  type TipoDeCampo,
  esTipoDeCampo,
  porQueNoSeAdmiteElCampo,
  porQueNoSeAdmiteElValor,
} from '@/lib/projects/campos-personalizados'

/** Lo que devuelve la base, ya saneado. */
function aCampo(fila: {
  id: string
  name: string
  type: string
  projectId: string | null
  options: unknown
  archivedAt: Date | null
}): CampoPersonalizado {
  return {
    id: fila.id,
    name: fila.name,
    // Un tipo desconocido en la base no revienta la vista: se degrada a texto, que es el que menos
    // promete. Pasa si alguien escribe por SQL o si un despliegue viejo dejó un valor que ya no está.
    type: (esTipoDeCampo(fila.type) ? fila.type : 'TEXT') as TipoDeCampo,
    projectId: fila.projectId,
    options: Array.isArray(fila.options) ? (fila.options as OpcionDeCampo[]) : null,
    archivedAt: fila.archivedAt ? fila.archivedAt.toISOString() : null,
  }
}

/**
 * Los campos que aplican a un proyecto: los suyos y los de la organización.
 *
 * Trae **también los archivados**: ver la cabecera. Quien quiera sólo los vivos filtra por
 * `archivedAt === null`, que es una línea y se lee.
 */
export async function catalogoDelProyecto(
  projectId: string,
  organizationId: string,
): Promise<readonly CampoPersonalizado[]> {
  const filas = await prisma.customField.findMany({
    where: {
      organizationId,
      // Los de la organización —`projectId` nulo— valen para todos sus proyectos.
      OR: [{ projectId }, { projectId: null }],
    },
    select: { id: true, name: true, type: true, projectId: true, options: true, archivedAt: true },
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
  })
  return filas.map(aCampo)
}

export interface AltaDeCampo {
  readonly projectId: string
  readonly organizationId: string
  readonly name: string
  readonly type: string
  readonly options?: readonly OpcionDeCampo[] | null
}

export async function crearCampo(entrada: AltaDeCampo): Promise<CampoPersonalizado> {
  // La misma frontera que aplica la pantalla, desde el mismo sitio: dos copias acaban siendo dos
  // fronteras distintas, y la de la pantalla siempre es la más blanda.
  const motivo = porQueNoSeAdmiteElCampo(entrada)
  if (motivo) throw new ValidationError(motivo)

  const nombre = entrada.name.trim()
  const yaEsta = await prisma.customField.findFirst({
    where: {
      organizationId: entrada.organizationId,
      OR: [{ projectId: entrada.projectId }, { projectId: null }],
      name: nombre,
      archivedAt: null,
    },
    select: { id: true },
  })
  if (yaEsta) {
    // Dos campos con el mismo nombre no se pueden distinguir en el selector del filtro, que es
    // donde se eligen: quien lo abra tendría que adivinar cuál de los dos es el suyo.
    throw new ValidationError(`Ya hay un campo llamado «${nombre}» en este proyecto.`)
  }

  const ultimo = await prisma.customField.findFirst({
    where: { organizationId: entrada.organizationId, projectId: entrada.projectId },
    orderBy: { orderIndex: 'desc' },
    select: { orderIndex: true },
  })

  const fila = await prisma.customField.create({
    data: {
      id: randomUUID(),
      organizationId: entrada.organizationId,
      projectId: entrada.projectId,
      name: nombre,
      type: entrada.type,
      options: entrada.options ? (entrada.options as never) : undefined,
      orderIndex: (ultimo?.orderIndex ?? -1) + 1,
    },
    select: { id: true, name: true, type: true, projectId: true, options: true, archivedAt: true },
  })
  return aCampo(fila)
}

/**
 * Archiva un campo, o lo devuelve al servicio.
 *
 * No borra. Ver la cabecera: un filtro guardado que apunte a él seguiría siendo válido y dejaría de
 * decir la verdad sin avisar.
 */
export async function archivarCampo(
  fieldId: string,
  organizationId: string,
  archivar: boolean,
): Promise<CampoPersonalizado> {
  const suyo = await prisma.customField.findFirst({
    where: { id: fieldId, organizationId },
    select: { id: true },
  })
  if (!suyo) throw new NotFoundError('Ese campo no existe en esta organización')

  const fila = await prisma.customField.update({
    where: { id: fieldId },
    data: { archivedAt: archivar ? new Date() : null },
    select: { id: true, name: true, type: true, projectId: true, options: true, archivedAt: true },
  })
  return aCampo(fila)
}

/**
 * Escribe el valor de un campo en una línea.
 *
 * `null` lo quita en vez de guardar un nulo: una fila que dice «este campo no tiene valor» y la
 * ausencia de la fila son lo mismo para quien lee, y tener las dos formas obliga a comprobar dos
 * cosas en cada sitio que consulte.
 */
export async function guardarValor(
  workItemId: string,
  fieldId: string,
  organizationId: string,
  valor: unknown,
): Promise<void> {
  const campo = await prisma.customField.findFirst({
    where: { id: fieldId, organizationId },
    select: { id: true, name: true, type: true, projectId: true, options: true, archivedAt: true },
  })
  if (!campo) throw new NotFoundError('Ese campo no existe en esta organización')

  const saneado = aCampo(campo)
  if (saneado.archivedAt !== null) {
    // Se puede seguir filtrando por un campo archivado, pero no capturar valores nuevos en él: eso
    // sería seguir alimentando algo que alguien decidió retirar.
    throw new ValidationError(`«${saneado.name}» está archivado: no admite valores nuevos.`)
  }

  const motivo = porQueNoSeAdmiteElValor(saneado, valor)
  if (motivo) throw new ValidationError(motivo)

  const vacio =
    valor === null || valor === undefined || (Array.isArray(valor) && valor.length === 0) || valor === ''
  if (vacio) {
    await prisma.customFieldValue.deleteMany({ where: { fieldId, workItemId } })
    return
  }

  await prisma.customFieldValue.upsert({
    where: { fieldId_workItemId: { fieldId, workItemId } },
    create: { id: randomUUID(), fieldId, workItemId, value: valor as never },
    update: { value: valor as never },
  })
}

/**
 * Los valores de todas las líneas de un proyecto, agrupados por línea.
 *
 * Se traen de una vez y se agrupan en memoria: con mil trescientas líneas y cinco campos son seis
 * mil quinientas filas, y pedirlas línea a línea serían mil trescientos viajes.
 */
export async function valoresDelProyecto(
  projectId: string,
): Promise<ReadonlyMap<string, Readonly<Record<string, unknown>>>> {
  const filas = await prisma.customFieldValue.findMany({
    where: { workItem: { projectId } },
    select: { fieldId: true, workItemId: true, value: true },
  })

  const porLinea = new Map<string, Record<string, unknown>>()
  for (const fila of filas) {
    const suyos = porLinea.get(fila.workItemId) ?? {}
    suyos[fila.fieldId] = fila.value
    porLinea.set(fila.workItemId, suyos)
  }
  return porLinea
}

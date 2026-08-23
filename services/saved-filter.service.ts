/**
 * Filtros guardados (§10.2).
 *
 * La forma del filtro la valida `lib/projects/filter.ts` en las dos direcciones: al guardar, para
 * que no entre basura; y al leer, porque un filtro guardado hace meses puede nombrar un campo que
 * ya no existe. Ese caso **no se aplica a medias**: se devuelve marcado como inválido, con el
 * motivo, para que la pantalla lo diga en vez de enseñar una lista filtrada de forma imprevisible.
 *
 * Es la misma decisión que en las preferencias de vista, con una diferencia importante: allí una
 * fila corrupta se cae de pie a la de por omisión porque sólo decide qué widgets se ven. Aquí un
 * filtro decide **qué datos se ven**, y silenciar su fallo es esconder líneas sin decírselo a nadie.
 */

import prisma from '@/lib/prisma'
import { CAMPOS, type CampoDeclarado, type Filtro, FiltroInvalido, validarFiltro } from '@/lib/projects/filter'
import { declararCampos } from '@/lib/projects/campos-en-el-filtro'
import { catalogoDelProyecto } from '@/services/custom-field.service'

export interface FiltroGuardado {
  readonly id: string
  readonly name: string
  readonly isShared: boolean
  readonly createdById: string
  readonly createdAt: string
  /** El filtro, o `null` si lo guardado ya no es válido. */
  readonly expression: Filtro | null
  /** Por qué no es válido, cuando no lo es. */
  readonly invalido?: string
}

function interpretar(
  fila: {
    id: string
    name: string
    isShared: boolean
    createdById: string
    createdAt: Date
    expression: unknown
  },
  /** El mismo catálogo con el que se guardó: si no, un filtro con campo propio vuelve vacío. */
  campos: Readonly<Record<string, CampoDeclarado>> = CAMPOS,
): FiltroGuardado {
  const base = {
    id: fila.id,
    name: fila.name,
    isShared: fila.isShared,
    createdById: fila.createdById,
    createdAt: fila.createdAt.toISOString(),
  }
  try {
    validarFiltro(fila.expression, 'filtro', campos)
    return { ...base, expression: fila.expression }
  } catch (error) {
    return {
      ...base,
      expression: null,
      invalido: error instanceof FiltroInvalido ? error.message : 'El filtro guardado no es válido',
    }
  }
}

/**
 * Los filtros que esta persona puede usar en este proyecto: los suyos y los compartidos.
 *
 * No los de otra gente sin compartir: un filtro personal a medio hacer no tiene por qué salirle a
 * todo el equipo en el desplegable.
 */
export async function listarFiltros(
  projectId: string,
  organizationId: string,
  userId: string,
): Promise<FiltroGuardado[]> {
  const campos = { ...CAMPOS, ...declararCampos(await catalogoDelProyecto(projectId, organizationId)) }
  const filas = await prisma.savedFilter.findMany({
    where: {
      projectId,
      project: { organizationId },
      OR: [{ isShared: true }, { createdById: userId }],
    },
    orderBy: [{ isShared: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      isShared: true,
      createdById: true,
      createdAt: true,
      expression: true,
    },
  })

  return filas.map((f) => interpretar(f, campos))
}

/**
 * @throws FiltroInvalido si la expresión no tiene sentido. Guardar un filtro roto sería garantizar
 *   que alguien lo aplique un día y vea una lista que no entiende.
 * @returns `null` si el proyecto no existe o no es de la organización.
 */
export async function guardarFiltro(
  projectId: string,
  organizationId: string,
  createdById: string,
  datos: { name: string; expression: unknown; isShared: boolean },
): Promise<FiltroGuardado | null> {
  /*
    Se valida contra el catálogo del PROYECTO, no contra el base.

    Evaluar usa `camposDe(contexto)`, que incluye los campos personalizados; validar usaba sólo los
    de siempre. Resultado: una condición sobre un campo propio —la barra los ofrece— tumbaba el
    filtro entero con un 400, y el cliente se lo tragaba sin rama `else`. No aparecía y nadie sabía
    por qué. Y la puerta estaba cerrada por los dos lados: leer también validaba igual, así que un
    filtro guardado por otra vía tampoco se podía recuperar.
  */
  const campos = { ...CAMPOS, ...declararCampos(await catalogoDelProyecto(projectId, organizationId)) }
  validarFiltro(datos.expression, 'filtro', campos)

  const proyecto = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true },
  })
  if (!proyecto) return null

  const fila = await prisma.savedFilter.create({
    data: {
      organizationId,
      projectId,
      createdById,
      name: datos.name,
      expression: datos.expression as object,
      isShared: datos.isShared,
    },
    select: {
      id: true,
      name: true,
      isShared: true,
      createdById: true,
      createdAt: true,
      expression: true,
    },
  })

  return interpretar(fila, campos)
}

/**
 * Borra un filtro guardado.
 *
 * Sólo quien lo creó. Un filtro compartido lo usa más gente, y que cualquiera pueda quitarlo de en
 * medio convierte una vista acordada en equipo en algo que desaparece sin explicación.
 *
 * @returns `false` si no existe, no es de la organización o no es de quien pide borrarlo.
 */
export async function borrarFiltro(
  projectId: string,
  organizationId: string,
  userId: string,
  filtroId: string,
): Promise<boolean> {
  const existe = await prisma.savedFilter.findFirst({
    where: { id: filtroId, projectId, createdById: userId, project: { organizationId } },
    select: { id: true },
  })
  if (!existe) return false

  await prisma.savedFilter.delete({ where: { id: filtroId } })
  return true
}

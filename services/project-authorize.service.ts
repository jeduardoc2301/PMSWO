/**
 * `authorize(userId, projectId, permission)` del §10.1.
 *
 * El spec pide **una sola función de autorización**, invocada en cada acción de servidor sin
 * excepción. Ésta es. Lanza `AuthorizationError` —que ya sale como 403 con su motivo— en vez de
 * devolver un booleano, por una razón práctica: un booleano se puede ignorar sin que nada se queje,
 * y una guardia que se puede ignorar en silencio acaba ignorándose. Lanzar obliga a decidir.
 *
 * ## Nota del spec sobre Supabase
 *
 * «Prisma se conecta con un rol de servicio, así que las políticas RLS **no se aplican** a sus
 * consultas. Autoriza en la capa de aplicación y deja RLS como red de seguridad.» Por eso esto vive
 * aquí y no en la base: para Prisma la base no tiene opinión.
 *
 * ## Dónde está el papel de proyecto
 *
 * En `ProjectCollaborator.role`. El dueño del proyecto (`Project.ownerId`) es OWNER aunque no esté
 * en esa tabla —lo es por construcción, y depender de una fila que puede faltar dejaría un proyecto
 * sin nadie que lo administre—.
 */

import prisma from '@/lib/prisma'
import { AuthorizationError, NotFoundError } from '@/lib/errors'
import {
  type PermisoDeProyecto,
  type RolDeProyecto,
  ROLES_DE_PROYECTO,
  permisosEfectivos,
} from '@/lib/projects/permisos'
import { UserRole } from '@/types'

/** Lo que hace falta saber de alguien para decidir. Se lee una vez y se reutiliza. */
export interface QuienEs {
  readonly rolesDeOrganizacion: readonly UserRole[]
  readonly rolDeProyecto: RolDeProyecto | null
}

/**
 * Qué papel tiene esta persona en este proyecto.
 *
 * Devuelve `null` cuando no tiene ninguno, que no es lo mismo que no existir: quien no está invitado
 * no ve nada, y eso se decide arriba.
 */
export async function papelEnElProyecto(
  userId: string,
  projectId: string,
): Promise<RolDeProyecto | null> {
  const proyecto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true, projectManagerId: true },
  })
  if (!proyecto) throw new NotFoundError('Project')

  // El dueño lo es por construcción, esté o no en la tabla de colaboradores. Un proyecto sin nadie
  // que lo administre porque falta una fila sería un proyecto secuestrado por su propio esquema.
  if (proyecto.ownerId === userId) return 'OWNER'
  if (proyecto.projectManagerId === userId) return 'MANAGER'

  const colaborador = await prisma.projectCollaborator.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  })
  if (!colaborador) return null

  // Un papel que no reconocemos se trata como el más restrictivo que hay, no como el más generoso:
  // una cadena escrita a mano en la base no puede abrir puertas.
  return (ROLES_DE_PROYECTO as readonly string[]).includes(colaborador.role)
    ? (colaborador.role as RolDeProyecto)
    : 'CLIENT'
}

/**
 * Los cargos de organización de alguien.
 *
 * `User.roles` es una columna JSON, y en esta base aparece de las dos formas: como arreglo ya
 * decodificado y como texto. Se admiten las dos —igual que hace `lib/auth.ts`— porque una fila
 * escrita por una semilla vieja no es motivo para dejar a nadie sin permisos.
 *
 * Un valor que no sea un cargo conocido se descarta en vez de arrastrarse: una cadena inventada en
 * la base no puede abrir puertas.
 */
export async function cargosDe(userId: string): Promise<readonly UserRole[]> {
  const usuario = await prisma.user.findUnique({
    where: { id: userId },
    select: { roles: true },
  })
  if (!usuario) throw new NotFoundError('User')

  const crudos: unknown = Array.isArray(usuario.roles)
    ? usuario.roles
    : typeof usuario.roles === 'string'
      ? JSON.parse(usuario.roles)
      : []
  if (!Array.isArray(crudos)) return []

  const conocidos = new Set<string>(Object.values(UserRole))
  return crudos.filter((r): r is UserRole => typeof r === 'string' && conocidos.has(r))
}

/** Todo lo que esta persona puede hacer en este proyecto. Una consulta por cada mitad. */
export async function permisosDeProyecto(
  userId: string,
  projectId: string,
): Promise<ReadonlySet<PermisoDeProyecto>> {
  const [cargos, papel] = await Promise.all([cargosDe(userId), papelEnElProyecto(userId, projectId)])
  return permisosEfectivos(cargos, papel)
}

/**
 * La guardia del §10.1.
 *
 * El mensaje nombra el permiso que faltó. Un 403 que sólo dice «prohibido» obliga a quien lo recibe
 * a adivinar si le falta un permiso, si el proyecto no es suyo o si hay un fallo; nombrarlo convierte
 * media hora de conjeturas en una frase para quien administra.
 *
 * @throws AuthorizationError (403) si no puede.
 * @throws NotFoundError (404) si el proyecto o la persona no existen.
 */
export async function authorize(
  userId: string,
  projectId: string,
  permission: PermisoDeProyecto,
): Promise<void> {
  const permisos = await permisosDeProyecto(userId, projectId)
  if (permisos.has(permission)) return

  throw new AuthorizationError(
    `Falta el permiso «${permission}» en este proyecto.`,
  )
}

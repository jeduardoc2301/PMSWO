/**
 * Los diez permisos de proyecto del §10.1.
 *
 * ## Por qué hacen falta si ya hay RBAC de organización
 *
 * `lib/rbac.ts` responde «¿esta persona puede editar proyectos?». El §10.1 pregunta otra cosa:
 * «¿esta persona puede editar **este** proyecto, y qué parte de él?». Son preguntas distintas y la
 * segunda no se deduce de la primera: el mismo consultor puede llevar el cronograma de un proyecto
 * y ser invitado de sólo lectura en otro.
 *
 * Por eso esto no sustituye al RBAC de organización, lo estrecha. El permiso efectivo es la
 * **intersección**: lo que la organización te deja hacer, recortado por lo que este proyecto te deja
 * hacer. Un administrador de la organización que entra a un proyecto como cliente externo no ve el
 * Gantt, y un consultor externo no gana `edit_schedule` por que le nombren propietario de un
 * proyecto si su rol de organización no lo permite.
 *
 * ## La distinción que importa
 *
 * `edit_schedule` frente a `edit_tracking`. El spec la llama «el permiso más útil de todo el sistema
 * y el que casi nadie implementa», y la razón es concreta: quien ejecuta una tarea tiene que poder
 * decir que va por el 60 % sin poder mover la fecha de nadie. Mover una fecha en un plan encadenado
 * empuja a las sucesoras — es una decisión de quien lleva el plan, no de quien lleva la tarea.
 *
 * ## Esto es aritmética, no base de datos
 *
 * Aquí no se consulta nada: entra un rol de organización y un rol de proyecto, y sale el conjunto de
 * permisos. Leer quién es quién es trabajo del servicio (`services/project-authorize.service.ts`).
 * Separarlo permite probar la tabla entera sin levantar una base, que es donde de verdad se ve si
 * una casilla quedó cruzada.
 */

import { UserRole } from '@/types'

/** Los diez permisos que el §10.1 pide como mínimo, con el nombre que les da el spec. */
export const PERMISOS_DE_PROYECTO = [
  'view_gantt',
  'view_board',
  'view_list',
  'view_calendar',
  'view_workload',
  'view_dashboard',
  /** Mover fechas, duración y dependencias: toca el plan. */
  'edit_schedule',
  /** Estado, avance, tiempo registrado, adjuntos: NO toca el plan. */
  'edit_tracking',
  'view_budget',
  'manage_project_settings',
] as const

export type PermisoDeProyecto = (typeof PERMISOS_DE_PROYECTO)[number]

/**
 * Los papeles que se pueden tener **dentro** de un proyecto.
 *
 * Son cuatro y no dos porque el §10.1 nombra dos perfiles que hoy no se podrían expresar: «un
 * cliente externo, un colaborador» a los que dar Lista y Tablero pero no el Gantt ni el presupuesto.
 * Con sólo OWNER y COLLABORATOR no hay dónde poner a un cliente.
 */
export const ROLES_DE_PROYECTO = ['OWNER', 'MANAGER', 'COLLABORATOR', 'CLIENT'] as const
export type RolDeProyecto = (typeof ROLES_DE_PROYECTO)[number]

/** Quien no está en la lista de colaboradores del proyecto. */
export const SIN_ROL_DE_PROYECTO = null

const TODAS_LAS_VISTAS: PermisoDeProyecto[] = [
  'view_gantt',
  'view_board',
  'view_list',
  'view_calendar',
  'view_workload',
  'view_dashboard',
]

/**
 * Qué deja hacer cada papel dentro del proyecto.
 *
 * `CLIENT` es el perfil que el §10.1 describe con nombre y apellido: ve la Lista y el Tablero, no ve
 * el Gantt —el cronograma interno no es suyo— ni el presupuesto, y no edita nada. Se le da el Panel
 * de control porque es el resumen que un cliente sí quiere, y no la Carga de trabajo, que enseña a
 * quién se le está cargando la mano dentro del equipo.
 */
export const PERMISOS_POR_ROL_DE_PROYECTO: Readonly<
  Record<RolDeProyecto, readonly PermisoDeProyecto[]>
> = Object.freeze({
  OWNER: Object.freeze<PermisoDeProyecto[]>([
    ...TODAS_LAS_VISTAS,
    'edit_schedule',
    'edit_tracking',
    'view_budget',
    'manage_project_settings',
  ]),
  MANAGER: Object.freeze<PermisoDeProyecto[]>([
    ...TODAS_LAS_VISTAS,
    'edit_schedule',
    'edit_tracking',
    'view_budget',
  ]),
  // Ejecuta: actualiza lo suyo y no mueve el plan. Es la mitad `edit_tracking` de la distinción.
  COLLABORATOR: Object.freeze<PermisoDeProyecto[]>([...TODAS_LAS_VISTAS, 'edit_tracking']),
  CLIENT: Object.freeze<PermisoDeProyecto[]>(['view_board', 'view_list', 'view_dashboard']),
})

/**
 * El techo que pone el rol de organización.
 *
 * No es el mismo mapa: aquí se responde «¿qué puede llegar a hacer alguien con este cargo, en el
 * mejor de los casos?». Lo que de verdad puede hacer en un proyecto concreto es esto cruzado con su
 * papel allí.
 *
 * `EXECUTIVE` es de lectura por definición —mira la cartera, no la ejecuta— y por eso no tiene
 * ninguno de los dos permisos de edición aunque le nombren propietario de un proyecto. Un techo que
 * se pudiera saltar nombrando a alguien no sería un techo.
 */
export const TECHO_POR_ROL_DE_ORGANIZACION: Readonly<
  Record<UserRole, readonly PermisoDeProyecto[]>
> = Object.freeze({
  [UserRole.ADMIN]: Object.freeze<PermisoDeProyecto[]>([...PERMISOS_DE_PROYECTO]),
  [UserRole.PROJECT_MANAGER]: Object.freeze<PermisoDeProyecto[]>([...PERMISOS_DE_PROYECTO]),
  [UserRole.INTERNAL_CONSULTANT]: Object.freeze<PermisoDeProyecto[]>([
    ...TODAS_LAS_VISTAS,
    'edit_tracking',
  ]),
  // Un externo no ve el reparto de carga del equipo ni el dinero, aunque en el proyecto sea
  // colaborador: eso es información de la casa, no del proyecto.
  [UserRole.EXTERNAL_CONSULTANT]: Object.freeze<PermisoDeProyecto[]>([
    'view_gantt',
    'view_board',
    'view_list',
    'view_calendar',
    'view_dashboard',
    'edit_tracking',
  ]),
  [UserRole.EXECUTIVE]: Object.freeze<PermisoDeProyecto[]>([...TODAS_LAS_VISTAS, 'view_budget']),
})

/**
 * Los permisos efectivos de alguien sobre un proyecto.
 *
 * La intersección de lo que su cargo permite y lo que su papel en el proyecto permite. Sin papel en
 * el proyecto no hay nada: pertenecer a la organización no da acceso a un proyecto al que nadie te
 * invitó, y ésa es la diferencia entre una lista de proyectos y una carpeta compartida.
 */
export function permisosEfectivos(
  rolesDeOrganizacion: readonly UserRole[],
  rolDeProyecto: RolDeProyecto | null,
): ReadonlySet<PermisoDeProyecto> {
  if (rolDeProyecto === SIN_ROL_DE_PROYECTO) return new Set()

  const delProyecto = new Set(PERMISOS_POR_ROL_DE_PROYECTO[rolDeProyecto] ?? [])
  const techo = new Set<PermisoDeProyecto>()
  for (const rol of rolesDeOrganizacion) {
    for (const permiso of TECHO_POR_ROL_DE_ORGANIZACION[rol] ?? []) techo.add(permiso)
  }

  const salida = new Set<PermisoDeProyecto>()
  for (const permiso of delProyecto) if (techo.has(permiso)) salida.add(permiso)
  return salida
}

/** ¿Puede? Azúcar sobre `permisosEfectivos`, para que quien llame no tenga que armar el conjunto. */
export function puede(
  rolesDeOrganizacion: readonly UserRole[],
  rolDeProyecto: RolDeProyecto | null,
  permiso: PermisoDeProyecto,
): boolean {
  return permisosEfectivos(rolesDeOrganizacion, rolDeProyecto).has(permiso)
}

/**
 * Las seis vistas de la barra del §10.1, con el permiso que hace falta para verlas.
 *
 * Las claves son los identificadores que usa la barra de pestañas, tal cual —`gantt` para el
 * Timeline, `work-items` con guion—. Escribirlos «bonitos» aquí y distintos allí daría una tabla
 * que parece completa y no recorta nada, que es la peor forma de fallar de un permiso.
 */
export const PERMISO_POR_VISTA: Readonly<Record<string, PermisoDeProyecto>> = Object.freeze({
  gantt: 'view_gantt',
  timeline: 'view_gantt',
  kanban: 'view_board',
  'work-items': 'view_list',
  calendar: 'view_calendar',
  workload: 'view_workload',
  dashboard: 'view_dashboard',
})

/**
 * Qué vistas puede ver, en el orden en que se dibuja la barra.
 *
 * Se **esconden**, no se deshabilitan: una pestaña gris que no se puede pulsar informa a un cliente
 * externo de que existe un Gantt que no le enseñan, y eso es peor que no mencionarlo.
 */
export function vistasVisibles(
  permisos: ReadonlySet<PermisoDeProyecto>,
  vistas: readonly string[],
): readonly string[] {
  return vistas.filter((vista) => {
    const permiso = PERMISO_POR_VISTA[vista]
    // Una pestaña que no está en el mapa no es una vista del §10.1 —bloqueadores, riesgos,
    // acuerdos— y no se recorta aquí: recortarla en silencio escondería media aplicación por un
    // olvido en una tabla.
    return permiso === undefined || permisos.has(permiso)
  })
}

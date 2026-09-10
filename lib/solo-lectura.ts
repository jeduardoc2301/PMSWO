/**
 * La puerta del cargo de solo lectura.
 *
 * ## Por qué no basta con no darle permisos de escritura
 *
 * `lib/rbac.ts` ya deja a `VIEWER` sin un solo permiso de escritura, y `lib/projects/permisos.ts` le
 * pone un techo sin `edit_schedule`, `edit_tracking` ni `manage_project_settings`. Con eso, hoy, no
 * puede escribir nada. El problema es la palabra «hoy».
 *
 * Esas dos tablas sólo protegen las rutas que se acuerdan de consultarlas. Barriendo las 55 rutas
 * que mutan aparecieron cuatro que no lo hacen: dos no piden ningún permiso —`upload/avatar`,
 * `users/locale`— y dos se conforman con `PROJECT_VIEW`, que es justo el permiso que este cargo
 * necesita para existir: `projects/[id]/filters` y `projects/[id]/preferences`. La ruta 56 la
 * escribirá alguien que no leyó esto.
 *
 * Por eso la promesa se cumple aquí y no allí. Una cuenta de solo lectura no puede emitir un
 * método que escriba, y la regla se aplica en `withAuth`, por donde pasan **todas** las rutas de
 * datos de la aplicación —comprobado: las únicas que no lo usan son entrar, salir, renovar sesión y
 * el latido de salud—. No hay «use server» en este proyecto, así que no hay segunda puerta.
 *
 * La diferencia práctica: sin esto, «no modifica nada» es una propiedad que hay que volver a
 * demostrar cada vez que alguien añade una ruta. Con esto, es una propiedad que hay que **romper a
 * propósito** para dejar de ser cierta.
 *
 * ## Las dos excepciones, y por qué no son escrituras
 *
 * Se dejan pasar dos cosas, ambas invisibles para todos los demás: el idioma de la aplicación y las
 * preferencias de vista propias —qué columnas, qué agrupación, qué rango— que viven en una fila por
 * persona, proyecto y vista.
 *
 * No cambian el proyecto ni lo que ve nadie más: cambian cómo se le dibuja la pantalla a quien mira.
 * Bloquearlas daría una aplicación que no recuerda si la pusiste en portugués, y eso no se lee como
 * «esta cuenta no modifica nada», se lee como que está rota.
 *
 * Deliberadamente **fuera** de la lista: la foto de perfil (la ven los demás) y los filtros
 * guardados (se pueden marcar como compartidos, y entonces también). Si mañana se quiere aflojar
 * cualquiera de las dos, es una línea en `ESCRITURAS_PERSONALES` — pero que sea una decisión y no un
 * olvido.
 */

import { UserRole } from '@/types'

/**
 * Los cargos que no escriben.
 *
 * Es un conjunto y no una constante porque la pregunta que importa —«¿esta **cuenta** es de solo
 * lectura?»— se responde sobre la lista entera de cargos de la persona, no sobre uno.
 */
export const ROLES_DE_SOLO_LECTURA: ReadonlySet<string> = new Set<string>([UserRole.VIEWER])

/** Los métodos que no cambian nada. `HEAD` y `OPTIONS` los emite el navegador, no la aplicación. */
const METODOS_QUE_LEEN: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Las dos escrituras que sí pasan, ancladas por los dos extremos.
 *
 * Sin `^` y `$` una ruta futura que empezara igual —`/api/v1/users/locale/export`— entraría gratis
 * en la lista de excepciones sin que nadie lo hubiera decidido.
 */
const ESCRITURAS_PERSONALES: readonly RegExp[] = [
  /** El idioma de la aplicación de quien lo pide. */
  /^\/api\/v1\/users\/locale\/?$/,
  /** Cómo se le dibuja una vista a quien la mira: una fila por persona, proyecto y vista. */
  /^\/api\/v1\/projects\/[^/]+\/preferences\/?$/,
]

/**
 * ¿Es una cuenta que no escribe?
 *
 * Hace falta que **todos** sus cargos lo sean. A alguien con `[VIEWER, PROJECT_MANAGER]` no se le
 * puede negar escribir: lleva proyectos. Y una lista vacía no es de solo lectura sino de nadie —
 * `withAuth` ya la rechaza antes de llegar aquí—; devolver `true` la haría parecer una cuenta
 * legítima y silenciaría el 401 que corresponde.
 */
export function esCuentaDeSoloLectura(roles: readonly string[] | null | undefined): boolean {
  if (!Array.isArray(roles) || roles.length === 0) return false
  return roles.every((rol) => ROLES_DE_SOLO_LECTURA.has(rol))
}

/** ¿Es una de las dos escrituras personales que se dejan pasar? */
export function esEscrituraPersonal(pathname: string): boolean {
  return ESCRITURAS_PERSONALES.some((patron) => patron.test(pathname))
}

/**
 * La decisión: ¿hay que negar esta petición por ser una cuenta de solo lectura?
 *
 * Devuelve un `boolean` y no una respuesta HTTP para poder probarla sin montar un `NextRequest`:
 * quien la llama es `withAuth`, que es el único que sabe armar el 403.
 */
export function debeNegarsePorSoloLectura(
  roles: readonly string[] | null | undefined,
  metodo: string,
  pathname: string,
): boolean {
  if (METODOS_QUE_LEEN.has(metodo.toUpperCase())) return false
  if (!esCuentaDeSoloLectura(roles)) return false
  return !esEscrituraPersonal(pathname)
}

/**
 * Lo que se le dice a quien lo recibe.
 *
 * Dice el cargo por su nombre porque un «prohibido» a secas manda a quien lo lee a pedir permisos de
 * proyecto que no le van a servir de nada: lo que le falta no está en este proyecto.
 */
export const MOTIVO_SOLO_LECTURA =
  'Esta cuenta es de solo lectura: puede consultar los proyectos que le hayan compartido, pero no modificar nada. Si necesitas editar, pide que te cambien el cargo.'

/**
 * La guardia del §10.1, en una llamada, para no copiarla en cada ruta.
 *
 * El spec pide **una sola función de autorización** invocada sin excepción, y eso no se sostiene si
 * usarla cuesta doce líneas de `try`/`catch` por ruta: lo que cuesta se olvida. Aquí devuelve la
 * respuesta ya armada o `null` si puede seguir, que es la forma más corta de usarla bien:
 *
 * ```ts
 * const negado = await exigirPermiso(authContext.userId, projectId, 'edit_schedule')
 * if (negado) return negado
 * ```
 *
 * Se devuelve la respuesta en vez de lanzar porque una ruta que ya está dentro de su propio
 * `try`/`catch` convertiría el 403 en el 500 genérico del final — que fue exactamente lo que pasó
 * la primera vez que se enchufó a mano.
 */

import { NextResponse } from 'next/server'

import type { PermisoDeProyecto } from '@/lib/projects/permisos'
import { authorize } from '@/services/project-authorize.service'

/**
 * @param motivo Qué decirle a quien lo recibe. Sin él sale el nombre del permiso, que es exacto pero
 *   no explica nada a quien no conoce el catálogo. Con él se puede decir «cambiar las fechas mueve
 *   el cronograma»: un 403 que sólo dice «prohibido» deja a quien lo lee adivinando si le falta un
 *   permiso, si el proyecto no es suyo, o si hay un fallo.
 * @returns La respuesta que hay que devolver, o `null` si puede seguir.
 */
export async function exigirPermiso(
  userId: string,
  projectId: string,
  permiso: PermisoDeProyecto,
  motivo?: string,
): Promise<NextResponse | null> {
  try {
    await authorize(userId, projectId, permiso)
    return null
  } catch (error) {
    const nombre = error instanceof Error ? error.name : ''
    if (nombre === 'AuthorizationError') {
      return NextResponse.json(
        { error: 'Forbidden', message: motivo ?? (error as Error).message },
        { status: 403 },
      )
    }
    if (nombre === 'NotFoundError') {
      return NextResponse.json(
        { error: 'Not Found', message: 'Ese proyecto no existe' },
        { status: 404 },
      )
    }
    // Cualquier otra cosa es un fallo de verdad y sube: tragárselo aquí convertiría una base caída
    // en un «no tienes permiso», que manda a quien lo recibe a pedir permisos que ya tiene.
    throw error
  }
}

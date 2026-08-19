/**
 * GET /api/v1/projects/[id]/permissions
 *
 * Qué puede hacer quien pregunta **en este proyecto** (§10.1). Lo usa la pantalla para decidir qué
 * pestañas dibujar y qué gestos ofrecer.
 *
 * Esto no sustituye a las guardias del servidor y no debe usarse como si lo hiciera: esconder una
 * pestaña es cortesía, no seguridad. Cada acción sigue pasando por `authorize()` en su propia ruta,
 * porque quien quiera saltarse la pantalla no va a pedirle permiso a la pantalla.
 *
 * Se responde siempre 200, incluso sin ningún permiso: un 403 aquí obligaría a la pantalla a tratar
 * «no puedes hacer nada» como un fallo, cuando es una respuesta legítima.
 */

import { NextRequest, NextResponse } from 'next/server'

import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import { PERMISOS_DE_PROYECTO } from '@/lib/projects/permisos'
import { papelEnElProyecto, permisosDeProyecto } from '@/services/project-authorize.service'
import { Permission } from '@/types'

async function getHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
) {
  const { id } = await context.params
  try {
    const [permisos, papel] = await Promise.all([
      permisosDeProyecto(authContext.userId, id),
      papelEnElProyecto(authContext.userId, id),
    ])

    return NextResponse.json(
      {
        // En el orden del catálogo y no en el del conjunto: así dos respuestas iguales se ven
        // iguales, que importa cuando alguien las compara para depurar.
        permisos: PERMISOS_DE_PROYECTO.filter((p) => permisos.has(p)),
        papel,
      },
      { status: 200 },
    )
  } catch (error) {
    const nombre = error instanceof Error ? error.name : ''
    if (nombre === 'NotFoundError') {
      return NextResponse.json(
        { error: 'Not Found', message: 'Ese proyecto no existe' },
        { status: 404 },
      )
    }
    console.error('Project permissions error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'No se pudieron leer los permisos' },
      { status: 500 },
    )
  }
}

export const GET = withAuth(getHandler, { requiredPermissions: [Permission.PROJECT_VIEW] })

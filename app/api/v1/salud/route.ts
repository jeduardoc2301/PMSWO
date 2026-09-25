/**
 * GET /api/v1/salud — ¿responde la base, y qué versión de la aplicación está corriendo?
 *
 * La llama el vigía de sesión del navegador (`components/providers/vigia-de-sesion.tsx`) en dos
 * momentos:
 *
 *   - **Cuando una llamada devuelve 5xx**, para saber si es la base apagada fuera de horario antes
 *     de decírselo a nadie. Afirmar «la base está apagada» sin comprobarlo sería cambiar un mensaje
 *     confuso por uno falso.
 *   - **Cuando la pestaña recupera el foco**, para comparar su versión con la del servidor y
 *     ofrecer recargar si hubo un despliegue.
 *
 * Sin sesión a propósito: también la usa la pantalla de entrada, que es justo donde la base
 * apagada se hacía pasar por «credenciales inválidas». No devuelve nada que no se pueda saber desde
 * fuera: si la base contesta y un identificador de versión.
 */
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Cuánto se espera a la base. Con la instancia apagada Prisma tarda en rendirse lo que tarde su
 * `connect_timeout`; el vigía necesita la respuesta ya, para decirle a alguien qué pasa.
 */
const ESPERA_MS = 4_000

export async function GET() {
  const version = process.env.NEXT_PUBLIC_VERSION_DE_LA_APP ?? ''
  let base: 'ok' | 'no-disponible' = 'ok'
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('sin respuesta')), ESPERA_MS)),
    ])
  } catch {
    base = 'no-disponible'
  }
  return NextResponse.json(
    { base, version },
    { status: base === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
  )
}

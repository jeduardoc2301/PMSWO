/**
 * POST /api/v1/internal/daily-report
 *
 * El disparador del reporte diario. Lo llama una Lambda desde EventBridge Scheduler, no un
 * usuario, así que no pasa por `withAuth`: no hay sesión que validar. La autorización es un
 * secreto compartido en la cabecera `x-cron-secret`.
 *
 * Por qué un secreto en cabecera y no una firma IAM: Amplify no expone un verificador de SigV4
 * para sus funciones SSR, así que verificar una firma aquí sería reimplementar criptografía de
 * AWS a mano —bastante más fácil de equivocar que comparar un secreto largo en tiempo constante.
 * El secreto vive en las variables de entorno de Amplify y en la Lambda, y no viaja a ningún
 * otro lado.
 *
 * Falla cerrado: sin `CRON_SECRET` configurado, la ruta no atiende a nadie. Un despliegue al que
 * se le olvidó la variable no se convierte en un endpoint abierto que cualquiera puede usar para
 * mandarle correos al director.
 */
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { logError, logWarning } from '@/lib/logger'
import { alertarFallas, enviarReportesDiarios, enviarSuscripcion } from '@/services/reporte-diario.service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Comparación en tiempo constante.
 *
 * Un `===` sobre un secreto se corta en el primer byte distinto, y esa diferencia de tiempo es
 * medible desde fuera: permite adivinar el secreto byte por byte. Los buffers se igualan de
 * longitud antes de comparar porque `timingSafeEqual` truena si difieren —y esa excepción sería,
 * ella misma, una filtración de la longitud.
 */
function secretoValido(recibido: string | null, esperado: string): boolean {
  if (!recibido) return false
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) {
    // Se compara igual contra sí mismo para gastar el mismo tiempo que el caso bueno.
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const esperado = process.env.CRON_SECRET
  if (!esperado || esperado.length < 24) {
    logError(
      '[daily-report] CRON_SECRET ausente o demasiado corto',
      new Error('CRON_SECRET no configurado'),
      { path: '/api/v1/internal/daily-report' }
    )
    return NextResponse.json(
      { error: 'NOT_CONFIGURED', message: 'El disparador no está configurado en este ambiente.' },
      { status: 503 }
    )
  }

  if (!secretoValido(request.headers.get('x-cron-secret'), esperado)) {
    logWarning('[daily-report] intento con secreto inválido', {
      ip: request.headers.get('x-forwarded-for') ?? 'desconocida',
      agent: request.headers.get('user-agent') ?? 'desconocido',
    })
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  // El cuerpo es opcional: sin él corre el barrido completo, que es lo que hace el cron.
  let subscriptionId: string | undefined
  try {
    const body = await request.json()
    if (body && typeof body.subscriptionId === 'string') subscriptionId = body.subscriptionId
  } catch {
    // Sin cuerpo, o con cuerpo ilegible: barrido completo.
  }

  const inicio = Date.now()
  try {
    const resultados = subscriptionId
      ? [await enviarSuscripcion(subscriptionId)]
      : await enviarReportesDiarios()

    const enviados = resultados.filter((r) => r.estado === 'ENVIADO').length
    const omitidos = resultados.filter((r) => r.estado === 'OMITIDO').length
    const fallidos = resultados.filter((r) => r.estado === 'FALLIDO')

    // Se espera a que la alerta salga antes de contestar: en Lambda, lo que quede pendiente
    // cuando la respuesta se manda se congela hasta la siguiente invocación —o se pierde.
    await alertarFallas(resultados)

    // 207 cuando algo falló pero algo salió: la Lambda distingue «no salió nada» de «salió a
    // medias», y eso cambia si la alerta es urgente o informativa.
    const status = fallidos.length === 0 ? 200 : enviados > 0 ? 207 : 500

    return NextResponse.json(
      {
        enviados,
        omitidos,
        fallidos: fallidos.length,
        duracionMs: Date.now() - inicio,
        resultados,
      },
      { status }
    )
  } catch (error) {
    logError('[daily-report] el barrido reventó', error as Error, {})
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: (error as Error).message, duracionMs: Date.now() - inicio },
      { status: 500 }
    )
  }
}

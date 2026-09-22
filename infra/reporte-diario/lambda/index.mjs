/**
 * Disparador del reporte diario.
 *
 * Lo único que hace es tocarle el timbre a la aplicación. El reporte se arma y se manda allá,
 * donde ya viven Prisma, Bedrock y las plantillas; traer todo eso a una Lambda significaría
 * empaquetar Prisma, meter la función en la VPC del RDS y mantener dos copias de la lógica que
 * se van a separar en el primer cambio.
 *
 * Sin dependencias a propósito: `fetch` es global desde Node 18, así que esto se despliega como
 * un archivo suelto en un zip y no hay que decidir si el runtime trae tal o cual cliente del SDK.
 *
 * Cuando algo sale mal, LANZA. Esa excepción es lo que incrementa la métrica `Errors` de Lambda,
 * que es lo que dispara la alarma de CloudWatch, que es lo que manda el SNS al correo. Contestar
 * "ok" ante un fallo dejaría la alarma muda — que es exactamente el modo de falla que hace que
 * nadie se entere de que el reporte lleva tres semanas sin salir.
 *
 * Variables de entorno:
 *   APP_URL      https://master.d3fbgo1omfw37o.amplifyapp.com
 *   CRON_SECRET  el mismo que tiene Amplify
 */

const TIMEOUT_MS = 50_000

export const handler = async (event) => {
  const appUrl = process.env.APP_URL
  const secret = process.env.CRON_SECRET

  if (!appUrl) throw new Error('APP_URL no está configurada en la Lambda.')
  if (!secret) throw new Error('CRON_SECRET no está configurada en la Lambda.')

  const url = `${appUrl.replace(/\/$/, '')}/api/v1/internal/daily-report`

  // El corte es menor que el timeout de la Lambda a propósito: así el error que se registra es
  // "la app no contestó en 50s" y no un corte seco del runtime, que no deja rastro útil.
  const abort = new AbortController()
  const temporizador = setTimeout(() => abort.abort(), TIMEOUT_MS)

  let respuesta
  let cuerpo
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cron-secret': secret,
      },
      // La suscripción es opcional: sin ella la app recorre todas las activas.
      body: JSON.stringify(event?.subscriptionId ? { subscriptionId: event.subscriptionId } : {}),
      signal: abort.signal,
    })
    cuerpo = await respuesta.text()
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`La app no contestó en ${TIMEOUT_MS / 1000}s — ${url}`)
    }
    throw new Error(`No se pudo llamar a la app (${url}): ${error.message}`)
  } finally {
    clearTimeout(temporizador)
  }

  let datos
  try {
    datos = JSON.parse(cuerpo)
  } catch {
    datos = { crudo: cuerpo.slice(0, 500) }
  }

  console.log(JSON.stringify({ status: respuesta.status, ...datos }))

  if (!respuesta.ok && respuesta.status !== 207) {
    throw new Error(`La app contestó ${respuesta.status}: ${cuerpo.slice(0, 500)}`)
  }

  // 207 significa que algo salió y algo no. La app ya mandó el correo de alerta con el detalle;
  // esto lanza para que además quede la métrica y la alarma.
  if (datos?.fallidos > 0) {
    throw new Error(`${datos.fallidos} suscripción(es) fallaron. Revisa el correo de alerta.`)
  }

  return { ok: true, enviados: datos?.enviados ?? 0, omitidos: datos?.omitidos ?? 0 }
}

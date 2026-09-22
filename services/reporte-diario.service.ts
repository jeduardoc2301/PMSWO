/**
 * El reporte diario que se manda solo.
 *
 * Esto corre sin sesión: lo dispara EventBridge, no un usuario. Dos consecuencias que mandan
 * sobre todo el diseño de este archivo:
 *
 * 1. **La organización se pasa, no se supone.** No hay `authContext` del cual sacarla, así que
 *    cada consulta filtra por la organización de la suscripción de forma explícita. Es la misma
 *    regla que el resto de la app; aquí solo es más fácil olvidarla, y olvidarla significa
 *    mandarle a un cliente el proyecto de otro.
 * 2. **Todo reintento tiene que ser inofensivo.** EventBridge reintenta, Lambda reintenta, y
 *    alguien va a probar el endpoint a mano. Por eso la fila de `report_deliveries` se reclama
 *    ANTES de hablar con SES: el segundo intento del mismo día choca contra el índice único y se
 *    sale sin mandar nada. El candado es la base de datos, no una bandera en memoria.
 */
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { logError, logInfo, logWarning } from '@/lib/logger'
import { sendEmail } from '@/lib/email/ses'
import { armarCorreoDiario } from '@/lib/reports/correo-diario'
import { buildProjectSnapshot, toBriefFacts } from '@/lib/reports/project-snapshot'
import type { ExecutiveBrief } from '@/lib/reports/project-report-docx'
import { AIService } from '@/lib/services/ai-service'

/**
 * Cuánto se le espera a Bedrock antes de mandar el correo sin narrativa.
 *
 * El corte existe porque el correo con cifras y sin prosa sirve, y el correo que nunca sale
 * porque el modelo se tardó no sirve para nada.
 *
 * Los 25 segundos no son un número redondo elegido a ojo: medido contra el plan real de 1368
 * tareas, Haiku tardó **18 segundos** (1385 tokens de entrada, 1789 de salida). Un corte en 20
 * habría dejado sin narrativa a la mitad de los envíos. Queda margen para la consulta y para SES
 * dentro del plazo que Amplify le da a una petición SSR — que es el techo real de todo esto, no
 * el `maxDuration` que declara la ruta.
 *
 * Si el endpoint se empieza a cortar, esto se baja por variable de entorno sin tocar código: el
 * correo pierde la prosa pero sigue llegando con las cifras, que es la degradación correcta.
 */
const TIMEOUT_NARRATIVA_MS = Number(process.env.REPORTE_NARRATIVA_TIMEOUT_MS ?? 25_000)

export type ResultadoEnvio =
  | { estado: 'ENVIADO'; subscriptionId: string; messageId: string; destinatarios: string[] }
  | { estado: 'OMITIDO'; subscriptionId: string; motivo: string }
  | { estado: 'FALLIDO'; subscriptionId: string; error: string }

/**
 * El día que cubre este envío, resuelto en la zona de la suscripción.
 *
 * No es lo mismo que `new Date()` truncado: a las 8 de la mañana en México ya son las 14:00 UTC,
 * pero a las 22:00 en México todavía es el día siguiente en UTC. Sin esta conversión, el envío
 * de la noche se guardaría con la fecha de mañana y el candado del día siguiente ya estaría
 * puesto — el reporte del día siguiente nunca saldría.
 */
export function diaEnZona(fecha: Date, timezone: string): Date {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha)
  // `en-CA` da YYYY-MM-DD. La columna es DATE, así que se ancla a medianoche UTC para que no se
  // desplace un día al guardarse.
  return new Date(`${partes}T00:00:00.000Z`)
}

function esViolacionDeUnico(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

function leerDestinatarios(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map(String).map((s) => s.trim()).filter(Boolean)
  if (typeof valor === 'string') return valor.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

/** La narrativa es opcional por diseño: si Bedrock falla o se tarda, el correo sale con cifras. */
async function narrativaConCorte(facts: Record<string, unknown>): Promise<ExecutiveBrief | undefined> {
  let temporizador: NodeJS.Timeout | undefined
  try {
    const corte = new Promise<undefined>((resolve) => {
      temporizador = setTimeout(() => resolve(undefined), TIMEOUT_NARRATIVA_MS)
    })
    const brief = await Promise.race([
      AIService.generateExecutiveBrief(facts) as Promise<ExecutiveBrief>,
      corte,
    ])
    if (!brief) {
      logWarning('[Reporte diario] la narrativa excedió el corte; se envía solo con cifras', {
        timeoutMs: TIMEOUT_NARRATIVA_MS,
      })
    }
    return brief ?? undefined
  } catch (error) {
    logWarning('[Reporte diario] la narrativa falló; se envía solo con cifras', {
      error: (error as Error).message,
    })
    return undefined
  } finally {
    if (temporizador) clearTimeout(temporizador)
  }
}

/**
 * Carga el proyecto con lo que el reporte necesita, siempre acotado a su organización.
 */
async function cargarProyecto(projectId: string, organizationId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, organizationId },
    include: {
      workItems: { select: { title: true, status: true, phase: true, estimatedEndDate: true, completedAt: true } },
      blockers: { select: { description: true, severity: true, resolvedAt: true } },
      risks: { select: { description: true, riskLevel: true, status: true } },
    },
  })
}

type Reclamo =
  | { tipo: 'listo'; deliveryId: string | null }
  | { tipo: 'omitir'; motivo: string }
  | { tipo: 'error'; error: Error }

/**
 * Reclama el envío del día para una suscripción.
 *
 * Toda la carrera vive aquí: crear gana, chocar con el índice único pierde, y lo que estaba antes
 * decide si se omite o se reintenta. Devuelve en vez de lanzar porque quien llama recorre varias
 * suscripciones y una excepción suelta dejaría sin correo a las siguientes.
 */
async function reclamarEnvio(
  subscriptionId: string,
  scheduledFor: Date,
  recipients: string[],
  ahora: Date
): Promise<Reclamo> {
  try {
    const creada = await prisma.reportDelivery.create({
      data: { subscriptionId, scheduledFor, status: 'ENVIANDO', attempts: 1, recipients },
    })
    return { tipo: 'listo', deliveryId: creada.id }
  } catch (error) {
    if (!esViolacionDeUnico(error)) return { tipo: 'error', error: error as Error }

    try {
      const previa = await prisma.reportDelivery.findUnique({
        where: { subscriptionId_scheduledFor: { subscriptionId, scheduledFor } },
      })

      if (!previa) {
        // El índice único se quejó pero la fila ya no está: alguien la borró en medio. Seguir
        // sería mandar sin candado y sin registro —sale el correo, nadie lo sabe, y el siguiente
        // disparo lo manda otra vez. Fallar sí avisa.
        return {
          tipo: 'error',
          error: new Error('La bitácora del envío cambió a media operación; no se mandó nada.'),
        }
      }

      if (previa.status === 'ENVIADO') {
        return { tipo: 'omitir', motivo: 'ya se envió el reporte de hoy' }
      }

      // Un `ENVIANDO` reciente es otro proceso trabajando ahora mismo; uno viejo es un proceso que
      // se murió a media tarea y dejó la fila trabada. Diez minutos separan los dos casos.
      const minutos = (+ahora - +previa.updatedAt) / 60000
      if (previa.status === 'ENVIANDO' && minutos < 10) {
        return { tipo: 'omitir', motivo: 'hay un envío en curso' }
      }

      await prisma.reportDelivery.update({
        where: { id: previa.id },
        data: { status: 'ENVIANDO', attempts: { increment: 1 }, error: null },
      })
      return { tipo: 'listo', deliveryId: previa.id }
    } catch (interno) {
      return { tipo: 'error', error: interno as Error }
    }
  }
}

export interface OpcionesEnvio {
  /** Momento de referencia. Las pruebas lo fijan; producción usa el reloj. */
  ahora?: Date
  /**
   * Prueba: manda el correo sin tocar la bitácora ni el candado del día, y opcionalmente a otra
   * dirección. Existe para poder ver el correo real antes de programarlo, sin gastar el envío
   * del día ni ensuciar el historial.
   */
  prueba?: { destinatarios?: string[] }
}

/**
 * Arma y manda el reporte de UNA suscripción.
 */
export async function enviarSuscripcion(
  subscriptionId: string,
  opciones: OpcionesEnvio = {}
): Promise<ResultadoEnvio> {
  const ahora = opciones.ahora ?? new Date()

  const sub = await prisma.reportSubscription.findUnique({ where: { id: subscriptionId } })
  if (!sub) return { estado: 'OMITIDO', subscriptionId, motivo: 'la suscripción no existe' }
  if (!sub.active && !opciones.prueba) {
    return { estado: 'OMITIDO', subscriptionId, motivo: 'la suscripción está inactiva' }
  }

  const destinatarios = opciones.prueba?.destinatarios?.length
    ? opciones.prueba.destinatarios
    : leerDestinatarios(sub.recipients)

  if (destinatarios.length === 0) {
    return { estado: 'OMITIDO', subscriptionId, motivo: 'la suscripción no tiene destinatarios' }
  }

  const diaCubierto = diaEnZona(ahora, sub.timezone)

  // ── El candado ────────────────────────────────────────────────────────────────────────────
  // Se reclama antes de cualquier trabajo caro y antes de SES. En modo prueba no se reclama
  // nada: probar el correo no debe consumir el envío del día.
  //
  // El resultado se devuelve, nunca se lanza. `enviarReportesDiarios` recorre suscripciones en
  // serie: una excepción que se escape de aquí no dejaría esta suscripción en rojo, dejaría sin
  // correo a TODAS las que venían detrás.
  const reclamo = opciones.prueba
    ? ({ tipo: 'listo', deliveryId: null } as const)
    : await reclamarEnvio(subscriptionId, diaCubierto, destinatarios, ahora)

  if (reclamo.tipo === 'omitir') {
    return { estado: 'OMITIDO', subscriptionId, motivo: reclamo.motivo }
  }
  if (reclamo.tipo === 'error') {
    logError('[Reporte diario] no se pudo reclamar el envío', reclamo.error, { subscriptionId })
    return { estado: 'FALLIDO', subscriptionId, error: reclamo.error.message }
  }
  const deliveryId = reclamo.deliveryId

  try {
    const proyecto = await cargarProyecto(sub.projectId, sub.organizationId)
    if (!proyecto) {
      throw new Error(
        `El proyecto ${sub.projectId} no existe o no pertenece a la organización de la suscripción.`
      )
    }

    const datosProyecto = {
      name: proyecto.name,
      client: proyecto.client,
      status: proyecto.status,
      startDate: proyecto.startDate,
      estimatedEndDate: proyecto.estimatedEndDate,
    }

    const snapshot = buildProjectSnapshot({
      project: datosProyecto,
      workItems: proyecto.workItems,
      blockers: proyecto.blockers,
      risks: proyecto.risks,
      now: ahora,
    })

    const brief = await narrativaConCorte(toBriefFacts(datosProyecto, snapshot))

    const correo = armarCorreoDiario({
      project: datosProyecto,
      snapshot,
      brief,
      appUrl: process.env.APP_PUBLIC_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL,
      projectId: proyecto.id,
    })

    const { messageId } = await sendEmail({
      to: destinatarios,
      subject: opciones.prueba ? `[PRUEBA] ${correo.subject}` : correo.subject,
      html: correo.html,
      text: correo.text,
    })

    if (deliveryId) {
      await prisma.reportDelivery.update({
        where: { id: deliveryId },
        data: { status: 'ENVIADO', messageId, sentAt: ahora, error: null },
      })
      await prisma.reportSubscription.update({
        where: { id: subscriptionId },
        data: { lastSentAt: ahora },
      })
    }

    logInfo('[Reporte diario] enviado', {
      subscriptionId,
      projectId: proyecto.id,
      organizationId: sub.organizationId,
      destinatarios,
      messageId,
      conNarrativa: Boolean(brief),
    })

    return { estado: 'ENVIADO', subscriptionId, messageId, destinatarios }
  } catch (error) {
    const mensaje = (error as Error).message ?? String(error)
    if (deliveryId) {
      // El error se guarda truncado: un stack de Bedrock puede traer kilobytes y la columna no es
      // el lugar para eso. Lo que importa aquí es poder ver qué pasó sin abrir CloudWatch.
      await prisma.reportDelivery
        .update({
          where: { id: deliveryId },
          data: { status: 'FALLIDO', error: mensaje.slice(0, 2000) },
        })
        .catch(() => undefined)
    }
    logError('[Reporte diario] falló el envío', error as Error, {
      subscriptionId,
      organizationId: sub.organizationId,
      projectId: sub.projectId,
    })
    return { estado: 'FALLIDO', subscriptionId, error: mensaje }
  }
}

/**
 * Avisa cuando un envío falló.
 *
 * Va por SES y no por CloudWatch porque una alarma dice «algo falló» y esto dice QUÉ falló: el
 * mensaje de error completo, en la bandeja, a la hora en que el reporte debió llegar. La alarma
 * de CloudWatch sigue existiendo y cubre el caso que esto no puede cubrir —que la app entera no
 * conteste—, pero para el caso común, que es una dirección sin verificar o Bedrock caído, el
 * correo trae la respuesta puesta.
 *
 * Nunca lanza: si la alerta falla, lo que importa es que el resultado del barrido llegue a quien
 * lo pidió. Una alerta que tumba el proceso que estaba reportando es peor que no tener alerta.
 */
export async function alertarFallas(resultados: ResultadoEnvio[]): Promise<void> {
  const fallidos = resultados.filter((r) => r.estado === 'FALLIDO')
  if (fallidos.length === 0) return

  const destino = process.env.ALERT_EMAIL
  if (!destino) {
    logWarning('[Reporte diario] hubo fallas pero ALERT_EMAIL no está configurada', {
      fallidos: fallidos.length,
    })
    return
  }

  const cuerpo = fallidos
    .map((f) => `• Suscripción ${f.subscriptionId}\n  ${'error' in f ? f.error : 'sin detalle'}`)
    .join('\n\n')

  const texto = [
    `El reporte diario falló en ${fallidos.length} de ${resultados.length} suscripciones.`,
    '',
    cuerpo,
    '',
    `Hora: ${new Date().toISOString()}`,
    'Este aviso lo manda la propia aplicación. Si tampoco llega, revisa la alarma de CloudWatch',
    'de la Lambda pm-reporte-diario: ese caso significa que la app no contestó.',
  ].join('\n')

  try {
    await sendEmail({
      to: destino.split(',').map((s) => s.trim()).filter(Boolean),
      subject: `⚠ Falló el reporte diario (${fallidos.length})`,
      html: `<pre style="font-family:Consolas,Menlo,monospace; font-size:13px; line-height:19px; color:#201E1D; white-space:pre-wrap;">${texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</pre>`,
      text: texto,
    })
  } catch (error) {
    logError('[Reporte diario] no se pudo mandar la alerta de falla', error as Error, {
      fallidos: fallidos.length,
    })
  }
}

/**
 * Recorre todas las suscripciones diarias activas.
 *
 * En serie y no en paralelo: SES en sandbox acepta un correo por segundo, y con una suscripción
 * la diferencia es nula. Cuando sean cincuenta, esto se parte en cola — pero entonces el candado
 * de `report_deliveries` ya está puesto y el cambio no arriesga correos duplicados.
 */
export async function enviarReportesDiarios(opciones: OpcionesEnvio = {}): Promise<ResultadoEnvio[]> {
  const subs = await prisma.reportSubscription.findMany({
    where: { active: true, frequency: 'DIARIO' },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })

  logInfo('[Reporte diario] inicio del barrido', { suscripciones: subs.length })

  const resultados: ResultadoEnvio[] = []
  for (const sub of subs) {
    resultados.push(await enviarSuscripcion(sub.id, opciones))
  }
  return resultados
}

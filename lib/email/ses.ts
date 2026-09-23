/**
 * Transporte de correo sobre Amazon SES.
 *
 * Una sola función de salida y ninguna plantilla: aquí solo se manda lo que otro ya redactó. Las
 * credenciales siguen el mismo patrón que S3 (`APP_AWS_*` primero, `AWS_*` de respaldo) porque en
 * Amplify las variables reservadas con prefijo `AWS_` no se pueden definir a mano.
 *
 * Sobre el remitente, que es donde esto se rompe en producción y no en pruebas: `softwareone.com`
 * publica `p=quarantine` en DMARC y su SPF no incluye a SES. Un correo que salga de SES diciendo
 * ser `@softwareone.com` no alinea ni SPF ni DKIM, y Proofpoint lo manda a cuarentena — sin
 * rebote, sin aviso, simplemente no llega. Por eso `SES_FROM_ADDRESS` tiene que apuntar a un
 * dominio verificado con DKIM propio en esta cuenta, y el buzón de SoftwareOne va en el `to`.
 */
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import { logError, logInfo } from '@/lib/logger'

export interface EmailMessage {
  to: string[]
  subject: string
  html: string
  /** Alternativa en texto plano. No es opcional en la práctica: sin ella sube el puntaje de spam. */
  text: string
  replyTo?: string[]
}

export interface SendResult {
  messageId: string
  to: string[]
}

let cached: SESv2Client | null = null

function getClient(): SESv2Client {
  if (cached) return cached

  // `||` y no `??`: la lista `env` de next.config.ts incrusta las variables no puestas como ''.
  const region = process.env.SES_REGION || process.env.APP_AWS_REGION || 'us-east-1'
  const accessKeyId = process.env.APP_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.APP_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY

  // Sin llaves explícitas se deja que el SDK busque el rol de la instancia: es como debería
  // correr esto en producción el día que las llaves de larga vida se retiren.
  cached = new SESv2Client({
    region,
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  })
  return cached
}

/** Solo para las pruebas, que necesitan un cliente limpio entre casos. */
export function resetSesClient(): void {
  cached = null
}

function getFrom(): string {
  const address = process.env.SES_FROM_ADDRESS
  if (!address) {
    throw new Error(
      'SES_FROM_ADDRESS no está configurada. Debe ser una identidad verificada en SES ' +
        '(por ejemplo reportes@swodelivery.com), no un buzón de softwareone.com.'
    )
  }
  const name = process.env.SES_FROM_NAME
  // El nombre se encierra en comillas por si trae una coma, que rompería la cabecera.
  return name ? `"${name.replace(/"/g, '')}" <${address}>` : address
}

/**
 * Traduce los errores de SES a algo que se pueda accionar sin abrir la consola de AWS.
 *
 * El caso que más va a pasar mientras la cuenta siga en sandbox: mandar a alguien que no está
 * verificado. SES contesta `MessageRejected` con un texto genérico y el correo no sale para
 * NINGÚN destinatario, no solo para el que falta.
 */
function explain(error: unknown, to: string[]): Error {
  const err = error as { name?: string; message?: string }
  const msg = err?.message ?? String(error)

  if (err?.name === 'MessageRejected' && /not verified/i.test(msg)) {
    return new Error(
      `SES rechazó el envío a ${to.join(', ')}: hay una dirección sin verificar. ` +
        'La cuenta está en sandbox, así que remitente y CADA destinatario tienen que estar ' +
        'verificados como identidad. Verifica con: ' +
        `aws sesv2 create-email-identity --email-identity <correo> --region ${process.env.SES_REGION || process.env.APP_AWS_REGION || 'us-east-1'}`
    )
  }

  if (err?.name === 'AccountSuspendedException') {
    return new Error('SES suspendió la cuenta — normalmente por rebotes o quejas acumuladas.')
  }

  if (err?.name === 'SendingPausedException') {
    return new Error('El envío está pausado en esta cuenta de SES.')
  }

  if (err?.name === 'LimitExceededException' || /Maximum sending rate/i.test(msg)) {
    return new Error('Se excedió la cuota de SES (200 correos/día y 1 por segundo en sandbox).')
  }

  return new Error(`SES falló al enviar a ${to.join(', ')}: ${msg}`)
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const to = message.to.map((t) => t.trim()).filter(Boolean)
  if (to.length === 0) throw new Error('No hay destinatarios para el correo.')

  const from = getFrom()
  const configurationSet = process.env.SES_CONFIGURATION_SET
  const replyTo = message.replyTo ?? (process.env.SES_REPLY_TO ? [process.env.SES_REPLY_TO] : undefined)

  const command = new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: to },
    ...(replyTo ? { ReplyToAddresses: replyTo } : {}),
    ...(configurationSet ? { ConfigurationSetName: configurationSet } : {}),
    Content: {
      Simple: {
        Subject: { Data: message.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: message.html, Charset: 'UTF-8' },
          Text: { Data: message.text, Charset: 'UTF-8' },
        },
      },
    },
  })

  try {
    const out = await getClient().send(command)
    const messageId = out.MessageId ?? ''
    logInfo('[SES] correo enviado', { to, subject: message.subject, messageId })
    return { messageId, to }
  } catch (error) {
    const explained = explain(error, to)
    logError('[SES] envio fallido', explained, { to, subject: message.subject })
    throw explained
  }
}

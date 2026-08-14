/**
 * GET /api/v1/ai/diagnose
 *
 * Diagnóstico de la integración con Bedrock. Existe porque desde el navegador
 * un 500 no dice nada y los logs de la función no siempre están a mano.
 *
 * Reporta qué variables de entorno están presentes (SOLO presencia, nunca el
 * valor) y hace una llamada mínima a Bedrock para devolver el error exacto de
 * AWS si falla.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { Permission } from '@/types'

export const maxDuration = 30

async function diagnoseHandler(
  _request: NextRequest,
  _context: { params: Promise<{}> },
  _authContext: AuthContext
): Promise<NextResponse> {
  const hay = (name: string) => Boolean(process.env[name])

  const accessKeyId =
    process.env.APP_AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey =
    process.env.APP_AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY
  const region =
    process.env.APP_AWS_REGION || process.env.AWS_REGION || 'us-east-1'
  const modelId =
    process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0'

  const env = {
    APP_AWS_ACCESS_KEY_ID: hay('APP_AWS_ACCESS_KEY_ID'),
    APP_AWS_SECRET_ACCESS_KEY: hay('APP_AWS_SECRET_ACCESS_KEY'),
    APP_AWS_REGION: process.env.APP_AWS_REGION ?? null,
    AWS_ACCESS_KEY_ID: hay('AWS_ACCESS_KEY_ID'),
    AWS_SECRET_ACCESS_KEY: hay('AWS_SECRET_ACCESS_KEY'),
    AWS_SESSION_TOKEN: hay('AWS_SESSION_TOKEN'),
    AWS_REGION: process.env.AWS_REGION ?? null,
    BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID ?? null,
    BEDROCK_GUARDRAIL_ID: hay('BEDROCK_GUARDRAIL_ID'),
  }

  // Cuál juego de credenciales acabaría usando el servicio. Las AWS_* en
  // Amplify son las del rol de ejecución de la Lambda, no unas propias.
  const credencialesEnUso = process.env.APP_AWS_ACCESS_KEY_ID
    ? 'APP_AWS_* (variables propias)'
    : process.env.AWS_ACCESS_KEY_ID
      ? 'AWS_* (rol de ejecución de la Lambda — no sirve para Bedrock)'
      : 'ninguna'

  if (!accessKeyId || !secretAccessKey) {
    return NextResponse.json({
      env,
      credencialesEnUso,
      region,
      modelId,
      bedrock: { ok: false, motivo: 'No hay credenciales configuradas.' },
    })
  }

  const sessionToken =
    process.env.APP_AWS_SESSION_TOKEN ||
    (accessKeyId === process.env.AWS_ACCESS_KEY_ID
      ? process.env.AWS_SESSION_TOKEN
      : undefined)

  // Llamada mínima: confirma credenciales, permisos y acceso al modelo sin
  // gastar tokens ni depender del tamaño del proyecto.
  let bedrock: Record<string, unknown>
  const inicio = Date.now()
  try {
    const client = new BedrockRuntimeClient({
      region,
      credentials: { accessKeyId, secretAccessKey, sessionToken },
    })
    await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      })
    )
    bedrock = { ok: true, latenciaMs: Date.now() - inicio }
  } catch (error) {
    const err = error as Error & {
      $metadata?: { httpStatusCode?: number }
      code?: string
    }
    bedrock = {
      ok: false,
      latenciaMs: Date.now() - inicio,
      name: err?.name ?? null,
      message: err?.message ?? String(error),
      code: err?.code ?? null,
      httpStatus: err?.$metadata?.httpStatusCode ?? null,
    }
  }

  return NextResponse.json({ env, credencialesEnUso, region, modelId, bedrock })
}

export const GET = withAuth(diagnoseHandler, {
  requiredPermissions: [Permission.AI_USE],
})

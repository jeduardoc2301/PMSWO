import { Metadata } from 'next'
import React from 'react'
import { setRequestLocale } from 'next-intl/server'

import { locales } from '@/i18n/config'

import { PlanClient } from './plan-client'
import { cargarPlan } from './plan-source'

export const metadata: Metadata = {
  title: 'Plan | Project Management',
  description: 'El plan integrado: cronograma, ruta crítica y qué depende del cliente',
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

/**
 * La pantalla del plan.
 *
 * El servidor solo abre el archivo; el navegador hace el resto. Ver `plan-source.ts` para por qué el
 * reparto es ese.
 */
export default async function PlanPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)

  const resultado = cargarPlan()

  if (!resultado.ok) {
    return <SinPlan ruta={resultado.ruta} motivo={resultado.motivo} />
  }

  const { plan } = resultado

  return (
    <PlanClient
      tasks={plan.tasks}
      dependencies={plan.dependencies}
      start={plan.start}
      declaredFinish={plan.declaredFinish}
      fileName={plan.fileName}
      rowCount={plan.rowCount}
      warnings={plan.warnings}
    />
  )
}

/**
 * Qué se ve cuando no hay archivo.
 *
 * Una pantalla vacía sin explicación hace perder media hora averiguando si está rota o si falta un
 * dato. Aquí se dice cuál archivo falta y dónde va.
 */
function SinPlan({ ruta, motivo }: { ruta: string; motivo: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8" style={{ background: '#0b0b0d' }}>
      <div className="max-w-lg rounded-xl border border-zinc-800 bg-[#18181b] p-8">
        <h1 className="text-lg font-semibold text-zinc-100">Todavía no hay un plan que mostrar</h1>
        <p className="mt-3 text-sm text-zinc-400">{motivo}</p>
        <p className="mt-4 text-sm text-zinc-400">
          Esta pantalla lee el plan de{' '}
          <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-300">{ruta}</code>, dentro del
          proyecto. Ese archivo no se versiona —es un artefacto de trabajo, no del producto—, así que hay que
          ponerlo ahí a mano.
        </p>
      </div>
    </div>
  )
}

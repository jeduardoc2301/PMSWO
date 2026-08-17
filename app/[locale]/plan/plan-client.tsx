'use client'

/**
 * La pantalla del plan de referencia.
 *
 * Quedó como un envoltorio delgado: todo el trabajo vive en `PlanWorkspace`, que es la misma pieza
 * que monta la pestaña Timeline de cada proyecto. Esta página solo aporta la fuente de datos —el
 * archivo de referencia leído en el servidor— y el marco de página completa.
 */

import React from 'react'

import { PlanWorkspace } from '@/components/plan/plan-workspace'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

export interface PlanClientProps {
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  readonly start: string
  readonly declaredFinish: string
  readonly fileName: string
  readonly rowCount: number
  readonly warnings: readonly string[]
}

export function PlanClient({
  tasks,
  dependencies,
  start,
  declaredFinish,
  fileName,
  rowCount,
  warnings,
}: PlanClientProps) {
  return (
    <div className="min-h-screen p-8" style={{ background: '#0b0b0d' }}>
      <div className="mx-auto max-w-[1600px]">
        <PlanWorkspace
          tasks={tasks}
          dependencies={dependencies}
          start={start}
          deadline={declaredFinish}
          projectName="Plan integrado"
          origin={`${fileName} · ${rowCount.toLocaleString('es-MX')} líneas`}
          warnings={warnings}
        />
      </div>
    </div>
  )
}

/**
 * La vista ejecutiva.
 *
 * Es un componente de presentación puro: recibe el informe ya calculado y lo dibuja. No consulta la
 * base, no llama al motor y no arma texto propio — todo lo que dice viene de `ExecutiveBrief`, que
 * a su vez cuenta del plan. Si esta pantalla mostrara una cifra que no está en el informe, esa cifra
 * estaría escrita a mano, que es justo lo que C12 prohíbe.
 *
 * El orden de la pantalla es el de las preguntas de dirección, y no es negociable: primero la fecha,
 * luego el margen, luego qué lo puede mover, y al final qué depende del cliente. Quien entra a esta
 * vista quiere la fecha en el primer vistazo.
 */

// El repositorio compila JSX en modo clásico (tsconfig usa jsx: preserve y vitest no carga el
// plugin de React), así que React tiene que estar en el ámbito o las pruebas fallan con
// «React is not defined». Se importa aquí en vez de tocar la configuración global, que es un
// cambio que afecta a todo el repositorio y está propuesto aparte en la bitácora.
import React from 'react'

import type { ExecutiveBrief, MarginState, RiskItem } from '@/lib/scheduling/executive-brief'

export interface ExecutiveBriefPanelProps {
  readonly brief: ExecutiveBrief
  /** Nombre del proyecto, para encabezar. */
  readonly projectName: string
}

/** Cómo se ve el margen según su estado. El color dice lo mismo que el texto, no algo distinto. */
const MARGIN_TONE: Readonly<Record<MarginState, { label: string; className: string }>> = {
  HOLGADO: { label: 'Con margen', className: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  JUSTO: { label: 'Sin margen', className: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  EN_DEUDA: { label: 'Después de la fecha', className: 'text-red-400 border-red-500/30 bg-red-500/10' },
  SIN_COMPROMISO: { label: 'Sin fecha comprometida', className: 'text-slate-400 border-slate-500/30 bg-slate-500/10' },
}

export function ExecutiveBriefPanel({ brief, projectName }: ExecutiveBriefPanelProps) {
  const tone = MARGIN_TONE[brief.marginState]

  return (
    <section aria-labelledby="titulo-vista-ejecutiva" className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 id="titulo-vista-ejecutiva" className="text-2xl font-semibold text-slate-100">
          {projectName}
        </h1>
        <p className="text-sm text-slate-400">Al {brief.asOf}</p>
      </header>

      {/* 1 y 2 · La fecha y el margen, juntos porque se leen juntos. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Tarjeta titulo="Cierra el" valor={brief.closesOn} detalle={`${brief.workingDays} días de trabajo`} />
        <Tarjeta
          titulo="Margen"
          valor={describeMargin(brief)}
          detalle={brief.commitment ? `Comprometido para el ${brief.commitment}` : 'No hay fecha comprometida'}
          className={tone.className}
          etiqueta={tone.label}
        />
        <Tarjeta
          titulo="Trabajo terminado"
          valor={`${Math.round(brief.progress * 100)} %`}
          detalle="Ponderado por el trabajo de cada tarea"
        />
      </div>

      {/* El informe en prosa: es lo que se lee en voz alta en el comité. */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-5">
        {brief.paragraphs.map((parrafo) => (
          <p key={parrafo.slice(0, 48)} className="text-sm leading-relaxed text-slate-300">
            {parrafo}
          </p>
        ))}
      </div>

      {/* 3 · Qué lo puede mover. */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-slate-100">Qué puede mover la fecha</h2>
        {brief.whatCanMoveIt.length === 0 ? (
          <p className="text-sm text-slate-400">
            Hoy no hay compromisos pendientes que detengan otras tareas.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {brief.whatCanMoveIt.map((riesgo) => (
              <Riesgo key={riesgo.id} riesgo={riesgo} />
            ))}
          </ul>
        )}
      </div>

      {/* 4 · Qué depende del cliente. */}
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-slate-100">Cómo se reparte</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Tarjeta
            titulo="En manos del cliente"
            valor={String(brief.notRecoverableFromClient)}
            detalle={`De ${brief.clientCommitments} compromisos, hoy detienen ${brief.linesBlockedByClient} tareas`}
          />
          <Tarjeta
            titulo="En las nuestras"
            valor={String(brief.notRecoverableFromProvider)}
            detalle="Puntos que no se adelantan sumando personas"
          />
        </div>
      </div>
    </section>
  )
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  className,
  etiqueta,
}: {
  titulo: string
  valor: string
  detalle: string
  className?: string
  etiqueta?: string
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-lg border p-4 ${className ?? 'border-slate-700 bg-slate-900/50'}`}>
      <p className="text-xs uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className="text-xl font-semibold">{valor}</p>
      {etiqueta ? <p className="text-xs font-medium">{etiqueta}</p> : null}
      <p className="text-xs text-slate-400">{detalle}</p>
    </div>
  )
}

function Riesgo({ riesgo }: { riesgo: RiskItem }) {
  return (
    <li className="flex flex-col gap-1 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-slate-100">{riesgo.name}</span>
        <span className="text-xs text-slate-400">Para el {riesgo.dueDate}</span>
      </div>
      <p className="text-sm text-slate-300">{riesgo.why}</p>
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        <span>{riesgo.owner ?? 'Sin responsable nombrado'}</span>
        <span>·</span>
        <span>
          Detiene {riesgo.blocks} {riesgo.blocks === 1 ? 'tarea' : 'tareas'}
        </span>
      </div>
    </li>
  )
}

/** El margen dicho como lo diría una persona, no como un número con signo. */
function describeMargin(brief: ExecutiveBrief): string {
  if (brief.marginDays === null) return '—'
  if (brief.marginDays > 0) return `${brief.marginDays} ${brief.marginDays === 1 ? 'día' : 'días'}`
  if (brief.marginDays === 0) return 'Ninguno'
  const tarde = Math.abs(brief.marginDays)
  return `${tarde} ${tarde === 1 ? 'día tarde' : 'días tarde'}`
}

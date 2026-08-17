'use client'

/**
 * La vista de esquema del plan: la hoja «Plan» del archivo de referencia, como tabla.
 *
 * El Gantt responde «cuándo»; esta vista responde «cómo vamos». Cada fila es una línea del plan con
 * su estado al corte, su avance y sus días de atraso o ventaja — las tres columnas que en el Excel
 * se calculan con fórmula y aquí salen del motor, que es donde esas fórmulas viven y se prueban.
 * Este componente no calcula ninguna: recibe el plan, se lo da al motor y dibuja lo que devuelve.
 *
 * Dos decisiones de reparto que conviene dejar dichas:
 *
 * - **El plegado es estado local.** Abrir o cerrar un bloque es un gesto de lectura, no un dato del
 *   proyecto: no se persiste ni le importa a nadie más. Vive aquí, en un Set de ids.
 * - **El corte y el avance son datos del proyecto.** Congelar el corte o capturar avance sale por
 *   callback y quien monta persiste y devuelve las props actualizadas. Si esta vista guardara por su
 *   cuenta, habría dos verdades sobre el mismo plan.
 *
 * No hay virtualización a propósito: el plan real trae 1 368 líneas, pero el plegado inicial deja a
 * la vista ~130 y `ganttLayout` solo devuelve las visibles. El recorte ya está hecho antes de tocar
 * el DOM.
 */

import React, { useMemo, useRef, useState } from 'react'

import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { classifySuperCritical } from '@/lib/scheduling/critical-path'
import { type GanttRow, collapseToLevel, ganttLayout } from '@/lib/scheduling/gantt'
import { rollUpProgress } from '@/lib/scheduling/progress'
import { schedulePlan } from '@/lib/scheduling/schedule'
import { type EstadoAlCorte, varianceAtCutoff } from '@/lib/scheduling/schedule-variance'
import type { Dependency, PlanTask, TaskKind } from '@/lib/scheduling/types'

export interface WorkItemsOutlineProps {
  /** El plan del proyecto, como lo entrega GET /api/v1/projects/[id]/schedule. */
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  /** Primer día del plan. */
  readonly start: string
  /** La fecha de corte YA RESUELTA (la congelada del proyecto, o hoy). */
  readonly cutoff: string
  /** Verdadero si el proyecto tiene el corte congelado. */
  readonly cutoffFrozen: boolean
  /** Congelar el corte en una fecha, o null para descongelarlo (vuelve a «hoy»). */
  readonly onCutoffChange: (iso: string | null) => void
  /** Capturar avance de una hoja, de 0 a 1. Quien monta persiste y actualiza tasks. */
  readonly onProgressChange: (id: string, progress: number) => void
  /** Abrir el editor de vínculos de una línea. Sin esto, la columna solo informa. */
  readonly onEditLinks?: (id: string) => void
}

/**
 * Abre en bloques, no en detalle. Con todo abierto el plan real son 1 368 renglones; hasta el nivel
 * de bloques quedan ~130, que es donde una revisión de avance empieza a leer.
 */
const NIVEL_INICIAL = 2

/**
 * Cada clase de línea, en palabras. Las cadenas de la enumeración son del motor y de la base; a la
 * pantalla no llega ninguna.
 */
const TIPO_EN_PALABRAS: Readonly<Record<Exclude<TaskKind, 'RESUMEN'>, string>> = Object.freeze({
  ACTIVIDAD: 'Actividad',
  HITO: 'Hito',
  PUNTO_DE_CONTROL: 'Punto de control',
  APROBACION_CLIENTE: 'Aprobación del cliente',
  ENTREGA_CLIENTE: 'Entrega del cliente',
  COMPUERTA: 'Compuerta',
})

const INSIGNIA: Readonly<Record<EstadoAlCorte, { readonly texto: string; readonly clase: string }>> =
  Object.freeze({
    NO_INICIADO: { texto: 'No iniciado', clase: 'border-zinc-700 bg-zinc-800/60 text-zinc-400' },
    EN_CURSO: { texto: 'En curso', clase: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
    CERRADO: { texto: 'Cerrado', clase: 'border-green-500/30 bg-green-500/10 text-green-400' },
  })

export function WorkItemsOutline({
  tasks,
  dependencies,
  start,
  cutoff,
  cutoffFrozen,
  onCutoffChange,
  onProgressChange,
  onEditLinks,
}: WorkItemsOutlineProps): React.JSX.Element {
  const jerarquia = useMemo(() => nivelesDelPlan(tasks), [tasks])
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(
    () => new Set(collapseToLevel(jerarquia, NIVEL_INICIAL)),
  )

  // El mismo reparto que el espacio de trabajo del plan: lo caro —programar, clasificar, acumular—
  // depende solo de los datos y corre una vez; el trazado depende del plegado y corre en cada gesto.
  const base = useMemo(() => {
    if (tasks.length === 0) return null
    const calendar = createWorkCalendar()
    const schedule = schedulePlan({ tasks, dependencies, calendar, start })
    const analysis = analyzeCriticalPath(schedule)
    return {
      calendar,
      schedule,
      classified: classifySuperCritical(analysis, tasks).tasks,
      rollup: rollUpProgress(tasks),
    }
  }, [tasks, dependencies, start])

  const layout = useMemo(() => {
    if (base === null) return null
    return ganttLayout({
      tasks,
      dependencies,
      schedule: base.schedule,
      classified: base.classified,
      calendar: base.calendar,
      collapsed: [...plegados],
      // Aquí no se dibujan flechas, y pedirlas sería pagar el reanclado de vínculos para tirarlo.
      links: 'NINGUNO',
    })
  }, [tasks, dependencies, base, plegados])

  const porId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks])

  // Cuántos vínculos entran y salen de cada línea. La columna existe para que las dependencias
  // dejen de ser un secreto del Timeline: quien revisa avance ve ahí mismo qué amarra qué.
  const vinculosDe = useMemo(() => {
    const cuenta = new Map<string, { entran: number; salen: number }>()
    for (const v of dependencies) {
      const s = cuenta.get(v.successorId) ?? { entran: 0, salen: 0 }
      s.entran += 1
      cuenta.set(v.successorId, s)
      const p = cuenta.get(v.predecessorId) ?? { entran: 0, salen: 0 }
      p.salen += 1
      cuenta.set(v.predecessorId, p)
    }
    return cuenta
  }, [dependencies])

  if (base === null || layout === null) {
    return (
      <p className="rounded-lg border border-zinc-800 bg-[#18181b] p-6 text-sm text-zinc-400">
        El plan no tiene líneas todavía.
      </p>
    )
  }

  const alternar = (id: string): void => {
    setPlegados((antes) => {
      const ahora = new Set(antes)
      if (ahora.has(id)) ahora.delete(id)
      else ahora.add(id)
      return ahora
    })
  }

  const visibles = layout.rows.length
  const contador = `${visibles === 1 ? 'Se ve' : 'Se ven'} ${visibles} de ${tasks.length} ${
    tasks.length === 1 ? 'línea' : 'líneas'
  }`

  return (
    <div className="flex flex-col gap-3">
      <BarraDelCorte cutoff={cutoff} cutoffFrozen={cutoffFrozen} onCutoffChange={onCutoffChange} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPlegados(new Set())}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Expandir todo
          </button>
          <button
            type="button"
            onClick={() => setPlegados(new Set(collapseToLevel(jerarquia, 0)))}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Contraer todo
          </button>
        </div>
        <p className="text-xs text-zinc-500">{contador}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-[#18181b]">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-400">
              <th className="px-3 py-2 font-medium">Línea del plan</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Estado al corte</th>
              <th className="px-3 py-2 text-right font-medium">% avance</th>
              <th className="px-3 py-2 text-right font-medium">Atraso (−) / Ventaja (+)</th>
              <th className="px-3 py-2 text-center font-medium">Vínculos</th>
              <th className="px-3 py-2 font-medium">Responsable</th>
              <th className="px-3 py-2 font-medium">Inicio</th>
              <th className="px-3 py-2 font-medium">Fin</th>
            </tr>
          </thead>
          <tbody>
            {layout.rows.map((row) => (
              <Linea
                key={row.id}
                row={row}
                avance={avanceEfectivo(row, base.rollup)}
                owner={porId.get(row.id)?.owner}
                vinculos={vinculosDe.get(row.id)}
                onEditLinks={onEditLinks}
                cutoff={cutoff}
                calendar={base.calendar}
                onToggle={alternar}
                onProgressChange={onProgressChange}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * El avance con el que se juzga una fila: el propio en una hoja, el acumulado en un resumen. Un
 * resumen no tiene avance capturado — hereda el de sus hijas pesado por el trabajo de cada una.
 */
function avanceEfectivo(row: GanttRow, rollup: ReturnType<typeof rollUpProgress>): number {
  if (!row.isSummary) return row.progress
  const acumulado = rollup.byId.get(row.id)
  if (!acumulado || acumulado.weight === 0) return 0
  return acumulado.earnedDays / acumulado.weight
}

function Linea({
  row,
  avance,
  owner,
  vinculos,
  cutoff,
  calendar,
  onToggle,
  onProgressChange,
  onEditLinks,
}: {
  row: GanttRow
  avance: number
  owner: string | undefined
  vinculos: { entran: number; salen: number } | undefined
  cutoff: string
  calendar: ReturnType<typeof createWorkCalendar>
  onToggle: (id: string) => void
  onProgressChange: (id: string, progress: number) => void
  onEditLinks?: (id: string) => void
}) {
  // La fórmula del archivo, sobre las fechas del motor. En un resumen la duración es su lapso en
  // días hábiles y el avance es el acumulado ponderado — la misma pareja (G, H) que el archivo usa
  // en sus filas de resumen, y por eso el atraso de una fase aquí da la misma cifra que su fórmula:
  // es su promesa completa contra el calendario, no la suma de los atrasos de sus hijas.
  const variance = varianceAtCutoff(
    { start: row.start, finish: row.finish, duration: row.width, progress: avance, cutoff },
    calendar,
  )
  const insignia = INSIGNIA[variance.estado]

  return (
    <tr className={`border-b border-zinc-800 last:border-b-0 ${row.isSummary ? 'bg-[#111113]' : ''}`}>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1" style={{ paddingLeft: row.level * 16 }}>
          {row.hasChildren ? (
            <button
              type="button"
              aria-label={row.isCollapsed ? `Abrir ${row.name}` : `Cerrar ${row.name}`}
              aria-expanded={!row.isCollapsed}
              onClick={() => onToggle(row.id)}
              className="w-4 shrink-0 text-zinc-400"
            >
              {row.isCollapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span className="w-4 shrink-0" aria-hidden="true" />
          )}
          {row.isSuperCritical ? (
            // La otra vista ya tiene columna de prioridad; aquí basta la marca para no perderla.
            <span
              data-testid={`super-${row.id}`}
              title="En la ruta súper crítica: su atraso no se recupera con más gente"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
            />
          ) : null}
          <span
            className={`truncate ${row.isSummary ? 'font-medium text-zinc-100' : 'text-zinc-300'}`}
            title={row.name}
          >
            {row.name}
          </span>
        </div>
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-zinc-400">{tipoDeLinea(row)}</td>
      <td className="px-3 py-1.5">
        <span
          data-testid={`estado-${row.id}`}
          className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${insignia.clase}`}
        >
          {insignia.texto}
        </span>
      </td>
      <td className="px-3 py-1.5 text-right">
        {row.isSummary ? (
          <span
            data-testid={`avance-${row.id}`}
            title="Se acumula del avance de sus líneas; no se captura aquí"
            className="italic text-zinc-500"
          >
            {Math.round(avance * 100)}%
          </span>
        ) : (
          // La llave remonta el campo cuando el avance persistido cambia: el valor capturado deja de
          // ser borrador y el campo vuelve a decir lo que el plan dice.
          <CapturaDeAvance
            key={`${row.id}:${row.progress}`}
            id={row.id}
            name={row.name}
            progress={row.progress}
            onProgressChange={onProgressChange}
          />
        )}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">
        <Delta id={row.id} valor={variance.deltaDays} />
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-center">
        <CeldaDeVinculos row={row} vinculos={vinculos} onEditLinks={onEditLinks} />
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-zinc-300">{owner ? owner : '—'}</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-zinc-400">{row.start}</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-zinc-400">{row.finish}</td>
    </tr>
  )
}

/**
 * El tipo, en palabras. Un resumen se nombra por su profundidad —etapa, fase, bloque—, que es como
 * se habla del plan en una revisión; y una ola se llama ola aunque el plan la guarde como resumen,
 * porque «Ola 2» es el nombre con el que el cliente la conoce.
 */
function tipoDeLinea(row: GanttRow): string {
  if (row.isSummary) {
    if (/^Ola \d/.test(row.name)) return 'Ola'
    if (row.level === 0) return 'Etapa'
    if (row.level === 1) return 'Fase'
    return 'Bloque'
  }
  // Un RESUMEN sin hijas no agrupa nada todavía; se nombra bloque, no con la cadena cruda.
  return row.kind === 'RESUMEN' ? 'Bloque' : TIPO_EN_PALABRAS[row.kind]
}

/**
 * La celda de vínculos: cuántos entran (◂) y salen (▸), y la puerta al editor.
 *
 * En un resumen solo se informa: sus vínculos reales viven en sus hijas y editar «los del resumen»
 * sería ambiguo. En una hoja, si quien monta ofreció editor, la celda entera es el botón que lo
 * abre — incluso con cero vínculos, porque capturar el primero es justamente el caso que importa.
 */
function CeldaDeVinculos({
  row,
  vinculos,
  onEditLinks,
}: {
  row: GanttRow
  vinculos: { entran: number; salen: number } | undefined
  onEditLinks?: (id: string) => void
}) {
  const texto = `${vinculos?.entran ?? 0} ◂ · ${vinculos?.salen ?? 0} ▸`
  if (!onEditLinks || row.isSummary) {
    return <span className="text-xs text-zinc-500">{texto}</span>
  }
  return (
    <button
      type="button"
      aria-label={`Editar vínculos de ${row.name}`}
      onClick={() => onEditLinks(row.id)}
      className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
    >
      {texto}
    </button>
  )
}

/** Días de atraso o ventaja, con el signo y la décima del archivo. El cero se atenúa: no es noticia. */
function Delta({ id, valor }: { id: string; valor: number }) {
  if (valor === 0) {
    return (
      <span data-testid={`delta-${id}`} className="text-zinc-600">
        0
      </span>
    )
  }
  return (
    <span data-testid={`delta-${id}`} className={valor > 0 ? 'text-green-400' : 'text-red-400'}>
      {valor > 0 ? `+${valor.toFixed(1)}` : valor.toFixed(1)}
    </span>
  )
}

/**
 * La captura de avance de una hoja.
 *
 * Avisa al confirmar —blur o Enter—, no en cada tecla: capturar «45» no debe persistir «4» en el
 * camino. Y solo si el valor cambió, porque cada aviso dispara una escritura en quien monta.
 */
function CapturaDeAvance({
  id,
  name,
  progress,
  onProgressChange,
}: {
  id: string
  name: string
  progress: number
  onProgressChange: (id: string, progress: number) => void
}) {
  // A décimas de punto porcentual: 0.4 × 100 en coma flotante no da 40 exacto, y el campo no puede
  // abrir diciendo 40.000000000000006.
  const inicial = Math.round(progress * 1000) / 10
  // Lo último avisado, para que Enter seguido del blur no avise dos veces el mismo valor.
  const confirmado = useRef(inicial)

  const confirmar = (campo: HTMLInputElement): void => {
    // Un campo vacío o ilegible no es una captura de cero: se restaura lo último confirmado.
    if (campo.value.trim() === '' || !Number.isFinite(Number(campo.value))) {
      campo.value = String(confirmado.current)
      return
    }
    const acotado = Math.min(100, Math.max(0, Number(campo.value)))
    campo.value = String(acotado)
    if (acotado === confirmado.current) return
    confirmado.current = acotado
    onProgressChange(id, acotado / 100)
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        defaultValue={inicial}
        aria-label={`Avance de ${name}`}
        onBlur={(evento) => confirmar(evento.currentTarget)}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter') confirmar(evento.currentTarget)
        }}
        className="w-14 rounded border border-zinc-700 bg-[#111113] px-1.5 py-0.5 text-right text-zinc-100 focus:border-[#6366f1] focus:outline-none"
      />
      <span className="text-zinc-500">%</span>
    </span>
  )
}

/**
 * La barra del corte: contra qué fecha se están midiendo el estado y el atraso de toda la tabla.
 *
 * Elegir una fecha la congela; congelada, el plan es una foto que dice lo mismo hoy que la semana
 * que entra. Descongelar vuelve a «hoy», que flota con el calendario. La resolución de cuál aplica
 * no es de esta vista: llega ya resuelta en `cutoff`.
 */
function BarraDelCorte({
  cutoff,
  cutoffFrozen,
  onCutoffChange,
}: {
  cutoff: string
  cutoffFrozen: boolean
  onCutoffChange: (iso: string | null) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-[#18181b] px-3 py-2 text-sm">
      <label htmlFor="corte-del-avance" className="text-zinc-300">
        Corte del avance:
      </label>
      <input
        id="corte-del-avance"
        type="date"
        value={cutoff}
        onChange={(evento) => {
          // Borrar el campo no es descongelar; para eso está el botón, que lo dice con palabras.
          if (evento.target.value !== '') onCutoffChange(evento.target.value)
        }}
        className="rounded border border-zinc-700 bg-[#111113] px-2 py-1 text-zinc-100 focus:border-[#6366f1] focus:outline-none"
      />
      {cutoffFrozen ? (
        <React.Fragment>
          <span className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-300">
            congelado
          </span>
          <button
            type="button"
            onClick={() => onCutoffChange(null)}
            className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Descongelar
          </button>
        </React.Fragment>
      ) : (
        <span className="text-xs text-zinc-500">
          El corte es hoy y se mueve con el calendario; elige una fecha para congelar la foto.
        </span>
      )}
    </div>
  )
}

/**
 * Nivel y descendencia de cada línea, directo de la jerarquía.
 *
 * Existe porque el plegado inicial se decide **antes** de programar nada: es el valor con el que
 * nace el estado. Para saber qué es un bloque no hacen falta fechas, solo de quién cuelga cada
 * línea.
 */
function nivelesDelPlan(
  tasks: readonly PlanTask[],
): { id: string; level: number; hasChildren: boolean }[] {
  const porId = new Map(tasks.map((task) => [task.id, task]))
  const conHijas = new Set<string>()
  for (const task of tasks) {
    if (task.parentId !== undefined) conHijas.add(task.parentId)
  }

  return tasks.map((task) => {
    let level = 0
    // El plan puede llegar mal formado de la API; un ciclo en los padres no debe colgar la vista.
    const visto = new Set<string>([task.id])
    for (let padre = task.parentId; padre !== undefined; padre = porId.get(padre)?.parentId) {
      if (visto.has(padre)) break
      visto.add(padre)
      level += 1
    }
    return { id: task.id, level, hasChildren: conHijas.has(task.id) }
  })
}

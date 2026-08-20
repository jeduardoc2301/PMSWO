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
import {
  type DefinicionDeCalendario,
  calendarioDesde,
} from '@/lib/scheduling/project-calendar'
import { ordinalesNoDisponibles, type RangoDeAusencia } from '@/lib/scheduling/availability'
import { toDayNumber } from '@/lib/scheduling/date'
import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { classifySuperCritical } from '@/lib/scheduling/critical-path'
import { type GanttRow, collapseToLevel, ganttLayout } from '@/lib/scheduling/gantt'
import { rollUpProgress } from '@/lib/scheduling/progress'
import { programarConALAP } from '@/lib/scheduling/alap'
import { type EstadoAlCorte, varianceAtCutoff } from '@/lib/scheduling/schedule-variance'
import type { Dependency, PlanTask, TaskKind } from '@/lib/scheduling/types'
import { numerarPlan } from '@/lib/scheduling/wbs'
import type { DesvioDeLinea } from '@/lib/scheduling/baseline'

export interface WorkItemsOutlineProps {
  /** El plan del proyecto, como lo entrega GET /api/v1/projects/[id]/schedule. */
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  /** Primer día del plan. */
  readonly start: string
  /** El calendario del proyecto. Sin él, el atraso se mide contra un almanaque que no es el suyo. */
  readonly calendarDef?: DefinicionDeCalendario
  /** Cuándo no está disponible quien lleva cada línea (§12 caso 17). */
  readonly ausencias?: Readonly<Record<string, readonly RangoDeAusencia[]>>
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
  /** Editar una línea (hoja) con el diálogo del sistema. */
  readonly onEditItem?: (id: string) => void
  /** Dar de baja una línea (hoja). */
  readonly onDeleteItem?: (id: string) => void
  /** Dar de alta una línea que cuelgue de otra. Llega el id del padre, no el de la nueva. */
  readonly onAddChild?: (parentId: string) => void
  /**
   * El desvío de cada línea contra la línea base activa, o `undefined` si no hay ninguna elegida.
   *
   * Llega ya calculado y ya indexado: la rejilla dibuja mil filas y buscar en una lista por cada
   * una sería cuadrático. Quien monta decide qué foto está activa; aquí sólo se pinta.
   */
  readonly desvios?: ReadonlyMap<string, DesvioDeLinea>
  /** La barra de líneas base, si quien monta la ofrece. Va en la barra de herramientas. */
  readonly barraDeLineaBase?: React.ReactNode
  /**
   * Los ids que pasan el filtro, o `undefined` si no hay filtro puesto.
   *
   * Llega el conjunto ya resuelto y no el filtro: el filtro se evalúa **una vez** en el proyecto y
   * las seis vistas comparten el resultado, que es justo lo que hace que sea *el mismo* filtro.
   */
  readonly idsVisibles?: ReadonlySet<string>
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
    NO_INICIADO: { texto: 'No iniciado', clase: 'border-borde-fuerte bg-superficie-3/60 text-tinta-2' },
    EN_CURSO: { texto: 'En curso', clase: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
    CERRADO: { texto: 'Cerrado', clase: 'border-green-500/30 bg-green-500/10 text-green-400' },
  })

export function WorkItemsOutline({
  tasks: todasLasTareas,
  dependencies,
  start,
  calendarDef,
  ausencias,
  cutoff,
  cutoffFrozen,
  onCutoffChange,
  onProgressChange,
  onEditLinks,
  onEditItem,
  onDeleteItem,
  onAddChild,
  desvios,
  barraDeLineaBase,
  idsVisibles,
}: WorkItemsOutlineProps): React.JSX.Element {
  // ── El filtro se aplica al dibujar, nunca antes de programar ─────────────────────────────────
  // La primera versión recortaba las tareas y se las pasaba al motor. El motor recibía entonces los
  // 1 665 vínculos del plan entero contra ~900 tareas, y reventaba con una excepción que la
  // pantalla de error se tragaba: cambiar de vista con un filtro puesto dejaba el proyecto en
  // «Ha ocurrido un error inesperado».
  //
  // Aunque no reventara, estaría mal: las fechas de una línea salen de **toda** la red de
  // dependencias, y programar un trozo del plan daría fechas que no son las del plan. Filtrar es
  // una decisión de pantalla; programar no lo es.
  const tasks = todasLasTareas

  // Qué ids se dibujan, conservando los ancestros de lo que sobrevive: una actividad que pasa el
  // filtro colgando de una fase ausente dejaría de ser un esquema.
  const idsDibujables = useMemo(() => {
    if (!idsVisibles) return null
    const porId = new Map(todasLasTareas.map((t) => [t.id, t]))
    const conservar = new Set<string>()
    for (const tarea of todasLasTareas) {
      if (!idsVisibles.has(tarea.id)) continue
      conservar.add(tarea.id)
      const visto = new Set<string>([tarea.id])
      for (let padre = tarea.parentId; padre !== undefined; padre = porId.get(padre)?.parentId) {
        if (visto.has(padre)) break
        visto.add(padre)
        conservar.add(padre)
      }
    }
    return conservar
  }, [todasLasTareas, idsVisibles])

  const jerarquia = useMemo(() => nivelesDelPlan(tasks), [tasks])
  const edtPorId = useMemo(
    () => new Map(jerarquia.map((linea) => [linea.id, linea.wbs])),
    [jerarquia],
  )
  const [plegados, setPlegados] = useState<ReadonlySet<string>>(
    () => new Set(collapseToLevel(jerarquia, NIVEL_INICIAL)),
  )

  // El mismo reparto que el espacio de trabajo del plan: lo caro —programar, clasificar, acumular—
  // depende solo de los datos y corre una vez; el trazado depende del plegado y corre en cada gesto.
  const base = useMemo(() => {
    if (tasks.length === 0) return null
    const calendar = calendarDef ? calendarioDesde(calendarDef) : createWorkCalendar()
    const schedule = programarConALAP({
      tasks,
      dependencies,
      calendar,
      start,
      // Las ausencias de quien lleva cada línea (§12 caso 17). Sin esto el Gantt cuenta como
      // trabajados los días en que la persona asignada no está, y dibuja una barra más corta que la
      // realidad — que es la peor manera de equivocarse, porque parece exacta.
      noDisponible: ordinalesNoDisponibles(ausencias, calendar, toDayNumber),
    })
    const analysis = analyzeCriticalPath(schedule)
    return {
      calendar,
      schedule,
      classified: classifySuperCritical(analysis, tasks).tasks,
      rollup: rollUpProgress(tasks),
    }
  }, [tasks, dependencies, start, calendarDef])

  const layoutCompleto = useMemo(() => {
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

  // El recorte va aquí: las filas ya tienen sus fechas del plan completo, y quitar unas cuantas no
  // cambia las de las que quedan.
  const layout = useMemo(() => {
    if (layoutCompleto === null) return null
    if (idsDibujables === null) return layoutCompleto
    return { ...layoutCompleto, rows: layoutCompleto.rows.filter((row) => idsDibujables.has(row.id)) }
  }, [layoutCompleto, idsDibujables])

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
      <p className="rounded-lg border border-borde bg-superficie p-6 text-sm text-tinta-2">
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
            className="rounded border border-borde-fuerte px-2 py-1 text-xs text-tinta-2 hover:bg-superficie-3"
          >
            Expandir todo
          </button>
          <button
            type="button"
            onClick={() => setPlegados(new Set(collapseToLevel(jerarquia, 0)))}
            className="rounded border border-borde-fuerte px-2 py-1 text-xs text-tinta-2 hover:bg-superficie-3"
          >
            Contraer todo
          </button>
          {barraDeLineaBase}
        </div>
        <p className="text-xs text-tinta-3">{contador}</p>
      </div>

      <div className="max-w-full overflow-x-auto rounded-xl border border-borde bg-superficie">
        {/*
          `table-fixed` con anchos declarados, y no el reparto automático.
          Con el reparto por contenido, la columna del título se llevaba 1 294 px de 2 336 —los
          nombres del plan son largos— y las ocho columnas restantes quedaban fuera de la pantalla:
          se veía una sola columna y había que desplazar a ciegas. Con anchos fijos el título es lo
          único elástico, se recorta con puntos suspensivos y el nombre completo queda en el
          `title`. Medido en el navegador antes y después.
        */}
        <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
          <colgroup>
            {/* El título toma lo que sobre; las demás piden lo justo para su contenido. */}
            <col />
            <col style={{ width: 92 }} />
            <col style={{ width: 96 }} />
            <col style={{ width: 78 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 116 }} />
            <col style={{ width: 150 }} />
            {onEditItem || onDeleteItem ? <col style={{ width: 72 }} /> : null}
          </colgroup>
          <thead>
            <tr className="border-b border-borde text-left text-xs uppercase tracking-wide text-tinta-2">
              <th className="px-3 py-2 font-medium">Línea del plan</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium" title="Estado al corte del avance">Estado</th>
              <th className="px-3 py-2 text-right font-medium">Avance</th>
              <th className="px-3 py-2 text-right font-medium" title="Atraso (−) o ventaja (+) en días hábiles al corte">Atraso</th>
              <th className="px-3 py-2 text-center font-medium">Vínculos</th>
              <th className="px-3 py-2 font-medium">Responsable</th>
              <th className="px-3 py-2 font-medium">Fechas</th>
              {onEditItem || onDeleteItem || onAddChild ? (
                <th className="px-3 py-2 font-medium sr-only">Acciones</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {layout.rows.map((row) => (
              <Linea
                key={row.id}
                row={row}
                wbs={edtPorId.get(row.id) ?? ''}
                desvio={desvios?.get(row.id)}
                avance={avanceEfectivo(row, base.rollup)}
                owner={porId.get(row.id)?.owner}
                vinculos={vinculosDe.get(row.id)}
                onEditLinks={onEditLinks}
                onEditItem={onEditItem}
                onDeleteItem={onDeleteItem}
                onAddChild={onAddChild}
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
  // Se toma el avance ya calculado, no se rehace la división. Rehacerla obligaba a decidir qué
  // hacer con peso cero, y aquí se decía **cero** — justo el caso que `rollUpProgress` resuelve a
  // propósito: un bloque que sólo agrupa hitos no pesa nada, y su avance es el promedio simple de
  // las hijas. Un bloque de cinco hitos con tres cumplidos va por el 60 %, y esta pantalla decía
  // 0 %. La misma fórmula escrita dos veces siempre acaba dando dos números.
  return rollup.byId.get(row.id)?.progress ?? 0
}

function Linea({
  row,
  wbs,
  desvio,
  avance,
  owner,
  vinculos,
  cutoff,
  calendar,
  onToggle,
  onProgressChange,
  onEditLinks,
  onEditItem,
  onDeleteItem,
  onAddChild,
}: {
  row: GanttRow
  wbs: string
  desvio: DesvioDeLinea | undefined
  avance: number
  owner: string | undefined
  vinculos: { entran: number; salen: number } | undefined
  cutoff: string
  calendar: ReturnType<typeof createWorkCalendar>
  onToggle: (id: string) => void
  onProgressChange: (id: string, progress: number) => void
  onEditLinks?: (id: string) => void
  onEditItem?: (id: string) => void
  onDeleteItem?: (id: string) => void
  onAddChild?: (parentId: string) => void
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
    <tr className={`border-b border-borde last:border-b-0 ${row.isSummary ? 'bg-superficie' : ''}`}>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1" style={{ paddingLeft: row.level * 16 }}>
          {row.hasChildren ? (
            <button
              type="button"
              aria-label={row.isCollapsed ? `Abrir ${row.name}` : `Cerrar ${row.name}`}
              aria-expanded={!row.isCollapsed}
              onClick={() => onToggle(row.id)}
              className="w-4 shrink-0 text-tinta-2"
            >
              {row.isCollapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span className="w-4 shrink-0" aria-hidden="true" />
          )}
          <span
            data-testid={`edt-${row.id}`}
            title={`EDT ${wbs}`}
            className="shrink-0 tabular-nums text-[11px] text-tinta-3"
          >
            {wbs}
          </span>
          {row.isSuperCritical ? (
            // La otra vista ya tiene columna de prioridad; aquí basta la marca para no perderla.
            <span
              data-testid={`super-${row.id}`}
              title="En la ruta súper crítica: su atraso no se recupera con más gente"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500"
            />
          ) : null}
          <span
            className={`truncate ${row.isSummary ? 'font-medium text-tinta' : 'text-tinta-2'}`}
            title={row.name}
          >
            {row.name}
          </span>
        </div>
      </td>
      <td className="truncate px-3 py-1.5 text-tinta-2" title={tipoDeLinea(row)}>{tipoDeLinea(row)}</td>
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
            className="italic text-tinta-3"
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
      <td className="truncate px-3 py-1.5 text-tinta-2" title={owner ?? undefined}>{owner ? owner : '—'}</td>
      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-tinta-2">
        {/* Una sola celda: nueve columnas desbordaban la pestaña, y el rango se lee mejor junto. */}
        {row.isMilestone ? row.start : `${row.start} → ${row.finish}`}
        {/* Lo que prometía la línea base, debajo y en rojo (§4.6). Sólo cuando cambió: repetir la
            misma fecha en dos renglones no informa de nada y duplica el alto de toda la tabla. */}
        {desvio && desvio.estado === 'movida' && desvio.base ? (
          <span
            data-testid={`base-${row.id}`}
            title={`Línea base: ${desvio.base.start} → ${desvio.base.finish}`}
            className="block text-[11px] text-red-400/80"
          >
            {row.isMilestone ? desvio.base.start : `${desvio.base.start} → ${desvio.base.finish}`}
            <span className="ml-1.5 tabular-nums">
              ({desvio.driftFinish > 0 ? '+' : ''}
              {desvio.driftFinish} d)
            </span>
          </span>
        ) : null}
        {desvio?.estado === 'nueva' ? (
          <span
            data-testid={`base-${row.id}`}
            title="Esta línea no existía cuando se tomó la línea base"
            className="block text-[11px] text-tinta-3"
          >
            nueva desde la línea base
          </span>
        ) : null}
      </td>
      {onEditItem || onDeleteItem || onAddChild ? (
        <td className="whitespace-nowrap px-2 py-1.5">
          <span className="flex items-center gap-0.5">
            {/* El «+» sí sale en los resúmenes, al revés que ✎ y 🗑: un resumen no se edita ni se
                borra porque no es una tarea, pero es justo de donde cuelga el plan —una fase dentro
                de una fase, una actividad dentro de un bloque—, y es ahí donde este gesto se busca.
                En una hoja también vale: colgarle algo la vuelve el bloque que ya iba a ser. */}
            {onAddChild ? (
              <button
                type="button"
                aria-label={`Agregar una línea dentro de ${row.name}`}
                onClick={() => onAddChild(row.id)}
                className="rounded p-1 text-tinta-3 hover:bg-superficie-3 hover:text-tinta"
              >
                +
              </button>
            ) : null}
            {row.isSummary ? null : (
              <React.Fragment>
                {onEditItem ? (
                  <button
                    type="button"
                    aria-label={`Editar ${row.name}`}
                    onClick={() => onEditItem(row.id)}
                    className="rounded p-1 text-tinta-3 hover:bg-superficie-3 hover:text-tinta"
                  >
                    ✎
                  </button>
                ) : null}
                {onDeleteItem ? (
                  <button
                    type="button"
                    aria-label={`Eliminar ${row.name}`}
                    onClick={() => onDeleteItem(row.id)}
                    className="rounded p-1 text-tinta-3 hover:bg-rose-900/20 hover:text-rose-300"
                  >
                    🗑
                  </button>
                ) : null}
              </React.Fragment>
            )}
          </span>
        </td>
      ) : null}
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
    return <span className="text-xs text-tinta-3">{texto}</span>
  }
  return (
    <button
      type="button"
      aria-label={`Editar vínculos de ${row.name}`}
      onClick={() => onEditLinks(row.id)}
      className="rounded px-1.5 py-0.5 text-xs text-tinta-2 hover:bg-superficie-3 hover:text-tinta"
    >
      {texto}
    </button>
  )
}

/** Días de atraso o ventaja, con el signo y la décima del archivo. El cero se atenúa: no es noticia. */
function Delta({ id, valor }: { id: string; valor: number }) {
  if (valor === 0) {
    return (
      <span data-testid={`delta-${id}`} className="text-tinta-3">
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
        className="w-14 rounded border border-borde-fuerte bg-superficie px-1.5 py-0.5 text-right text-tinta focus:border-acento focus:outline-none"
      />
      <span className="text-tinta-3">%</span>
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
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-borde bg-superficie px-3 py-2 text-sm">
      <label htmlFor="corte-del-avance" className="text-tinta-2">
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
        className="rounded border border-borde-fuerte bg-superficie px-2 py-1 text-tinta focus:border-acento focus:outline-none"
      />
      {cutoffFrozen ? (
        <React.Fragment>
          <span className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-300">
            congelado
          </span>
          <button
            type="button"
            onClick={() => onCutoffChange(null)}
            className="rounded border border-borde-fuerte px-2 py-1 text-xs text-tinta-2 hover:bg-superficie-3"
          >
            Descongelar
          </button>
        </React.Fragment>
      ) : (
        <span className="text-xs text-tinta-3">
          El corte es hoy y se mueve con el calendario; elige una fecha para congelar la foto.
        </span>
      )}
    </div>
  )
}

/**
 * Nivel, EDT y descendencia de cada línea, directo de la jerarquía.
 *
 * Existe porque el plegado inicial se decide **antes** de programar nada: es el valor con el que
 * nace el estado. Para saber qué es un bloque no hacen falta fechas, solo de quién cuelga cada
 * línea.
 *
 * El nivel y el EDT salen del mismo recorrido —`numerarPlan`— y no de dos cálculos parecidos: son
 * la misma pregunta, «¿dónde está esta línea en el árbol?», y responderla dos veces es la forma
 * segura de que un día se contesten distinto.
 */
function nivelesDelPlan(
  tasks: readonly PlanTask[],
): { id: string; level: number; wbs: string; hasChildren: boolean }[] {
  const conHijas = new Set<string>()
  for (const task of tasks) {
    if (task.parentId !== undefined) conHijas.add(task.parentId)
  }

  return numerarPlan(tasks).map((numero) => ({
    id: numero.id,
    level: numero.level,
    wbs: numero.wbs,
    hasChildren: conHijas.has(numero.id),
  }))
}

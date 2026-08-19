'use client'

/**
 * La vista Calendario del proyecto (§7 del spec).
 *
 * Es de presentación pura: recibe la rejilla ya dispuesta por `calendarLayout` y la convierte en
 * píxeles. El empaquetado de barras en carriles —lo único difícil de esta vista— vive en el motor,
 * donde se prueba sin navegador; aquí solo se decide dónde va cada cosa en la pantalla.
 *
 * ## Dos decisiones que el spec pide y conviene tener escritas
 *
 * **Los hitos se dibujan como rombo y nunca se esconden.** Un hito marca un compromiso, no trabajo.
 * Una tarea escondida tras un «N tareas más» se despliega y ya; un hito de cierre de etapa
 * escondido es justo lo que alguien vino a buscar y no encontró. El motor los pone primero en el
 * reparto y los exime del recorte.
 *
 * **Los días no laborables se sombrean con el calendario del proyecto**, no con una regla de fin de
 * semana escrita aquí. Un festivo de Colombia y un sábado se ven igual porque para el plan valen lo
 * mismo: días en los que nadie avanza.
 */

import React, { useMemo, useState } from 'react'

import { type WorkCalendar } from '@/lib/scheduling/calendar'
import {
  carrilesDibujados,
  type CalendarTask,
  type CalendarWeek,
  calendarLayout,
  hiddenTasksOfDay,
} from '@/lib/scheduling/calendar-layout'

export interface CalendarViewProps {
  readonly tasks: readonly CalendarTask[]
  readonly calendar: WorkCalendar
  /** Mes que se está mirando, en formato `AAAA-MM`. */
  readonly month: string
  readonly onMonthChange: (month: string) => void
  /** Hoy, en fecha civil, para marcar la casilla. Llega de fuera para que la vista sea predecible. */
  readonly today: string
  readonly onSelectTask?: (taskId: string) => void
  /**
   * Arrastrar una barra a otro día (§7.5). Recibe la línea y el día en que se soltó.
   *
   * Sin esta prop las barras no son arrastrables: una barra que se puede coger y no lleva a ningún
   * sitio es peor que una que no se mueve.
   */
  readonly onMoverLinea?: (taskId: string, nuevoInicio: string) => void
}

const NOMBRES_DE_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

/** Con la semana abriendo en lunes, que es como se lee un plan de trabajo. */
const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SÁ', 'DO'] as const

/** Cuántas barras caben en una casilla de mes sin volverla ilegible. */
const CARRILES_VISIBLES = 3

const ALTO_CARRIL = 22

/** Alto que ocupa el número del día antes de que empiecen las barras. */
const CABECERA_DIA = 26

export function CalendarView({
  tasks,
  calendar,
  month,
  onMonthChange,
  today,
  onSelectTask,
  onMoverLinea,
}: CalendarViewProps) {
  const [diaDesplegado, setDiaDesplegado] = useState<string | null>(null)

  const [anio, mes] = month.split('-').map(Number)
  const primerDia = `${month}-01`
  const ultimoDia = `${month}-${String(diasDelMes(anio, mes)).padStart(2, '0')}`

  const layout = useMemo(
    () =>
      calendarLayout({
        tasks,
        from: primerDia,
        to: ultimoDia,
        calendar,
        maxLanes: CARRILES_VISIBLES,
        month: mes,
        year: anio,
      }),
    [tasks, primerDia, ultimoDia, calendar, mes, anio],
  )

  const ocultas = useMemo(
    () => (diaDesplegado === null ? [] : hiddenTasksOfDay(tasks, diaDesplegado, CARRILES_VISIBLES)),
    [tasks, diaDesplegado],
  )

  const irA = (delta: number) => {
    const total = (anio * 12 + (mes - 1)) + delta
    const nuevoAnio = Math.floor(total / 12)
    const nuevoMes = (total % 12) + 1
    onMonthChange(`${nuevoAnio}-${String(nuevoMes).padStart(2, '0')}`)
    setDiaDesplegado(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Mes anterior"
            onClick={() => irA(-1)}
            className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            ‹
          </button>
          <span className="min-w-[168px] text-center text-sm font-medium text-zinc-100">
            {NOMBRES_DE_MES[mes - 1]} {anio}
          </span>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => irA(1)}
            className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              onMonthChange(today.slice(0, 7))
              setDiaDesplegado(null)
            }}
            className="ml-1 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Hoy
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          {layout.tasksInRange} de {tasks.length} {tasks.length === 1 ? 'línea' : 'líneas'} caen en
          este mes
          {layout.tasksInRange > layout.placedTasks ? (
            <>
              {' · '}
              {layout.placedTasks} {layout.placedTasks === 1 ? 'dibujada' : 'dibujadas'}, el resto
              tras «N líneas más»
            </>
          ) : null}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-[#18181b]">
        <div className="grid grid-cols-7 border-b border-zinc-800">
          {DIAS.map((dia) => (
            <div key={dia} className="px-2 py-2 text-center text-xs uppercase tracking-wide text-zinc-500">
              {dia}
            </div>
          ))}
        </div>

        {layout.weeks.map((semana) => (
          <Semana
            key={semana.start}
            semana={semana}
            today={today}
            onSelectTask={onSelectTask}
            onExpandirDia={setDiaDesplegado}
            onMoverLinea={onMoverLinea}
          />
        ))}
      </div>

      {diaDesplegado !== null ? (
        <div className="rounded-xl border border-zinc-800 bg-[#18181b] p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-100">
              {ocultas.length} {ocultas.length === 1 ? 'línea más' : 'líneas más'} el {diaDesplegado}
            </p>
            <button
              type="button"
              aria-label="Cerrar el desglose del día"
              onClick={() => setDiaDesplegado(null)}
              className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              ✕
            </button>
          </div>
          {ocultas.length === 0 ? (
            <p className="text-sm text-zinc-500">Ese día no esconde ninguna línea.</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {ocultas.map((tarea) => (
                <li key={tarea.id}>
                  <button
                    type="button"
                    onClick={() => onSelectTask?.(tarea.id)}
                    className="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left hover:bg-zinc-800"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{tarea.name}</span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {tarea.start} → {tarea.finish}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Sobre qué día de la fila cae una coordenada horizontal.
 *
 * Hace falta porque el soltar se atiende en la **fila** y no en la casilla del día. Y se atiende
 * ahí porque las barras viven en una capa absoluta que es HERMANA de las casillas, no descendiente:
 * un `dragover` que caiga sobre una barra sube por la capa y llega a la fila sin haber pasado
 * nunca por ninguna casilla. Con los manejadores en la casilla, ese `preventDefault` no se
 * llamaba, y sin él el navegador rechaza el soltar.
 *
 * No era un caso raro: medido sobre el plan de referencia, el 24 % del área de la rejilla y hasta
 * el **56 %** del alto útil de un día cargado eran zona muerta. Y la prueba que lo daba por bueno
 * no lo veía, porque `fireEvent.dragOver` despacha el evento sobre el elemento que le nombras y
 * se salta el reparto que en un navegador real decide quién lo recibe.
 */
function diaSoltado<T extends { readonly date: string }>(
  e: React.DragEvent,
  dias: readonly T[],
): T | undefined {
  // Camino corriente: se soltó sobre la casilla de un día, y ella misma dice cuál es. Se prefiere a
  // la geometría porque es exacto —no depende del ancho ni del redondeo— y porque es el caso que
  // ocurre casi siempre.
  const casilla = (e.target as HTMLElement | null)?.closest?.('[data-dia]')
  const fecha = casilla?.getAttribute('data-dia')
  if (fecha) return dias.find((d) => d.date === fecha)

  // Camino de rescate: se soltó sobre una barra, que vive en otra capa y no tiene casilla encima.
  // Aquí la columna sale de dónde cayó el puntero dentro de la fila.
  const marco = e.currentTarget.getBoundingClientRect()
  if (marco.width <= 0) return undefined
  // Sin coordenada no hay columna que deducir. Devolver `undefined` deja el soltar sin efecto, que
  // es lo correcto: mover la línea a un día adivinado sería peor que no moverla.
  if (!Number.isFinite(e.clientX)) return undefined
  const columna = Math.floor(((e.clientX - marco.left) / marco.width) * dias.length)
  // Soltar justo en el borde derecho da exactamente `dias.length`, que no es una columna.
  return dias[Math.min(dias.length - 1, Math.max(0, columna))]
}

function Semana({
  semana,
  today,
  onSelectTask,
  onExpandirDia,
  onMoverLinea,
}: {
  semana: CalendarWeek
  today: string
  onSelectTask?: (taskId: string) => void
  onExpandirDia: (dia: string) => void
  onMoverLinea?: (taskId: string, nuevoInicio: string) => void
}) {
  // El alto lo fija el carril más alto que **se dibujó**, no el tope de carriles visibles.
  //
  // Decía `min(laneCount, CARRILES_VISIBLES)`, y era falso justo donde importa: un hito está exento
  // del recorte —es un compromiso, no trabajo, y esconderlo tras un «N líneas más» es esconder lo que
  // alguien vino a buscar—, así que puede tocarle el carril 5 en una semana donde sólo se reservó
  // alto para 3. Medido en septiembre del plan de referencia: una barra encimada sobre otra 13 px y
  // dos sobre el rótulo de desborde 17 px. La fila tiene que medir lo que de verdad lleva dentro.
  const carriles = carrilesDibujados(semana)
  const altoDeBarras = carriles * ALTO_CARRIL

  return (
    // La fila es el marco de referencia de las barras: una barra multi-día no cabe dentro de una
    // casilla, así que va en una capa absoluta sobre la fila entera. Dentro de la casilla queda un
    // hueco de la misma altura, y así el rótulo de «N líneas más» fluye debajo sin encimarse.
    <div
      className="relative grid grid-cols-7 border-b border-zinc-800 last:border-b-0"
      {...(onMoverLinea
        ? {
            onDragOver: (e: React.DragEvent) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            },
            onDrop: (e: React.DragEvent) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/plain')
              if (!id) return
              const dia = diaSoltado(e, semana.days)
              // Un día no laborable no admite el arranque de una línea: el motor lo empujaría al
              // siguiente hábil y quien la soltó vería la barra en otro sitio del que apuntó.
              if (dia && dia.isWorking) onMoverLinea(id, dia.date)
            },
          }
        : {})}
    >
      {semana.days.map((dia, columna) => (
        <div
          key={dia.date}
          data-testid={`dia-${dia.date}`}
          data-dia={dia.date}
          className={`min-h-[104px] border-r border-zinc-800 px-1.5 pb-1.5 last:border-r-0 ${
            dia.isWorking ? '' : 'bg-[#111113]'
          } ${dia.isOutsideMonth ? 'opacity-40' : ''}`}
        >
          <div
            className="flex items-baseline justify-between"
            style={{ height: CABECERA_DIA, paddingTop: 6 }}
          >
            <span
              className={`text-xs ${
                dia.date === today
                  ? 'rounded-full bg-[#6366f1] px-1.5 py-0.5 font-semibold text-zinc-100'
                  : 'text-zinc-500'
              }`}
            >
              {Number(dia.date.slice(8, 10))}
            </span>
            {semana.deadlinesByColumn[columna].length > 0 ? (
              <span
                data-testid={`vence-${dia.date}`}
                title={`${semana.deadlinesByColumn[columna].length} línea(s) vencen este día`}
                className="text-xs text-amber-400"
              >
                ⚑
              </span>
            ) : null}
          </div>

          {/* El hueco que ocupan las barras de la capa de arriba. */}
          <div style={{ height: altoDeBarras }} aria-hidden />

          {semana.overflowByColumn[columna] > 0 ? (
            <button
              type="button"
              onClick={() => onExpandirDia(dia.date)}
              className="block w-full truncate rounded px-1 text-left text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              {semana.overflowByColumn[columna]}{' '}
              {semana.overflowByColumn[columna] === 1 ? 'línea más' : 'líneas más'}
            </button>
          ) : null}
        </div>
      ))}

      {/* Las barras, sobre la fila entera. */}
      <div className="pointer-events-none absolute inset-0">
        {semana.segments.map((trozo) => (
          <button
            key={`${trozo.taskId}-${trozo.startColumn}`}
            type="button"
            data-testid={`barra-${trozo.taskId}-${trozo.startColumn}`}
            data-tarea={trozo.taskId}
            draggable={onMoverLinea !== undefined}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', trozo.taskId)
              e.dataTransfer.effectAllowed = 'move'
            }}
            data-hito={trozo.isMilestone ? 'sí' : 'no'}
            title={trozo.name}
            onClick={() => onSelectTask?.(trozo.taskId)}
            className={`pointer-events-auto absolute truncate px-1.5 text-left text-[11px] ${
              trozo.isMilestone
                ? 'rounded-sm bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/40'
                : 'rounded bg-[#6366f1]/25 text-indigo-100 ring-1 ring-[#6366f1]/40'
            }`}
            style={{
              left: `calc(${(trozo.startColumn / 7) * 100}% + 4px)`,
              width: `calc(${(trozo.span / 7) * 100}% - 8px)`,
              top: CABECERA_DIA + trozo.lane * ALTO_CARRIL,
              height: ALTO_CARRIL - 4,
              lineHeight: `${ALTO_CARRIL - 4}px`,
            }}
          >
            {trozo.continuesFromPrevious ? '◀ ' : ''}
            {trozo.isMilestone ? '◆ ' : ''}
            {trozo.name}
            {trozo.continuesIntoNext ? ' ▶' : ''}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Cuántos días trae un mes, con el año bisiesto bien resuelto. */
function diasDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

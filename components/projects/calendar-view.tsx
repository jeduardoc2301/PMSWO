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
  type DiaDeAgenda,
  type ModoDeCalendario,
  agendaDelRango,
  anclaTrasAvanzar,
  fechasDelRango,
  rangoSeleccionado,
  calendarLayout,
  rangoDelModo,
  hiddenTasksOfDay,
} from '@/lib/scheduling/calendar-layout'

export interface CalendarViewProps {
  readonly tasks: readonly CalendarTask[]
  readonly calendar: WorkCalendar
  /**
   * El día alrededor del cual se mira, en `AAAA-MM-DD`.
   *
   * Era el mes en `AAAA-MM`. Pasó a día completo al llegar la vista semanal: con sólo el mes no se
   * puede decir qué semana, y con un ancla de día los tres modos comparten referencia — cambiar de
   * semana a mes deja el mes de esa semana, que es donde estaba mirando quien cambió.
   */
  readonly ancla: string
  readonly onAnclaChange: (ancla: string) => void
  /** Rejilla del mes, rejilla de una semana o lista cronológica (§7.2). */
  readonly modo: ModoDeCalendario
  readonly onModoChange: (modo: ModoDeCalendario) => void
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
  /**
   * Crear una línea arrastrando un rango de días (§7.2).
   *
   * Recibe el primer y el último día **hábil** del rango, no las casillas que se pintaron: arrastrar
   * de viernes a lunes selecciona cuatro y son dos días de trabajo. Sin esta prop no hay gesto, que
   * es lo correcto donde no se puede crear — pintar un rango que no lleva a nada es peor que no
   * poder pintarlo.
   */
  readonly onCrearEnRango?: (start: string, finish: string) => void
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

const MODOS: readonly { readonly value: ModoDeCalendario; readonly label: string }[] = [
  { value: 'MES', label: 'Mes' },
  { value: 'SEMANA', label: 'Semana' },
  { value: 'AGENDA', label: 'Agenda' },
]

/** Alto que ocupa el número del día antes de que empiecen las barras. */
const CABECERA_DIA = 26

export function CalendarView({
  tasks,
  calendar,
  ancla,
  onAnclaChange,
  modo,
  onModoChange,
  today,
  onSelectTask,
  onMoverLinea,
  onCrearEnRango,
}: CalendarViewProps) {
  const [diaDesplegado, setDiaDesplegado] = useState<string | null>(null)
  /** El gesto en curso: dónde empezó y dónde va el ratón ahora. */
  const [pintando, setPintando] = useState<{ desde: string; hasta: string } | null>(null)

  const [anio, mes] = ancla.split('-').map(Number)
  const { from: primerDia, to: ultimoDia } = rangoDelModo(modo, ancla as never)

  /**
   * Por semanas caben más carriles, y no es un ajuste estético.
   *
   * La rejilla del mes reparte su alto entre cinco o seis filas; la de una semana tiene **una**, así
   * que con el mismo tope de tres carriles la vista semanal desperdiciaría casi todo su alto
   * mandando al «N tareas más» cosas que caben de sobra. Y el sentido de acercarse a una semana es
   * justamente ver lo que el mes esconde.
   */
  const carriles = modo === 'SEMANA' ? CARRILES_VISIBLES * 4 : CARRILES_VISIBLES

  const layout = useMemo(
    () =>
      calendarLayout({
        tasks,
        from: primerDia,
        to: ultimoDia,
        calendar,
        maxLanes: carriles,
        // Atenuar los días de fuera sólo tiene sentido en el mes: en la semana no hay «fuera», y
        // pasarle el mes haría que una semana a caballo entre dos saliera medio apagada.
        ...(modo === 'MES' ? { month: mes, year: anio } : {}),
      }),
    [tasks, primerDia, ultimoDia, calendar, carriles, modo, mes, anio],
  )

  const ocultas = useMemo(
    () => (diaDesplegado === null ? [] : hiddenTasksOfDay(tasks, diaDesplegado, carriles)),
    [tasks, diaDesplegado, carriles],
  )

  const agenda = useMemo(
    () => (modo === 'AGENDA' ? agendaDelRango(tasks, primerDia, ultimoDia, calendar) : []),
    [modo, tasks, primerDia, ultimoDia, calendar],
  )

  /**
   * El gesto de pintar un rango.
   *
   * Se cierra en `SUELTA` y también si el ratón sale de la rejilla —ver el `onMouseLeave` de abajo—
   * porque un rango a medio pintar que se queda encendido al soltar fuera es un estado del que no se
   * sale sin recargar.
   */
  const seleccionar = (dia: string | null, gesto: 'EMPIEZA' | 'EXTIENDE' | 'SUELTA') => {
    if (dia === null || gesto === 'EMPIEZA') {
      setPintando(dia === null ? null : { desde: dia, hasta: dia })
      return
    }
    if (pintando === null) return
    if (gesto === 'EXTIENDE') {
      setPintando({ ...pintando, hasta: dia })
      return
    }

    const { from, to } = rangoSeleccionado(pintando.desde as never, dia as never)
    setPintando(null)
    const fechas = fechasDelRango(from, to, calendar)
    // Sin días hábiles no se crea nada y no se avisa: quien pinta un fin de semana entero ve que no
    // pasa nada, que es la respuesta correcta a un gesto sin sentido — un aviso ahí sería regañar.
    if (fechas) onCrearEnRango?.(fechas.start, fechas.finish)
  }

  const seleccion = pintando ? rangoSeleccionado(pintando.desde as never, pintando.hasta as never) : null

  const irA = (delta: number) => {
    onAnclaChange(anclaTrasAvanzar(modo, ancla as never, delta))
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
            className="rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta-2 hover:bg-superficie-3"
          >
            ‹
          </button>
          <span
            data-testid="periodo-del-calendario"
            className="min-w-[210px] text-center text-sm font-medium text-tinta"
          >
            {modo === 'SEMANA'
              ? `${primerDia} → ${ultimoDia}`
              : `${NOMBRES_DE_MES[mes - 1]} ${anio}`}
          </span>
          <button
            type="button"
            aria-label="Mes siguiente"
            onClick={() => irA(1)}
            className="rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta-2 hover:bg-superficie-3"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              onAnclaChange(today)
              setDiaDesplegado(null)
            }}
            className="ml-1 rounded-lg border border-borde px-3 py-1.5 text-sm text-tinta-2 hover:bg-superficie-3"
          >
            Hoy
          </button>

          {/* Los tres modos del §7.2. Van aquí, junto a las flechas, porque cambian lo mismo: qué
              trozo del plan se está mirando. */}
          <div role="group" aria-label="Modo del calendario" className="ml-2 flex items-center gap-1">
            {MODOS.map((m) => (
              <button
                key={m.value}
                type="button"
                data-testid={`modo-${m.value}`}
                aria-pressed={modo === m.value}
                onClick={() => {
                  onModoChange(m.value)
                  setDiaDesplegado(null)
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  modo === m.value
                    ? 'border-indigo-600 bg-indigo-600/15 text-indigo-200'
                    : 'border-borde text-tinta-2 hover:bg-superficie-3'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-tinta-3">
          {layout.tasksInRange} de {tasks.length} {tasks.length === 1 ? 'línea' : 'líneas'} caen en
          {modo === 'SEMANA' ? ' esta semana' : ' este mes'}
          {layout.tasksInRange > layout.placedTasks ? (
            <>
              {' · '}
              {layout.placedTasks} {layout.placedTasks === 1 ? 'dibujada' : 'dibujadas'}, el resto
              tras «N líneas más»
            </>
          ) : null}
        </p>
      </div>

      {modo === 'AGENDA' ? (
        <Agenda dias={agenda} today={today} onSelectTask={onSelectTask} />
      ) : (
        <div
          className="overflow-hidden rounded-xl border border-borde bg-superficie"
          onMouseLeave={() => setPintando(null)}
        >
          <div className="grid grid-cols-7 border-b border-borde">
            {DIAS.map((dia) => (
              <div key={dia} className="px-2 py-2 text-center text-xs uppercase tracking-wide text-tinta-3">
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
              seleccion={seleccion}
              {...(onCrearEnRango ? { onSeleccionar: seleccionar } : {})}
            />
          ))}
        </div>
      )}

      {diaDesplegado !== null ? (
        <div className="rounded-xl border border-borde bg-superficie p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-tinta">
              {ocultas.length} {ocultas.length === 1 ? 'línea más' : 'líneas más'} el {diaDesplegado}
            </p>
            <button
              type="button"
              aria-label="Cerrar el desglose del día"
              onClick={() => setDiaDesplegado(null)}
              className="rounded px-2 py-1 text-tinta-2 hover:bg-superficie-3 hover:text-tinta"
            >
              ✕
            </button>
          </div>
          {ocultas.length === 0 ? (
            <p className="text-sm text-tinta-3">Ese día no esconde ninguna línea.</p>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {ocultas.map((tarea) => (
                <li key={tarea.id}>
                  <button
                    type="button"
                    onClick={() => onSelectTask?.(tarea.id)}
                    className="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left hover:bg-superficie-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-tinta">{tarea.name}</span>
                    <span className="shrink-0 text-xs text-tinta-3">
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
  seleccion,
  onSeleccionar,
}: {
  semana: CalendarWeek
  today: string
  onSelectTask?: (taskId: string) => void
  onExpandirDia: (dia: string) => void
  onMoverLinea?: (taskId: string, nuevoInicio: string) => void
  /** El rango que se está pintando ahora mismo, para resaltarlo mientras se arrastra. */
  seleccion: { readonly from: string; readonly to: string } | null
  /** `null` cierra la selección; una fecha la empieza o la extiende. */
  onSeleccionar?: (dia: string | null, gesto: 'EMPIEZA' | 'EXTIENDE' | 'SUELTA') => void
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
      className="relative grid grid-cols-7 border-b border-borde last:border-b-0"
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
          {...(onSeleccionar
            ? {
                // Se arranca en `mousedown` y no en `click` porque un rango es un gesto continuo:
                // esperar al clic obligaría a dos pulsaciones y a inventar cuál es «la primera».
                onMouseDown: (e: React.MouseEvent) => {
                  // Si el gesto empieza sobre una barra, es un arrastre de barra, no una selección.
                  // Sin esto, coger una tarea para moverla pintaba además un rango detrás.
                  if ((e.target as HTMLElement).closest('[draggable="true"]')) return
                  if (e.button !== 0) return
                  onSeleccionar(dia.date, 'EMPIEZA')
                },
                onMouseEnter: () => onSeleccionar(dia.date, 'EXTIENDE'),
                onMouseUp: () => onSeleccionar(dia.date, 'SUELTA'),
              }
            : {})}
          className={`min-h-[104px] border-r border-borde px-1.5 pb-1.5 last:border-r-0 ${
            dia.isWorking ? '' : 'bg-hueco'
          } ${dia.isOutsideMonth ? 'opacity-40' : ''} ${
            seleccion && seleccion.from <= dia.date && dia.date <= seleccion.to
              ? 'bg-indigo-600/15 ring-1 ring-inset ring-indigo-600/60'
              : ''
          }`}
        >
          <div
            className="flex items-baseline justify-between"
            style={{ height: CABECERA_DIA, paddingTop: 6 }}
          >
            <span
              className={`text-xs ${
                dia.date === today
                  ? 'rounded-full bg-acento px-1.5 py-0.5 font-semibold text-tinta'
                  : 'text-tinta-3'
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
              className="block w-full truncate rounded px-1 text-left text-[11px] text-tinta-2 hover:bg-superficie-3 hover:text-tinta"
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
                : 'rounded bg-acento/25 text-indigo-100 ring-1 ring-[#6366f1]/40'
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

/**
 * La agenda: qué pasa cada día, en orden (§7.2).
 *
 * No pasa por la rejilla. Una agenda es una lista, y meterla por el mismo camino la obligaría a
 * inventarse carriles que nadie va a ver.
 *
 * Lo que la hace útil sobre un plan de 1368 líneas es la separación entre lo que **arranca**, lo que
 * **vence** y lo que sólo sigue en curso. Un renglón que dijera «el martes tocan 63 tareas» no dice
 * nada: en un plan real casi todos los días tocan decenas de tareas porque duran semanas. Lo
 * accionable es qué empieza y qué termina; lo demás va contado, no listado.
 */
function Agenda({
  dias,
  today,
  onSelectTask,
}: {
  dias: readonly DiaDeAgenda[]
  today: string
  onSelectTask?: (taskId: string) => void
}) {
  if (dias.length === 0) {
    return (
      <p data-testid="agenda-vacia" className="rounded-xl border border-borde bg-superficie p-6 text-center text-sm text-tinta-3">
        En este periodo no empieza ni termina ninguna línea.
      </p>
    )
  }

  return (
    <ol data-testid="agenda" className="flex flex-col gap-2">
      {dias.map((dia) => (
        <li
          key={dia.date}
          data-dia-de-agenda={dia.date}
          className={`rounded-xl border p-3 ${
            dia.date === today
              ? 'border-indigo-700 bg-indigo-950/20'
              : dia.isWorking
                ? 'border-borde bg-superficie'
                : 'border-borde bg-fondo/40'
          }`}
        >
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-sm font-medium text-tinta">{dia.date}</span>
            {dia.date === today ? (
              <span className="rounded bg-indigo-600/20 px-1.5 text-[10px] uppercase tracking-wide text-indigo-200">
                hoy
              </span>
            ) : null}
            {!dia.isWorking ? (
              <span className="text-[11px] text-tinta-3">no laborable</span>
            ) : null}
            {dia.enCurso.length > 0 ? (
              <span data-testid={`en-curso-${dia.date}`} className="ml-auto text-[11px] text-tinta-3">
                {dia.enCurso.length} en curso
              </span>
            ) : null}
          </div>

          <GrupoDeAgenda titulo="Empieza" tareas={dia.empiezan} onSelectTask={onSelectTask} />
          <GrupoDeAgenda titulo="Termina" tareas={dia.terminan} onSelectTask={onSelectTask} />
        </li>
      ))}
    </ol>
  )
}

/** Un grupo de la agenda. No se dibuja cuando está vacío: un rótulo sin nada debajo es ruido. */
function GrupoDeAgenda({
  titulo,
  tareas,
  onSelectTask,
}: {
  titulo: string
  tareas: readonly CalendarTask[]
  onSelectTask?: (taskId: string) => void
}) {
  if (tareas.length === 0) return null
  return (
    <div className="mt-1">
      <p className="text-[11px] uppercase tracking-wide text-tinta-3">{titulo}</p>
      <ul className="mt-0.5 flex flex-col gap-0.5">
        {tareas.map((t) => (
          <li key={`${titulo}-${t.id}`}>
            <button
              type="button"
              data-agenda-tarea={t.id}
              title={t.name}
              onClick={() => onSelectTask?.(t.id)}
              className="flex w-full items-center gap-1.5 truncate rounded px-1 py-0.5 text-left text-sm text-tinta hover:bg-superficie-3"
            >
              {t.isMilestone ? <span className="shrink-0 text-amber-300">◆</span> : null}
              <span className="truncate">{t.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

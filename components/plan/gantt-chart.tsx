/**
 * El Gantt.
 *
 * Es de presentación pura: recibe el trazado ya calculado y lo convierte en píxeles. No programa el
 * plan, no calcula holgura y no decide qué es crítico. Su única aritmética es multiplicar por el
 * ancho de un día — todo lo demás viene de `ganttLayout`, que es donde están las reglas y donde se
 * prueban.
 *
 * La división importa por una razón concreta: la línea de tiempo que ya existía en el sistema
 * inventaba las fechas que le faltaban, y las inventaba en el componente. Una vista que puede
 * inventar datos termina inventándolos.
 */

// `React` en el ámbito porque este archivo usa `React.Fragment` de forma explícita.
import React, { useRef, useState } from 'react'

import {
  type ColumnaDelGantt,
  GANTT_POR_OMISION,
  anchoDe,
  columnasVisibles,
} from '@/lib/plan/gantt-columns'
import { CeldaEditable, validarAvance, validarNombre } from '@/components/plan/celda-editable'
import { accionDeTeclado } from '@/lib/plan/atajos'
import { type GanttLayout, type GanttLink, type GanttRow, linkLabel } from '@/lib/scheduling/gantt'

export interface GanttChartProps {
  readonly layout: GanttLayout
  /** Cuántos píxeles mide un día hábil. Es la única unidad que este componente aporta. */
  readonly dayWidth?: number
  /** Alto de cada fila, en píxeles. */
  readonly rowHeight?: number
  /**
   * Las columnas de la rejilla, ya resueltas contra el catálogo y en orden.
   *
   * Llegan resueltas y no como identificadores: decidir cuáles se ven, con qué orden y qué ancho es
   * de `lib/plan/gantt-columns`, que se prueba sin navegador.
   */
  readonly columnas?: readonly ColumnaDelGantt[]
  /** Anchos tocados a mano, por identificador. */
  readonly anchos?: Readonly<Record<string, number>>
  /**
   * Dónde cae el divisor entre la rejilla y la línea de tiempo (§4.1). Si no llega, la rejilla
   * ocupa lo que ocupen sus columnas, que es como se comportaba antes de que el divisor existiera.
   */
  readonly divisor?: number
  /** Al soltar el divisor. Llega la posición nueva en píxeles. */
  readonly onDivisorCambiado?: (posicion: number) => void
  /** Al soltar el divisor de una columna. Sin esto, las columnas no se pueden redimensionar. */
  readonly onAnchoCambiado?: (id: string, ancho: number) => void
  readonly selectedId?: string | null
  readonly onSelect?: (id: string) => void
  /**
   * Menú contextual de una fila (§4.5). Recibe la línea y dónde se pulsó.
   *
   * Opcional: sin él la fila conserva el menú del navegador, que es lo correcto cuando quien monta
   * el diagrama no tiene con qué atender las acciones.
   */
  readonly onMenuDeFila?: (id: string, x: number, y: number) => void
  /** Conmutador «tareas atrasadas» del §4.6: resalta las vencidas y sin terminar. */
  readonly resaltarAtrasadas?: boolean
  /** Conmutador 3 del §4.6: barras críticas en rojo. Por omisión sí. */
  readonly rutaCritica?: boolean
  /** Conmutador 3 del §4.6: la sombra de holgura a la derecha de cada barra. Por omisión no. */
  readonly reserva?: boolean
  /**
   * Escribir una celda editada en el grid (§4.2).
   *
   * Solo llega con un valor válido y distinto del que había: la celda ya descartó lo demás, así que
   * quien recibe esto puede escribir sin volver a comprobar nada.
   */
  readonly onEditarCelda?: (id: string, campo: 'name' | 'progress', valor: string) => void
  /**
   * Atajos de teclado sobre una fila (§4.4): sangrar, anular sangría, abrir el detalle.
   *
   * `SOLTAR_FILA` no llega aquí: lo atiende la propia fila quitándose el foco, que es lo único que
   * devuelve el `Tab` al navegador.
   */
  readonly onAtajo?: (id: string, accion: 'SANGRAR' | 'ANULAR_SANGRIA' | 'ABRIR_DETALLE') => void
  /**
   * Arrastre entre conectores para crear una dependencia (§4.4).
   *
   * Llegan los dos gestos por separado —agarrar en una barra, soltar en otra— porque quien monta el
   * diagrama es quien sabe si el par forma un vínculo válido y quien tiene que confirmarlo antes de
   * escribir.
   */
  readonly onConectar?: (id: string, extremo: 'INICIO' | 'FIN', gesto: 'AGARRAR' | 'SOLTAR') => void
  /**
   * Cambiar la duración arrastrando el borde derecho (§4.4).
   *
   * Llega la duración nueva en días hábiles, no el desplazamiento: quien recibe esto no tiene por
   * qué recordar cuánto duraba antes.
   */
  readonly onCambiarDuracion?: (id: string, dias: number) => void
  /**
   * Selección múltiple (§4.6, conmutador 1). Cuando llega, cada fila estrena su casilla.
   *
   * Sin ella la columna no se dibuja: una casilla por fila en un plan de mil trescientas líneas es
   * ruido permanente para una operación que se hace de vez en cuando.
   */
  readonly marcadas?: ReadonlySet<string>
  readonly onMarcar?: (id: string, conMayusculas: boolean) => void
  /** Abrir o cerrar un resumen. Sin esto, los triángulos no se dibujan. */
  /**
   * Abrir o cerrar un resumen. Recibe además **cómo estaba**, y no es redundante.
   *
   * Quién manda sobre el plegado son tres cosas —el nivel de detalle, lo abierto a mano y lo cerrado
   * a mano— y quien escucha no puede deducir el estado visible de ninguna de ellas por separado. La
   * fila sí lo sabe: es lo que dibuja. Así que lo dice ella.
   */
  readonly onToggle?: (id: string, estabaPlegada: boolean) => void
  /**
   * Soltar una barra en otra columna. Llega el desplazamiento en **días hábiles**, no una fecha.
   *
   * Es a propósito: este componente sabe cuántos píxeles mide un día y nada más. Convertir un
   * desplazamiento en una fecha necesita el calendario del proyecto, y el día que esta vista lo
   * tenga empezará a decidir cuándo es lunes.
   */
  readonly onMoverLinea?: (taskId: string, deltaDiasHabiles: number) => void
}

const DAY_WIDTH = 14
const ROW_HEIGHT = 28

/** Las de por omisión, para quien monte el diagrama sin preferencias — la vista global del plan. */
const COLUMNAS_POR_OMISION = columnasVisibles(GANTT_POR_OMISION)

/**
 * Lo que va escrito en una celda.
 *
 * El nombre no está aquí: esa celda lleva el árbol —triángulos y sangría— y se dibuja aparte.
 */
/**
 * El valor que tenía esta celda en la línea base, al lado del de hoy (§4.6 conmutador 4).
 *
 * Sólo en las dos columnas de fecha, y sólo si se corrió: enseñar «2026-06-12» en gris junto a
 * «2026-06-12» sería repetir el mismo dato en cada fila y convertir la rejilla en ruido. Lo que
 * informa es la diferencia, así que se enseña cuando la hay.
 *
 * En rojo lo que se fue más tarde y en verde lo que se adelantó, con el signo escrito: el color solo
 * no dice cuánto, y «+12 d» cabe en la celda mejor que una frase.
 */
function ValorDeLaFoto({ row, columnaId }: { row: GanttRow; columnaId: string }) {
  const corrimiento =
    columnaId === 'start' ? row.baseDrift : columnaId === 'finish' ? row.baseFinishDrift : undefined
  const original = columnaId === 'start' ? row.baseStart : columnaId === 'finish' ? row.baseFinish : undefined
  if (corrimiento === undefined || original === undefined || corrimiento === 0) return null

  return (
    <span
      data-foto={columnaId}
      data-corrimiento={corrimiento}
      title={`En la línea base: ${original}`}
      className={`ml-1.5 shrink-0 tabular-nums ${corrimiento > 0 ? 'text-red-400/80' : 'text-emerald-400/80'}`}
    >
      {corrimiento > 0 ? '+' : '−'}
      {Math.abs(corrimiento)} d
    </span>
  )
}

function contenidoDe(row: GanttRow, columnaId: string, indice: number): string {
  switch (columnaId) {
    // El EDT jerárquico del plan entero. Antes era un contador de posición dentro de lo visible, y
    // eso daba dos números distintos para la misma línea según se mirara el Gantt o el esquema — y
    // el del Gantt cambiaba al plegar una rama. Es el número que la gente se dice por teléfono.
    case 'wbs':
      return row.wbs
    case 'kind':
      return row.kind === 'RESUMEN' ? 'Resumen' : row.isMilestone ? 'Hito' : 'Actividad'
    case 'party':
      return row.party === 'CLIENTE' ? 'Cliente' : 'Nuestro'
    case 'progress':
      return `${Math.round(row.progress * 100)} %`
    case 'start':
      return row.start
    case 'finish':
      return row.finish
    case 'duration':
      return row.isMilestone ? '—' : String(row.width)
    case 'float':
      return row.totalFloat === 0 ? 'sin holgura' : String(row.totalFloat)
    case 'freeFloat':
      return row.freeFloat === 0 ? 'sin holgura' : String(row.freeFloat)
    case 'deadline':
      return row.deadline ?? '—'
    case 'constraint':
      return row.constraint ?? '—'
    // En horas, que es como se captura y como se habla. Los minutos son de la aritmética.
    case 'effort':
      return row.esfuerzo ? `${Math.round(row.esfuerzo.capturado / 60)} h` : '—'
    default:
      return ''
  }
}

/**
 * Alto del área que se desplaza, en píxeles.
 *
 * El diagrama vive dentro de su propia caja en vez de estirar la página: sólo así se puede saber
 * qué filas están a la vista, y sin saberlo hay que dibujarlas todas.
 */
const ALTO_VISIBLE = 560

/**
 * Filas de más que se dibujan por arriba y por abajo de lo que se ve.
 *
 * Sin margen, desplazar rápido enseña huecos blancos antes de que React alcance al scroll. Ocho
 * filas es lo que cabe en un golpe de rueda.
 */
const MARGEN_DE_FILAS = 8

export function GanttChart({
  layout,
  dayWidth = DAY_WIDTH,
  rowHeight = ROW_HEIGHT,
  columnas = COLUMNAS_POR_OMISION,
  anchos = {},
  onAnchoCambiado,
  selectedId = null,
  onSelect,
  onMenuDeFila,
  resaltarAtrasadas,
  rutaCritica = true,
  reserva = false,
  onEditarCelda,
  onAtajo,
  onConectar,
  onCambiarDuracion,
  marcadas,
  onMarcar,
  onToggle,
  onMoverLinea,
  divisor,
  onDivisorCambiado,
}: GanttChartProps) {
  const width = Math.max(layout.span, 1) * dayWidth
  const height = layout.rows.length * rowHeight

  const anchoPorColumna = columnas.map((columna) => anchoDe(columna, anchos))
  // Lo que ocupan las columnas y lo que se ve de ellas son dos cosas distintas: la primera la
  // deciden las columnas, la segunda el divisor. Sin divisor puesto coinciden, que es como se
  // comportaba esto antes.
  const anchoDeLasColumnas = anchoPorColumna.reduce((suma, a) => suma + a, 0)
  const anchoDeLaRejilla = Math.min(divisor ?? anchoDeLasColumnas, anchoDeLasColumnas)

  /**
   * Sólo se dibujan las filas que caen dentro de la caja.
   *
   * Con las 5000 líneas del proyecto de carga, dibujarlas todas daba 2578 ms hasta el pintado y
   * **2,3 fotogramas por segundo** al desplazar —cinco fotogramas en dos segundos—. El §4.8 pide
   * menos de 1,5 s y sesenta. No es una optimización: es la diferencia entre una vista que se usa y
   * una que no.
   *
   * El alto total se mantiene, así que la barra de desplazamiento mide lo que el plan mide de
   * verdad; lo único que cambia es cuántos nodos hay puestos en cada momento.
   */
  const caja = useRef<HTMLDivElement | null>(null)
  const [desplazamiento, setDesplazamiento] = useState(0)

  const primera = Math.max(0, Math.floor(desplazamiento / rowHeight) - MARGEN_DE_FILAS)
  const ultima = Math.min(
    layout.rows.length,
    Math.ceil((desplazamiento + ALTO_VISIBLE) / rowHeight) + MARGEN_DE_FILAS,
  )
  const visibles = layout.rows.slice(primera, ultima)

  // Una flecha se dibuja si cruza la banda visible, no sólo si empieza o termina en ella: un vínculo
  // que va de la fila 3 a la 900 pasa por delante de todo lo que hay en medio.
  const flechasVisibles = layout.links.filter(
    (link) => Math.max(link.fromIndex, link.toIndex) >= primera && Math.min(link.fromIndex, link.toIndex) < ultima,
  )

  if (layout.rows.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-800 bg-[#18181b] p-6 text-sm text-zinc-400">
        No hay líneas que mostrar con los filtros de ahora.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={caja}
        data-testid="gantt-desplazable"
        onScroll={(e) => setDesplazamiento(e.currentTarget.scrollTop)}
        className="relative overflow-auto rounded-lg border border-zinc-800 bg-[#18181b]"
        style={{ maxHeight: ALTO_VISIBLE + rowHeight }}
      >
        <div className="flex" style={{ width: anchoDeLaRejilla + width }}>
          {/* La rejilla, pegada a la izquierda: antes se iba con el desplazamiento horizontal y a
              mitad del plan las barras quedaban sin nombre. */}
          <div
            data-testid="gantt-rejilla"
            // `overflow-x-auto` sólo cuando el divisor recorta: con la rejilla entera a la vista una
            // barra de desplazamiento que no desplaza nada es ruido, y en algunos navegadores roba
            // altura a la última fila.
            className={`sticky left-0 z-20 shrink-0 border-r border-zinc-800 bg-[#18181b] ${
              anchoDeLaRejilla < anchoDeLasColumnas ? 'overflow-x-auto' : ''
            }`}
            style={{ width: anchoDeLaRejilla }}
          >
            <div
              className="sticky top-0 z-10 flex border-b border-zinc-800 bg-[#18181b] text-xs uppercase tracking-wide text-zinc-400"
              style={{ height: rowHeight, width: anchoDeLasColumnas }}
            >
              {marcadas !== undefined ? <div className="w-8 shrink-0" aria-hidden /> : null}
              {columnas.map((columna, i) => (
                <div
                  key={columna.id}
                  data-testid={`cabecera-${columna.id}`}
                  className="relative shrink-0 overflow-hidden"
                  style={{ width: anchoPorColumna[i] }}
                >
                  <span className="flex h-full items-center truncate px-3">{columna.etiqueta}</span>
                  {onAnchoCambiado ? (
                    <TiradorDeColumna
                      columna={columna}
                      ancho={anchoPorColumna[i]}
                      onSoltar={onAnchoCambiado}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            {onDivisorCambiado ? (
              <TiradorDelDivisor ancho={anchoDeLaRejilla} onSoltar={onDivisorCambiado} />
            ) : null}
            <div className="relative" style={{ height, width: anchoDeLasColumnas }}>
              {visibles.map((row, k) => (
                <div
                  key={row.id}
                  data-fila={row.id}
                  // La fila recibe el foco para que existan los atajos del §4.4. `-1` y no `0`:
                  // con mil trescientas filas, tabular por todas para llegar al pie de la página
                  // sería un castigo. Se entra pulsando, y desde dentro Tab sangra.
                  tabIndex={-1}
                  onKeyDown={
                    onAtajo
                      ? (e) => {
                          const accion = accionDeTeclado({
                            key: e.key,
                            shiftKey: e.shiftKey,
                            altKey: e.altKey,
                            ctrlKey: e.ctrlKey,
                            metaKey: e.metaKey,
                            enUnCampo:
                              e.target instanceof HTMLElement &&
                              (e.target.tagName === 'INPUT' ||
                                e.target.tagName === 'TEXTAREA' ||
                                e.target.isContentEditable),
                          })
                          if (accion === null) return
                          // Solo se cancela el evento cuando hay acción. Cancelarlo «por si acaso»
                          // es como se pierden los atajos del navegador.
                          e.preventDefault()
                          if (accion.tipo === 'SOLTAR_FILA') (e.currentTarget as HTMLElement).blur()
                          else onAtajo(row.id, accion.tipo)
                        }
                      : undefined
                  }
                  onContextMenu={
                    onMenuDeFila
                      ? (e) => {
                          // Se sustituye el menú del navegador porque el del plan ofrece lo que
                          // aquí se puede hacer; dejar los dos obligaría a elegir entre «copiar
                          // texto» y «añadir subtarea» sin saber cuál sale.
                          e.preventDefault()
                          onMenuDeFila(row.id, e.clientX, e.clientY)
                        }
                      : undefined
                  }
                  className={`absolute left-0 flex ${row.id === selectedId ? 'bg-zinc-800/60' : ''}`}
                  // Las filas miden lo que miden las columnas, no lo que se ve: si midieran la
                  // ventana, al desplazar la rejilla por dentro el fondo de la fila seleccionada se
                  // quedaría corto y la fila parecería partida.
                  style={{ top: (primera + k) * rowHeight, width: anchoDeLasColumnas }}
                >
                  {marcadas !== undefined && onMarcar !== undefined ? (
                    <div className="flex w-8 shrink-0 items-center justify-center border-b border-zinc-800">
                      <input
                        type="checkbox"
                        data-marca={row.id}
                        aria-label={`Seleccionar «${row.name}»`}
                        checked={marcadas.has(row.id)}
                        // `onClick` y no `onChange`: hace falta saber si venía con Mayúsculas, y
                        // el evento de cambio no lo trae.
                        onClick={(e) => onMarcar(row.id, e.shiftKey)}
                        onChange={() => {}}
                        className="h-3.5 w-3.5 cursor-pointer accent-[#6366f1]"
                      />
                    </div>
                  ) : null}
                  {columnas.map((columna, i) => (
                    <div
                      key={columna.id}
                      data-testid={`celda-${columna.id}-${row.id}`}
                      className="shrink-0 overflow-hidden border-b border-zinc-800"
                      style={{ width: anchoPorColumna[i] }}
                    >
                      {columna.id === 'progress' && onEditarCelda ? (
                        <CeldaEditable
                          texto={contenidoDe(row, columna.id, primera + k)}
                          valor={String(Math.round(row.progress * 100))}
                          etiqueta={`Avance de «${row.name}»`}
                          validar={validarAvance}
                          alineadoALaDerecha
                          // Un resumen no tiene avance propio: lo hereda de sus hijas pesado por el
                          // trabajo de cada una. Dejarlo escribir daría una cifra que el siguiente
                          // cálculo borra.
                          deshabilitada={row.hasChildren}
                          motivo="Un resumen hereda el avance de sus hijas"
                          onGuardar={(v) => onEditarCelda(row.id, 'progress', v)}
                        />
                      ) : columna.id === 'name' ? (
                        <NameCell
                          row={row}
                          height={rowHeight}
                          onSelect={onSelect}
                          onToggle={onToggle}
                          onEditarNombre={onEditarCelda ? (id, v) => onEditarCelda(id, 'name', v) : undefined}
                        />
                      ) : (
                        <span
                          data-celda={columna.id}
                          className={`flex h-full items-center truncate px-2 text-xs text-zinc-400 ${
                            columna.numerica ? 'justify-end tabular-nums' : ''
                          }`}
                          style={{ height: rowHeight }}
                        >
                          {contenidoDe(row, columna.id, primera + k)}
                          <ValorDeLaFoto row={row} columnaId={columna.id} />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* El lienzo. */}
          <div className="relative" style={{ width }}>
            <div className="sticky top-0 z-10 bg-[#18181b]">
              {/* La fila gruesa, cuando la hay. Es lo que hace legible el zoom por días: sin ella la
                  cabecera dice «15» y no hay forma de saber de qué mes. Por años no hay nada más
                  grueso y la cabecera se queda con una sola fila, que es lo correcto — una fila
                  vacía ocupando alto es peor que ninguna. */}
              {layout.ticksSuperiores.length > 0 ? (
                <div
                  data-testid="eje-superior"
                  className="flex border-b border-zinc-800/60"
                  style={{ height: Math.round(rowHeight * 0.7) }}
                >
                  {layout.ticksSuperiores.map((tick) => (
                    <div
                      key={`sup-${tick.date}`}
                      data-tick-superior={tick.date}
                      className="shrink-0 overflow-hidden border-r border-zinc-800 px-2 text-[11px] font-medium text-zinc-300"
                      style={{
                        width: tick.width * dayWidth,
                        lineHeight: `${Math.round(rowHeight * 0.7)}px`,
                      }}
                    >
                      {tick.label}
                    </div>
                  ))}
                </div>
              ) : null}
              <div
                data-testid="eje-inferior"
                className="flex border-b border-zinc-800"
                style={{ height: rowHeight }}
              >
                {layout.ticks.map((tick) => (
                  <div
                    key={tick.date}
                    data-tick={tick.date}
                    className="shrink-0 overflow-hidden border-r border-zinc-800 px-2 text-xs text-zinc-400"
                    style={{ width: tick.width * dayWidth, lineHeight: `${rowHeight}px` }}
                  >
                    {tick.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative" style={{ height }}>
              {visibles.map((row, k) => (
                <Bar
                  key={row.id}
                  row={row}
                  index={primera + k}
                  dayWidth={dayWidth}
                  rowHeight={rowHeight}
                  onMoverLinea={onMoverLinea}
                  resaltarAtrasadas={resaltarAtrasadas}
                  rutaCritica={rutaCritica}
                  reserva={reserva}
                  onConectar={onConectar}
                  onCambiarDuracion={onCambiarDuracion}
                />
              ))}
              <Links
                links={flechasVisibles}
                dayWidth={dayWidth}
                rowHeight={rowHeight}
                width={width}
                height={height}
              />
            </div>
          </div>
        </div>
      </div>

      <Legend layout={layout} />
    </div>
  )
}

function NameCell({
  row,
  height,
  onSelect,
  onToggle,
  onEditarNombre,
}: {
  row: GanttRow
  height: number
  onSelect?: (id: string) => void
  onToggle?: (id: string, estabaPlegada: boolean) => void
  onEditarNombre?: (id: string, valor: string) => void
}) {
  return (
    <div
      className="flex items-center gap-1 px-2 text-sm"
      style={{ height, paddingLeft: 8 + row.level * 14 }}
    >
      {row.hasChildren && onToggle ? (
        <button
          type="button"
          aria-label={row.isCollapsed ? `Abrir ${row.name}` : `Cerrar ${row.name}`}
          aria-expanded={!row.isCollapsed}
          onClick={() => onToggle(row.id, row.isCollapsed)}
          className="w-4 shrink-0 text-zinc-400"
        >
          {row.isCollapsed ? '▸' : '▾'}
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      {/* El clic simple sigue abriendo el detalle y el doble clic edita. Son dos gestos distintos
          sobre el mismo elemento a propósito: el nombre es donde la gente pulsa para mirar una
          línea, y mudar la edición a otro sitio la escondería. */}
      {onEditarNombre ? (
        // La celda se dibuja siempre y ella sola decide cuándo abrirse. Envolverla en un
        // conmutador de fuera obligaba a dos dobles clics: uno para cambiar el conmutador y otro
        // para que la celda se abriera. Se descubrió midiendo la misma pieza en la Lista.
        <CeldaEditable
          texto={row.name}
          valor={row.name}
          etiqueta={`Nombre de «${row.name}»`}
          validar={validarNombre}
          onClick={() => onSelect?.(row.id)}
          onGuardar={(v) => onEditarNombre(row.id, v)}
        />
      ) : (
        <button
          type="button"
          onClick={() => onSelect?.(row.id)}
          className={`truncate text-left ${row.isSummary ? 'font-medium text-zinc-100' : 'text-zinc-300'}`}
          title={row.name}
        >
          {row.name}
        </button>
      )}
    </div>
  )
}

/**
 * Una barra.
 *
 * La ruta súper crítica se distingue de la crítica a secas, y no por capricho: la crítica dice qué
 * fija la fecha, la súper crítica dice qué no se arregla poniendo más gente. Son dos preguntas
 * distintas y quien mira el plan necesita las dos.
 */
function Bar({
  row,
  index,
  dayWidth,
  rowHeight,
  onMoverLinea,
  resaltarAtrasadas,
  rutaCritica = true,
  reserva = false,
  onConectar,
  onCambiarDuracion,
}: {
  row: GanttRow
  index: number
  dayWidth: number
  rowHeight: number
  onMoverLinea?: (taskId: string, deltaDiasHabiles: number) => void
  /** Conmutador de «tareas atrasadas» (§4.6). */
  resaltarAtrasadas?: boolean
  /** Conmutador 3 del §4.6, mitad «ruta crítica». */
  rutaCritica?: boolean
  /** Conmutador 3 del §4.6, mitad «reserva». */
  reserva?: boolean
  /** Agarrar o soltar un conector para crear una dependencia (§4.4). */
  onConectar?: (id: string, extremo: 'INICIO' | 'FIN', gesto: 'AGARRAR' | 'SOLTAR') => void
  /** Cambiar la duración arrastrando el borde derecho (§4.4). Llega la duración nueva en días. */
  onCambiarDuracion?: (id: string, dias: number) => void
}) {
  const top = index * rowHeight
  const alto = Math.max(8, rowHeight - 14)
  const y = top + (rowHeight - alto) / 2

  // Un resumen no se arrastra: sus fechas son las de sus hijos, y moverlo sería pedirle al plan que
  // olvide de dónde salen. Lo dice el §4.8 y además es la única lectura que no miente.
  const movible = onMoverLinea !== undefined && !row.isSummary

  /**
   * El arrastre, a mano y fuera de React.
   *
   * Se mueve el elemento con `transform` en cada `pointermove` en lugar de guardar el
   * desplazamiento en el estado: con las 1368 líneas del plan de referencia, un renderizado por cada
   * píxel del ratón no llega ni de lejos a los 100 ms que pide el §4.8. El estado sólo se toca al
   * soltar, que es cuando hay algo que decidir.
   */
  const alApretar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!movible || !onMoverLinea) return
    const elemento = e.currentTarget
    const xInicial = e.clientX
    let delta = 0
    elemento.setPointerCapture(e.pointerId)
    elemento.style.opacity = '0.7'

    const alMover = (ev: PointerEvent) => {
      delta = Math.round((ev.clientX - xInicial) / dayWidth)
      elemento.style.transform = `translateX(${delta * dayWidth}px)`
    }
    const alSoltar = (ev: PointerEvent) => {
      elemento.releasePointerCapture(ev.pointerId)
      elemento.removeEventListener('pointermove', alMover)
      elemento.removeEventListener('pointerup', alSoltar)
      elemento.removeEventListener('pointercancel', alSoltar)
      // Se devuelve a su sitio: la barra sólo se queda donde la soltaron si el plan lo confirma, y
      // el plan lo dice después. Dejarla movida sería prometer una escritura que aún no ocurrió.
      elemento.style.transform = ''
      elemento.style.opacity = ''
      if (delta !== 0 && ev.type === 'pointerup') onMoverLinea(row.id, delta)
    }
    elemento.addEventListener('pointermove', alMover)
    elemento.addEventListener('pointerup', alSoltar)
    elemento.addEventListener('pointercancel', alSoltar)
  }

  /**
   * Arrastrar el borde derecho: cambia la duración sin mover el arranque (§4.4).
   *
   * Solo el derecho. El izquierdo cambiaría la fecha de inicio, y eso ya lo hace arrastrar la barra
   * entera; tener dos gestos para lo mismo con distinto efecto sobre la duración es la clase de
   * ambigüedad que hace que la gente deje de arrastrar nada.
   *
   * La barra se estira mientras se arrastra pero **vuelve** al soltar: sólo se queda estirada si el
   * plan lo confirma, y eso se decide después. Dejarla estirada sería prometer una escritura que
   * todavía no ocurrió.
   */
  const alApretarElBorde = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onCambiarDuracion) return
    e.stopPropagation()
    const tirador = e.currentTarget
    const barra = tirador.parentElement
    if (!barra) return
    const xInicial = e.clientX
    const anchoInicial = Math.max(row.width * dayWidth, 2)
    let dias = 0
    tirador.setPointerCapture(e.pointerId)

    const alMover = (ev: PointerEvent) => {
      dias = Math.round((ev.clientX - xInicial) / dayWidth)
      // Una tarea no puede durar menos de un día: la duración cero es de los hitos, y convertir una
      // actividad en hito arrastrando sería una sorpresa, no un gesto.
      if (row.width + dias < 1) dias = 1 - row.width
      barra.style.width = `${Math.max(anchoInicial + dias * dayWidth, 2)}px`
    }
    const alSoltar = (ev: PointerEvent) => {
      tirador.releasePointerCapture(ev.pointerId)
      tirador.removeEventListener('pointermove', alMover)
      tirador.removeEventListener('pointerup', alSoltar)
      tirador.removeEventListener('pointercancel', alSoltar)
      barra.style.width = ''
      if (dias !== 0 && ev.type === 'pointerup') onCambiarDuracion(row.id, row.width + dias)
    }
    tirador.addEventListener('pointermove', alMover)
    tirador.addEventListener('pointerup', alSoltar)
    tirador.addEventListener('pointercancel', alSoltar)
  }

  if (row.isMilestone) {
    return (
      <div
        data-testid={`hito-${row.id}`}
        data-movible={movible ? 'sí' : 'no'}
        title={`${row.name} · ${row.start}`}
        onPointerDown={movible ? alApretar : undefined}
        className={`absolute rotate-45 ${movible ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${row.isSuperCritical ? 'bg-red-400' : row.isCritical ? 'bg-orange-400' : 'bg-zinc-300'}`}
        style={{ left: row.x * dayWidth - alto / 2, top: y, width: alto, height: alto }}
      />
    )
  }

  return (
    <React.Fragment>
      {reserva && row.floatWidth > 0 ? (
        <div
          data-testid={`holgura-${row.id}`}
          title={`${row.totalFloat} días de margen`}
          className="absolute rounded-sm border border-dashed border-zinc-700"
          style={{ left: row.floatX * dayWidth, top: y, width: row.floatWidth * dayWidth, height: alto }}
        />
      ) : null}
      {/* Dónde estaba esta línea según la línea base. Va **debajo** y más delgada, no encima: lo
          que importa es la de hoy, y la foto es la referencia contra la que se lee el corrimiento.
          El desfase horizontal entre las dos es la desviación, sin tener que leer ningún número. */}
      {row.baseX !== undefined && row.baseWidth !== undefined ? (
        <div
          data-testid={`base-${row.id}`}
          data-desvio={row.baseDrift}
          title={`Línea base: ${row.baseDrift === 0 ? 'sin corrimiento' : row.baseDrift! > 0 ? `${row.baseDrift} días hábiles más tarde de lo previsto` : `${-row.baseDrift!} días hábiles antes de lo previsto`}`}
          className={`absolute rounded-sm ${
            row.baseDrift === 0 ? 'bg-zinc-600' : row.baseDrift! > 0 ? 'bg-red-400/50' : 'bg-emerald-400/50'
          }`}
          style={{
            left: row.baseX * dayWidth,
            top: y + alto - 3,
            width: Math.max(row.baseWidth * dayWidth, 2),
            height: 4,
          }}
        />
      ) : null}
      <div
        data-testid={`barra-${row.id}`}
        data-movible={movible ? 'sí' : 'no'}
        data-atrasada={row.atrasada ? 'sí' : 'no'}
        title={
          row.atrasada
            ? `${row.name} · ${row.start} → ${row.finish} · venció sin terminar`
            : `${row.name} · ${row.start} → ${row.finish}`
        }
        onPointerDown={movible ? alApretar : undefined}
        className={`absolute overflow-hidden rounded-sm ${movible ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${barTone(row, rutaCritica)} ${
          // El resalte va como anillo y no como color de relleno: el relleno ya dice si la línea es
          // crítica, y pisarlo cambiaría una información por otra en vez de sumarla.
          resaltarAtrasadas && row.atrasada ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-[#0e0e11]' : ''
        }`}
        style={{ left: row.x * dayWidth, top: y, width: Math.max(row.width * dayWidth, 2), height: alto }}
      >
        {row.progressWidth > 0 ? (
          <div
            data-testid={`avance-${row.id}`}
            className="h-full bg-zinc-100/40"
            style={{ width: row.progressWidth * dayWidth }}
          />
        ) : null}

        {/* El tirador del borde derecho. Va dentro de la barra y no encima para que estirarla mueva
            el tirador con ella; ocho píxeles de ancho, que es lo mínimo que se acierta con el ratón
            sin que estorbe a los conectores. Un resumen no lo lleva: su duración es la de sus
            hijas. */}
        {onCambiarDuracion && !row.isSummary ? (
          <div
            data-tirador-duracion={row.id}
            role="separator"
            aria-label={`Cambiar la duración de «${row.name}», ahora ${row.width} días`}
            onPointerDown={alApretarElBorde}
            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize opacity-0 hover:bg-zinc-100/40 hover:opacity-100"
          />
        ) : null}
      </div>

      {/* Los conectores (§4.4). Uno por extremo, porque el tipo del vínculo sale de por dónde se
          agarra y dónde se suelta. Un resumen no los lleva: sus fechas son las de sus hijas, y
          amarrar un resumen es amarrar algo que no se mueve por sí mismo. */}
      {onConectar && !row.isSummary
        ? (['INICIO', 'FIN'] as const).map((extremo) => (
            <button
              key={extremo}
              type="button"
              data-conector={`${row.id}:${extremo}`}
              aria-label={`${extremo === 'INICIO' ? 'Inicio' : 'Fin'} de «${row.name}» · arrastra a otra barra para vincular`}
              onPointerDown={(e) => {
                e.stopPropagation()
                onConectar(row.id, extremo, 'AGARRAR')
              }}
              onPointerUp={(e) => {
                e.stopPropagation()
                onConectar(row.id, extremo, 'SOLTAR')
              }}
              className="absolute z-10 rounded-full border border-zinc-300 bg-[#18181b] opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
              style={{
                left: (extremo === 'INICIO' ? row.x : row.x + row.width) * dayWidth - 4,
                top: y + alto / 2 - 4,
                width: 8,
                height: 8,
              }}
            />
          ))
        : null}
    </React.Fragment>
  )
}

/**
 * El tirador que redimensiona una columna.
 *
 * Se mueve con `transform` mientras se arrastra y sólo se avisa al soltar: guardar en cada píxel
 * dispararía una escritura de preferencias por movimiento de ratón. Es la misma razón por la que la
 * barra del Gantt tampoco pasa por el estado hasta que se suelta.
 */
/**
 * El divisor entre la rejilla y la línea de tiempo (§4.1).
 *
 * Va `sticky` dentro del panel de la rejilla y no `absolute`: si fuera absoluto se iría con el
 * desplazamiento horizontal de dentro y a mitad de las columnas quedaría flotando encima de una de
 * ellas, que es justo lo que un divisor no puede hacer.
 *
 * Doble clic lo devuelve a «lo que ocupen las columnas». Es la salida para quien lo arrastró
 * demasiado: sin ella, estrechar la rejilla de más obliga a arrastrar hacia atrás a ciegas.
 */
function TiradorDelDivisor({
  ancho,
  onSoltar,
}: {
  ancho: number
  onSoltar: (posicion: number) => void
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ancho de la rejilla"
      data-testid="tirador-divisor"
      title="Arrastra para estrechar la rejilla · doble clic para ajustarla a las columnas"
      onDoubleClick={() => onSoltar(0)}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const tirador = e.currentTarget
        const xInicial = e.clientX
        let nuevo = ancho
        tirador.setPointerCapture(e.pointerId)

        const alMover = (ev: PointerEvent) => {
          nuevo = ancho + (ev.clientX - xInicial)
          tirador.style.transform = `translateX(${nuevo - ancho}px)`
        }
        const alSoltar = (ev: PointerEvent) => {
          tirador.releasePointerCapture(ev.pointerId)
          tirador.removeEventListener('pointermove', alMover)
          tirador.removeEventListener('pointerup', alSoltar)
          tirador.removeEventListener('pointercancel', alSoltar)
          tirador.style.transform = ''
          // Sólo al soltar, y sólo si de verdad se movió: escribir en cada `pointermove` mandaría
          // una petición por píxel.
          if (ev.type === 'pointerup' && Math.round(nuevo) !== Math.round(ancho)) onSoltar(nuevo)
        }
        tirador.addEventListener('pointermove', alMover)
        tirador.addEventListener('pointerup', alSoltar)
        tirador.addEventListener('pointercancel', alSoltar)
      }}
      className="sticky right-0 top-0 z-30 float-right h-full w-2 cursor-col-resize touch-none bg-transparent hover:bg-[#6366f1]/70"
    />
  )
}

function TiradorDeColumna({
  columna,
  ancho,
  onSoltar,
}: {
  columna: ColumnaDelGantt
  ancho: number
  onSoltar: (id: string, ancho: number) => void
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Ancho de la columna ${columna.etiqueta}`}
      data-testid={`tirador-${columna.id}`}
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const tirador = e.currentTarget
        const xInicial = e.clientX
        let nuevo = ancho
        tirador.setPointerCapture(e.pointerId)

        const alMover = (ev: PointerEvent) => {
          nuevo = Math.max(columna.minimo, ancho + (ev.clientX - xInicial))
          tirador.style.transform = `translateX(${nuevo - ancho}px)`
        }
        const alSoltar = (ev: PointerEvent) => {
          tirador.releasePointerCapture(ev.pointerId)
          tirador.removeEventListener('pointermove', alMover)
          tirador.removeEventListener('pointerup', alSoltar)
          tirador.removeEventListener('pointercancel', alSoltar)
          tirador.style.transform = ''
          if (ev.type === 'pointerup' && Math.round(nuevo) !== Math.round(ancho)) {
            onSoltar(columna.id, nuevo)
          }
        }
        tirador.addEventListener('pointermove', alMover)
        tirador.addEventListener('pointerup', alSoltar)
        tirador.addEventListener('pointercancel', alSoltar)
      }}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none bg-transparent hover:bg-[#6366f1]/60"
    />
  )
}

/**
 * El color de una barra.
 *
 * Con la ruta crítica apagada todas las barras de trabajo salen del mismo color: el §4.6 pide una
 * casilla para eso, y en un plan donde casi todo es crítico —el 90 % del de referencia no tiene
 * días de sobra— un diagrama todo rojo no señala nada. Los resúmenes siguen en gris porque eso no
 * es criticidad, es qué clase de línea es.
 */
function barTone(row: GanttRow, rutaCritica: boolean): string {
  if (row.isSummary) return 'bg-zinc-500'
  if (!rutaCritica) return 'bg-[#6366f1]/80'
  if (row.isSuperCritical) return 'bg-red-500/80'
  if (row.isCritical) return 'bg-orange-500/80'
  return 'bg-[#6366f1]/80'
}

/**
 * Las flechas.
 *
 * El recorrido es ortogonal: sale, baja o sube, y entra. Cuando no hay espacio entre las dos puntas
 * —porque la sucesora empieza donde termina la predecesora, o antes— rodea por media fila en vez de
 * cruzar la barra, que es lo que hace ilegible una flecha corta.
 */
function Links({
  links,
  dayWidth,
  rowHeight,
  width,
  height,
}: {
  links: readonly GanttLink[]
  dayWidth: number
  rowHeight: number
  width: number
  height: number
}) {
  if (links.length === 0) return null

  return (
    <svg
      role="presentation"
      className="pointer-events-none absolute left-0 top-0"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <marker id="punta" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="fill-zinc-500" />
        </marker>
        <marker id="punta-critica" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" className="fill-red-400" />
        </marker>
      </defs>
      {links.map((link) => {
        const x1 = link.fromX * dayWidth
        const y1 = link.fromIndex * rowHeight + rowHeight / 2
        const x2 = link.toX * dayWidth
        const y2 = link.toIndex * rowHeight + rowHeight / 2
        const etiqueta = linkLabel(link)
        const rotulo = link.foldedCount > 1 ? `${etiqueta} · ${link.foldedCount} vínculos` : etiqueta

        return (
          // El rotulo va dentro del propio trazo, no en un grupo que lo envuelva: es el trazo el que
          // se senala con el puntero, y es de el de quien se quiere saber que tipo de vinculo es.
          <path
            key={`${link.fromRowId}-${link.toRowId}-${link.type}`}
            data-testid={`vinculo-${link.fromRowId}-${link.toRowId}`}
            data-tipo={link.type}
            data-plegado={link.isFolded ? 'sí' : 'no'}
            data-critico={link.isCritical ? 'sí' : 'no'}
            d={elbow(x1, y1, x2, y2, rowHeight, link.toAnchor === 'FIN')}
            fill="none"
            strokeWidth={link.isCritical ? 2 : 1}
            strokeDasharray={link.isFolded ? '4 3' : undefined}
            className={link.isCritical ? 'stroke-red-400' : 'stroke-zinc-600'}
            markerEnd={link.isCritical ? 'url(#punta-critica)' : 'url(#punta)'}
          >
            <title>{`${link.fromRowId} → ${link.toRowId} · ${rotulo}`}</title>
          </path>
        )
      })}
    </svg>
  )
}

/** El recorrido ortogonal de una flecha, con rodeo cuando las puntas quedan encima. */
export function elbow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rowHeight: number,
  entraPorElFin: boolean,
): string {
  const salida = 6
  // Una flecha que entra por el fin llega desde la derecha; una que entra por el comienzo, desde la
  // izquierda. Dibujarlas igual pone la punta del lado equivocado de la barra.
  const llegada = entraPorElFin ? x2 + salida : x2 - salida

  if (!entraPorElFin && llegada >= x1 + salida) {
    return `M${x1},${y1} L${x1 + salida},${y1} L${x1 + salida},${y2} L${x2},${y2}`
  }
  if (entraPorElFin && llegada <= x1 - salida) {
    return `M${x1},${y1} L${x1 - salida},${y1} L${x1 - salida},${y2} L${x2},${y2}`
  }

  const medio = y1 < y2 ? y1 + rowHeight / 2 : y1 - rowHeight / 2
  return `M${x1},${y1} L${x1 + salida},${y1} L${x1 + salida},${medio} L${llegada},${medio} L${llegada},${y2} L${x2},${y2}`
}

/** Lo que se está viendo, dicho en números. Sin esto, un filtro activo se ve igual que un plan corto. */
function Legend({ layout }: { layout: GanttLayout }) {
  const partes: string[] = [
    `${layout.rows.length} ${layout.rows.length === 1 ? 'línea' : 'líneas'}`,
    `${layout.span} ${layout.span === 1 ? 'día hábil' : 'días hábiles'}`,
  ]
  if (layout.hiddenCount > 0) {
    partes.push(`${layout.hiddenCount} sin mostrar`)
  }
  if (layout.foldedLinkCount > 0) {
    partes.push(`${layout.foldedLinkCount} ${layout.foldedLinkCount === 1 ? 'vínculo plegado' : 'vínculos plegados'}`)
  }

  return <p className="text-xs text-zinc-400">{partes.join(' · ')}</p>
}

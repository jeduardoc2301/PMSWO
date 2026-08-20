'use client'

/**
 * La vista de Carga de trabajo (§8): la matriz recurso × día.
 *
 * De presentación pura sobre la matriz que arma el motor. Los tres modos —horas, tareas y
 * porcentajes— no son tres cálculos: son tres formas de pintar la misma celda, y por eso cambiar de
 * modo no vuelve a pedir nada (§8.5). La sobrecarga tampoco se decide aquí; viene decidida en
 * minutos desde el motor, para que no pueda pasar que una celda salga roja en un modo y no en otro.
 *
 * ## Cómo se lee una celda sin depender del color
 *
 * El rojo marca la sobrecarga, pero nunca solo. Cada celda sobrecargada lleva además su número por
 * encima de cien —o de la jornada— y el título al pasar por encima; y la columna de la izquierda
 * dice, por recurso, cuántos días del rango están en rojo. Quien no distinga el rojo del gris sigue
 * teniendo tres formas de encontrarlo.
 *
 * ## Por qué la escala de fondo es una rampa de un tono
 *
 * La ocupación es una magnitud, no una identidad: es la misma cosa en más o menos cantidad, así que
 * se dibuja con un solo tono que cambia de luminosidad. Colores distintos por tramo dirían «son
 * cosas diferentes». El único color que se sale de la rampa es el de la sobrecarga, que no es «más
 * carga» sino un problema.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'

import { COLORES_DE_ESTADO, RAMPA_AZUL } from '@/components/projects/dashboard-charts'
import { type WorkCalendar } from '@/lib/scheduling/calendar'
import {
  type AsignacionDeCarga,
  type CeldaDeCarga,
  type RecursoDeCarga,
  type TareaDeCarga,
  type FilaDeDesglose,
  desgloseDelDia,
  desglosePorTarea,
  recursosConHueco,
  workloadMatrix,
} from '@/lib/scheduling/workload'

export type ModoDeCarga = 'horas' | 'tareas' | 'porcentaje'

export interface WorkloadViewProps {
  readonly resources: readonly RecursoDeCarga[]
  readonly tasks: readonly TareaDeCarga[]
  readonly assignments: readonly AsignacionDeCarga[]
  readonly calendar: WorkCalendar
  readonly from: string
  readonly to: string
  readonly onRangoChange: (from: string, to: string) => void
  readonly today?: string
  /** Abrir el calendario individual de un recurso: sus días libres (§8.1). */
  readonly onAbrirCalendario?: (resourceId: string) => void
  /**
   * Abrir el panel de detalle de una línea (§10.3).
   *
   * Aquí importa más que en ninguna otra vista: quien mira la carga ve que alguien está al 140 % y
   * lo siguiente que necesita saber es de qué depende la línea que lo satura.
   */
  readonly onAbrirDetalle?: (id: string) => void
  /**
   * El modo de lectura guardado de esta persona (§10.4), o `undefined` mientras no llega.
   *
   * Es la elección que se rehace en cada visita: quien planifica capacidad mira horas, quien
   * reparte gente mira porcentajes, y cada cual vuelve siempre al suyo. El rango de fechas no se
   * guarda porque es dónde estás mirando, no cómo lees.
   */
  readonly modoInicial?: ModoDeCarga
  readonly onModoChange?: (modo: ModoDeCarga) => void
  /**
   * Mover una línea de un recurso a otro sin salir de aquí (§8.4, nivelación manual asistida).
   *
   * Es la tercera de las tres mejoras que el spec pide sobre la referencia, y la que faltaba: la
   * vista ya decía quién está sobrecargado y quién tiene hueco ese día, pero los nombres no eran
   * accionables. Enseñar la sobrecarga sin ofrecer nada para resolverla deja el problema donde
   * estaba.
   *
   * Devuelve el motivo si no se pudo, o `null` si sí. Sin la prop, la vista es de sólo lectura y
   * no ofrece mover — que es lo que corresponde a quien no puede tocar el cronograma.
   */
  readonly onMover?: (movimiento: {
    readonly taskId: string
    readonly desdeResourceId: string
    readonly haciaResourceId: string
    readonly unitsBp: number
  }) => Promise<string | null>
}

/**
 * La rampa de ocupación: la misma del producto, leída de vacío a lleno.
 *
 * Sobre fondo oscuro, más lleno es más claro. Al revés que el embudo del panel, y a propósito: en
 * una matriz de noventa columnas lo que hay que encontrar de un vistazo es dónde está lo lleno, y
 * lo que resalta sobre negro es lo claro. Un primer intento con pasos propios más oscuros falló el
 * validador —el más oscuro quedaba en 1.24:1 contra la tarjeta, indistinguible del fondo—, que es
 * justo el motivo de tener una rampa comprobada en vez de elegir cuatro azules a ojo.
 */
const RAMPA = [RAMPA_AZUL[3], RAMPA_AZUL[2], RAMPA_AZUL[1], RAMPA_AZUL[0]] as const

/** El color de fondo de una celda según lo llena que esté. */
function fondoDeCelda(celda: CeldaDeCarga): string | undefined {
  if (celda.sobrecargado) return `${COLORES_DE_ESTADO.critico}44`
  if (celda.capacidadMin === 0 || celda.cargaMin === 0) return undefined
  const ocupacion = celda.cargaMin / celda.capacidadMin
  if (ocupacion >= 0.99) return RAMPA[3]
  if (ocupacion >= 0.66) return RAMPA[2]
  if (ocupacion >= 0.33) return RAMPA[1]
  return RAMPA[0]
}

function textoDeCelda(celda: CeldaDeCarga, modo: ModoDeCarga): string {
  if (modo === 'tareas') return celda.tareas === 0 ? '' : String(celda.tareas)
  if (modo === 'porcentaje') {
    if (celda.cargaMin === 0) return ''
    // Sin capacidad no hay porcentaje que calcular: es una división por cero, y «∞ %» no informa
    // de nada. El aspa dice lo que pasa: hay trabajo un día en que esa persona no está.
    if (celda.capacidadMin === 0) return '✕'
    return String(Math.round((celda.cargaMin / celda.capacidadMin) * 100))
  }
  if (celda.cargaMin === 0) return ''
  const horas = celda.cargaMin / 60
  return Number.isInteger(horas) ? String(horas) : horas.toFixed(1)
}

const NOMBRES_DE_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function mesDe(iso: string): string {
  return `${NOMBRES_DE_MES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}

function minutosLegibles(minutos: number): string {
  const horas = minutos / 60
  return Number.isInteger(horas) ? `${horas} h` : `${horas.toFixed(1)} h`
}

export function WorkloadView({
  resources,
  tasks,
  assignments,
  calendar,
  from,
  to,
  onRangoChange,
  today,
  onAbrirCalendario,
  onAbrirDetalle,
  modoInicial,
  onModoChange,
  onMover,
}: WorkloadViewProps) {
  const [modo, setModo] = useState<ModoDeCarga>(modoInicial ?? 'horas')

  // Cuando llega la preferencia guardada después del primer dibujo, se adopta. Solo entonces: si
  // se copiara en cada cambio, cambiar de modo a mano se desharía solo.
  const modoGuardado = useRef(modoInicial)
  useEffect(() => {
    if (modoInicial !== undefined && modoInicial !== modoGuardado.current) {
      modoGuardado.current = modoInicial
      setModo(modoInicial)
    }
  }, [modoInicial])

  useEffect(() => {
    if (modoInicial === undefined) return
    onModoChange?.(modo)
  }, [modo, modoInicial, onModoChange])
  const [desplegado, setDesplegado] = useState<string | null>(null)
  const [celdaElegida, setCeldaElegida] = useState<{ resourceId: string; date: string } | null>(null)
  /** La línea que se está moviendo, y el aviso de por qué no se pudo. */
  const [lineaAMover, setLineaAMover] = useState<string | null>(null)
  const [moviendo, setMoviendo] = useState(false)
  const [errorAlMover, setErrorAlMover] = useState<string | null>(null)

  const matriz = useMemo(
    () => workloadMatrix({ resources, tasks, assignments, calendar, from, to }),
    [resources, tasks, assignments, calendar, from, to],
  )

  const desglose = useMemo(
    () =>
      celdaElegida === null
        ? []
        : desgloseDelDia({ tasks, assignments, calendar }, resources, celdaElegida.resourceId, celdaElegida.date),
    [celdaElegida, tasks, assignments, calendar, resources],
  )

  // El desglose del recurso desplegado: una fila por tarea suya a lo largo del rango (§8.5.4).
  // Antes, desplegar abría una frase que decía «toca una celda» — una afordancia que prometía el
  // desglose y entregaba una instrucción.
  const desgloseDelRecurso = useMemo(
    () =>
      desplegado === null
        ? []
        : desglosePorTarea({ tasks, assignments, calendar, from, to }, resources, desplegado),
    [desplegado, tasks, assignments, calendar, from, to, resources],
  )

  const conHueco = useMemo(
    () => (celdaElegida === null ? [] : recursosConHueco(matriz, celdaElegida.date)),
    [celdaElegida, matriz],
  )

  // Las cabeceras de mes: cuántas columnas ocupa cada uno, para no repetir «ago 2026» 31 veces.
  const meses = useMemo(() => {
    const tramos: { mes: string; ancho: number }[] = []
    for (const dia of matriz.days) {
      const mes = mesDe(dia.date)
      const ultimo = tramos[tramos.length - 1]
      if (ultimo && ultimo.mes === mes) ultimo.ancho += 1
      else tramos.push({ mes, ancho: 1 })
    }
    return tramos
  }, [matriz.days])

  const mover = (meses: number) => {
    const correr = (iso: string) => {
      const [a, m, d] = iso.split('-').map(Number)
      const total = a * 12 + (m - 1) + meses
      const anio = Math.floor(total / 12)
      const mes = (total % 12) + 1
      // El día se recorta al último del mes destino: 31 de enero + 1 mes no es 31 de febrero.
      const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
      return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
    }
    onRangoChange(correr(from), correr(to))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Periodo anterior"
            onClick={() => mover(-1)}
            className="rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta-2 hover:bg-superficie-3"
          >
            ‹
          </button>
          <span className="min-w-[188px] text-center text-sm text-tinta-2">
            {from} → {to}
          </span>
          <button
            type="button"
            aria-label="Periodo siguiente"
            onClick={() => mover(1)}
            className="rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tinta-2 hover:bg-superficie-3"
          >
            ›
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-borde p-0.5">
          {(
            [
              ['horas', 'Horas'],
              ['tareas', 'Tareas'],
              ['porcentaje', 'Porcentajes'],
            ] as const
          ).map(([clave, rotulo]) => (
            <button
              key={clave}
              type="button"
              aria-pressed={modo === clave}
              onClick={() => setModo(clave)}
              className={`rounded-md px-3 py-1 text-sm ${
                modo === clave ? 'bg-acento text-white' : 'text-tinta-2 hover:bg-superficie-3'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {matriz.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-borde p-8 text-center">
          <p className="text-sm text-tinta-2">
            Este proyecto todavía no tiene a nadie asignado a ninguna línea.
          </p>
        </div>
      ) : (
        // La matriz desborda por la derecha a propósito: noventa columnas no caben. Lo que no puede
        // desbordar es la página, así que el rodillo vive en esta caja y no en el documento.
        <div className="overflow-x-auto rounded-xl border border-borde bg-superficie">
          <table className="border-collapse text-xs" style={{ minWidth: 'max-content' }}>
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-20 w-56 min-w-56 border-b border-r border-borde bg-superficie px-3 py-2 text-left font-normal text-tinta-3"
                >
                  Recurso
                </th>
                {meses.map((tramo) => (
                  <th
                    key={tramo.mes}
                    colSpan={tramo.ancho}
                    className="border-b border-l border-borde px-2 py-1 text-left font-normal text-tinta-2"
                  >
                    {tramo.mes}
                  </th>
                ))}
              </tr>
              <tr>
                {matriz.days.map((dia) => (
                  <th
                    key={dia.date}
                    title={dia.date}
                    className={`w-8 min-w-8 border-b border-borde py-1 text-center font-normal ${
                      dia.isWorking ? 'text-tinta-3' : 'bg-superficie text-tinta-3'
                    } ${dia.date === today ? 'text-acento-tinta' : ''}`}
                  >
                    {Number(dia.date.slice(8, 10))}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              <FilaDeLaMatriz
                clave="total"
                titulo="Todo el equipo"
                subtitulo={`${matriz.rows.length} recursos`}
                celdas={matriz.total.celdas}
                dias={matriz.days}
                modo={modo}
                diasSobrecargados={matriz.total.diasSobrecargados}
                destacada
              />

              {matriz.rows.map((fila) => (
                <React.Fragment key={fila.resource!.id}>
                  <FilaDeLaMatriz
                    clave={fila.resource!.id}
                    titulo={fila.resource!.name}
                    subtitulo={`${minutosLegibles(fila.resource!.dailyMinutes)}/día${
                      fila.resource!.kind === 'PERSONA' ? '' : ` · ${fila.resource!.kind.toLowerCase()}`
                    }`}
                    celdas={fila.celdas}
                    dias={matriz.days}
                    modo={modo}
                    diasSobrecargados={fila.diasSobrecargados}
                    desplegado={desplegado === fila.resource!.id}
                    onDesplegar={() =>
                      setDesplegado((actual) => (actual === fila.resource!.id ? null : fila.resource!.id))
                    }
                    onElegirCelda={(date) => setCeldaElegida({ resourceId: fila.resource!.id, date })}
                    onAbrirCalendario={
                      onAbrirCalendario ? () => onAbrirCalendario(fila.resource!.id) : undefined
                    }
                  />
                  {desplegado === fila.resource!.id
                    ? (desgloseDelRecurso.length === 0 ? (
                        <tr>
                          <td
                            colSpan={matriz.days.length + 1}
                            className="border-b border-borde bg-[#141416] px-3 py-2 text-[11px] text-tinta-3"
                          >
                            Este recurso no tiene ninguna línea activa en el periodo visible.
                          </td>
                        </tr>
                      ) : (
                        desgloseDelRecurso.map((linea) => (
                          <FilaDeDesgloseDeTarea
                            key={linea.taskId}
                            linea={linea}
                            dias={matriz.days}
                            modo={modo}
                            jornadaMin={fila.resource!.dailyMinutes}
                            onAbrirDetalle={onAbrirDetalle}
                          />
                        ))
                      ))
                    : null}
                </React.Fragment>
              ))}

              <FilaDeLaMatriz
                clave="sin-asignar"
                titulo="Sin asignar"
                subtitulo="trabajo huérfano"
                celdas={matriz.sinAsignar.celdas}
                dias={matriz.days}
                modo="tareas"
                diasSobrecargados={0}
                apagada
              />
            </tbody>
          </table>
        </div>
      )}

      {celdaElegida !== null ? (
        <div data-testid="panel-del-dia" className="rounded-xl border border-borde bg-superficie p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-tinta">
              {resources.find((r) => r.id === celdaElegida.resourceId)?.name} · {celdaElegida.date}
            </p>
            <button
              type="button"
              aria-label="Cerrar el desglose del día"
              onClick={() => {
                setCeldaElegida(null)
                setLineaAMover(null)
                setErrorAlMover(null)
              }}
              className="rounded px-2 py-1 text-tinta-2 hover:bg-superficie-3 hover:text-tinta"
            >
              ✕
            </button>
          </div>

          {desglose.length === 0 ? (
            <p className="text-sm text-tinta-3">Ese día no tiene ninguna línea activa.</p>
          ) : (
            <ul className="mb-4 flex max-h-56 flex-col gap-1 overflow-y-auto">
              {desglose.map((linea) => {
                const elegida = lineaAMover === linea.taskId
                const fila = (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm text-tinta" title={linea.name}>
                      {linea.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-tinta-3">
                      {Math.round(linea.unitsBp / 100)} % · {minutosLegibles(linea.minutos)}
                    </span>
                  </>
                )
                // Sin permiso para tocar el cronograma no se ofrece mover, y la fila no finge ser
                // un botón: un control que no hace nada al pulsarlo es peor que no tenerlo.
                if (!onMover) {
                  return (
                    <li key={linea.taskId} className="flex items-baseline gap-3 px-1 py-0.5">
                      {fila}
                    </li>
                  )
                }
                return (
                  <li key={linea.taskId}>
                    <button
                      type="button"
                      aria-pressed={elegida}
                      onClick={() => {
                        setErrorAlMover(null)
                        setLineaAMover(elegida ? null : linea.taskId)
                      }}
                      className={`flex w-full items-baseline gap-3 rounded px-1 py-0.5 text-left hover:bg-superficie-3 ${
                        elegida ? 'bg-superficie-3 ring-1 ring-borde-fuerte' : ''
                      }`}
                    >
                      {fila}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {/* La mejora sobre la referencia (§8.4): enseñar la sobrecarga sin ofrecer nada para
              resolverla deja el problema donde estaba. */}
          <div className="border-t border-borde pt-3">
            <p className="mb-1.5 text-xs text-tinta-3">
              {onMover && lineaAMover !== null
                ? 'Mover esa línea a quién'
                : 'Quién tiene hueco ese día'}
            </p>
            {conHueco.length === 0 ? (
              <p className="text-sm text-tinta-3">Nadie del equipo tiene capacidad libre ese día.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {conHueco.slice(0, 8).map((candidato) => {
                  const etiqueta = (
                    <>
                      {candidato.resource.name}{' '}
                      <span className="tabular-nums text-tinta-3">
                        {minutosLegibles(candidato.libreMin)} libres
                      </span>
                    </>
                  )
                  const linea = desglose.find((l) => l.taskId === lineaAMover)
                  // Sin línea elegida el nombre es información, no un destino: convertirlo en botón
                  // obligaría a adivinar qué se mueve.
                  if (!onMover || !linea) {
                    return (
                      <li
                        key={candidato.resource.id}
                        className="rounded-lg border border-borde px-2.5 py-1 text-xs text-tinta-2"
                      >
                        {etiqueta}
                      </li>
                    )
                  }
                  return (
                    <li key={candidato.resource.id}>
                      <button
                        type="button"
                        disabled={moviendo}
                        aria-label={`Mover «${linea.name}» a ${candidato.resource.name}`}
                        onClick={async () => {
                          setMoviendo(true)
                          setErrorAlMover(null)
                          const motivo = await onMover({
                            taskId: linea.taskId,
                            desdeResourceId: celdaElegida.resourceId,
                            haciaResourceId: candidato.resource.id,
                            unitsBp: linea.unitsBp,
                          })
                          setMoviendo(false)
                          if (motivo) setErrorAlMover(motivo)
                          else setLineaAMover(null)
                        }}
                        className="rounded-lg border border-borde-fuerte bg-superficie-3/60 px-2.5 py-1 text-xs text-tinta hover:border-borde-fuerte hover:bg-superficie-3 disabled:opacity-50"
                      >
                        {etiqueta}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {errorAlMover !== null ? (
              <p role="alert" className="mt-2 text-sm text-red-300">
                {errorAlMover}
              </p>
            ) : null}
            {onMover && lineaAMover === null && desglose.length > 0 ? (
              <p className="mt-2 text-xs text-tinta-3">
                Elige una línea de arriba para poder movérsela a alguien.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FilaDeLaMatriz({
  clave,
  titulo,
  subtitulo,
  celdas,
  dias,
  modo,
  diasSobrecargados,
  destacada = false,
  apagada = false,
  desplegado = false,
  onDesplegar,
  onElegirCelda,
  onAbrirCalendario,
}: {
  readonly clave: string
  readonly titulo: string
  readonly subtitulo: string
  readonly celdas: readonly CeldaDeCarga[]
  readonly dias: readonly { readonly date: string; readonly isWorking: boolean }[]
  readonly modo: ModoDeCarga
  readonly diasSobrecargados: number
  readonly destacada?: boolean
  readonly apagada?: boolean
  readonly desplegado?: boolean
  readonly onDesplegar?: () => void
  readonly onElegirCelda?: (date: string) => void
  readonly onAbrirCalendario?: () => void
}) {
  return (
    <tr data-testid={`fila-${clave}`} className={destacada ? 'bg-[#1c1c20]' : ''}>
      <th
        scope="row"
        className={`sticky left-0 z-10 w-56 min-w-56 border-b border-r border-borde px-3 py-1.5 text-left font-normal ${
          destacada ? 'bg-[#1c1c20]' : 'bg-superficie'
        }`}
      >
        <div className="flex items-center gap-1.5">
          {onDesplegar ? (
            <button
              type="button"
              aria-label={desplegado ? `Plegar ${titulo}` : `Desplegar ${titulo}`}
              aria-expanded={desplegado}
              onClick={onDesplegar}
              className="shrink-0 rounded px-1 text-tinta-3 hover:bg-superficie-3 hover:text-tinta"
            >
              {desplegado ? '▾' : '▸'}
            </button>
          ) : (
            <span className="w-[18px] shrink-0" />
          )}
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-[13px] ${apagada ? 'text-tinta-3' : 'text-tinta'}`}
              title={titulo}
            >
              {titulo}
            </span>
            <span className="block truncate text-[11px] text-tinta-3">{subtitulo}</span>
          </span>
          {/* La puerta al calendario individual del recurso (§8.1): sin ella, las vacaciones
              existían en el modelo y no había forma de ponerlas. */}
          {onAbrirCalendario ? (
            <button
              type="button"
              aria-label={`Días libres de ${titulo}`}
              title={`Días libres de ${titulo}`}
              onClick={onAbrirCalendario}
              className="shrink-0 rounded px-1 text-xs text-tinta-3 hover:bg-superficie-3 hover:text-tinta-2"
            >
              🗓
            </button>
          ) : null}
          {/* El contador de días en rojo: el segundo canal, para que la sobrecarga no dependa del
              color de las celdas ni de recorrer noventa columnas con la vista. */}
          {diasSobrecargados > 0 ? (
            <span
              data-testid={`sobrecarga-${clave}`}
              title={`${diasSobrecargados} días sobrecargados en el periodo`}
              className="shrink-0 rounded px-1.5 py-0.5 text-[11px] tabular-nums"
              style={{ color: COLORES_DE_ESTADO.critico, backgroundColor: `${COLORES_DE_ESTADO.critico}22` }}
            >
              ⚠ {diasSobrecargados}
            </span>
          ) : null}
        </div>
      </th>

      {celdas.map((celda, i) => {
        const dia = dias[i]
        const texto = textoDeCelda(celda, modo)
        const fondo = apagada ? undefined : fondoDeCelda(celda)
        return (
          <td
            key={dia.date}
            data-testid={`celda-${clave}-${dia.date}`}
            data-sobrecargado={celda.sobrecargado ? 'sí' : 'no'}
            /**
             * Para quien escucha la pantalla, la frase entera en vez de la cifra suelta.
             *
             * Va en `aria-label` y no en un `<span className="sr-only">` a propósito: el añadido
             * invisible ensucia el texto de la celda —y con él cualquier prueba y cualquier copia al
             * portapapeles— mientras que la etiqueta **sustituye** lo que se anuncia, que aquí es lo
             * que se quiere: la cifra sola no dice de cuánto es, y «diez» no significa nada sin
             «sobre ocho».
             */
            aria-label={
              celda.cargaMin === 0
                ? undefined
                : `${dia.date}: ${minutosLegibles(celda.cargaMin)} de ${minutosLegibles(
                    celda.capacidadMin,
                  )}${celda.sobrecargado ? ', sobrecargada' : ''}`
            }
            /**
             * El título dice **la palabra**, no sólo los números (§9.3 C6, la mitad de accesibilidad).
             *
             * La celda sobrecargada llevaba tres señales —fondo rojo, cifra en rojo y negrita— y las
             * tres son visuales: decía «8 h de 8 h · 3 líneas» y en ningún sitio decía
             * **«sobrecargada»**. Quien no distingue el rojo tiene la negrita, que es sutil; quien
             * escucha la pantalla no tenía nada — había que restar dos cifras de cabeza para saberlo.
             *
             * Y el velo rojo, medido, da **1.29:1** contra el fondo oscuro y 1.48:1 contra el claro:
             * ninguno llega al 3:1 que necesita una señal que no es texto. O sea que el color nunca
             * fue una señal fuerte — lo que lo sostiene es la palabra.
             */
            title={
              celda.capacidadMin === 0 && celda.cargaMin > 0
                ? `${dia.date} · ${minutosLegibles(celda.cargaMin)} comprometidas en un día sin capacidad · SOBRECARGADA`
                : `${dia.date} · ${minutosLegibles(celda.cargaMin)} de ${minutosLegibles(celda.capacidadMin)} · ${celda.tareas} línea(s)${
                    celda.sobrecargado ? ' · SOBRECARGADA' : ''
                  }`
            }
            onClick={onElegirCelda ? () => onElegirCelda(dia.date) : undefined}
            className={`w-8 min-w-8 border-b border-borde/60 py-1.5 text-center tabular-nums ${
              dia.isWorking ? '' : 'bg-superficie'
            } ${onElegirCelda ? 'cursor-pointer hover:ring-1 hover:ring-inset hover:ring-borde-fuerte' : ''} ${
              celda.sobrecargado ? 'font-semibold' : ''
            } ${apagada ? 'text-tinta-3' : 'text-tinta'}`}
            style={fondo ? { backgroundColor: fondo } : undefined}
          >
            {celda.sobrecargado ? (
              <span style={{ color: COLORES_DE_ESTADO.critico }}>{texto}</span>
            ) : (
              texto
            )}
          </td>
        )
      })}
    </tr>
  )
}

/**
 * Una línea del desglose de un recurso.
 *
 * Va con sangría y en tono apagado: son sumandos de la fila de arriba, no filas de la matriz. Y
 * lleva su porcentaje al lado del nombre, que es de donde salen los minutos de cada celda —así se
 * puede comprobar la cuenta a ojo sin abrir nada más.
 */
function FilaDeDesgloseDeTarea({
  linea,
  dias,
  modo,
  jornadaMin,
  onAbrirDetalle,
}: {
  readonly linea: FilaDeDesglose
  readonly dias: readonly { readonly date: string; readonly isWorking: boolean }[]
  readonly modo: ModoDeCarga
  readonly jornadaMin: number
  /** Abrir el panel de detalle compartido (§10.3). */
  readonly onAbrirDetalle?: (id: string) => void
}) {
  return (
    <tr data-testid={`desglose-${linea.taskId}`} className="bg-[#141416]">
      <th
        scope="row"
        className="sticky left-0 z-10 w-56 min-w-56 border-b border-r border-borde bg-[#141416] py-1 pl-9 pr-3 text-left font-normal"
      >
        {/* El nombre abre el panel de detalle del §10.3 — el mismo de las otras cinco vistas.
            Aquí importa más que en ninguna: quien mira la carga ve que alguien está al 140 % y lo
            siguiente que necesita saber es de qué depende la línea que lo satura. */}
        {onAbrirDetalle ? (
          <button
            type="button"
            onClick={() => onAbrirDetalle(linea.taskId)}
            className="block max-w-full truncate text-left text-[12px] text-tinta-2 hover:text-tinta hover:underline"
            title={linea.name}
          >
            {linea.name}
          </button>
        ) : (
          <span className="block truncate text-[12px] text-tinta-2" title={linea.name}>
            {linea.name}
          </span>
        )}
        <span className="block text-[11px] tabular-nums text-tinta-3">
          {Math.round(linea.unitsBp / 100)} % · {minutosLegibles(linea.total)} en el periodo
        </span>
      </th>

      {linea.minutosPorDia.map((minutos, i) => {
        const dia = dias[i]
        const texto =
          minutos === 0
            ? ''
            : modo === 'tareas'
              ? '1'
              : modo === 'porcentaje'
                ? String(Math.round((minutos / jornadaMin) * 100))
                : Number.isInteger(minutos / 60)
                  ? String(minutos / 60)
                  : (minutos / 60).toFixed(1)

        return (
          <td
            key={dia.date}
            data-testid={`desglose-${linea.taskId}-${dia.date}`}
            data-minutos={minutos}
            title={`${linea.name} · ${dia.date} · ${minutosLegibles(minutos)}`}
            className={`w-8 min-w-8 border-b border-borde/60 py-1 text-center text-[11px] tabular-nums text-tinta-3 ${
              dia.isWorking ? '' : 'bg-[#0f0f11]'
            }`}
          >
            {texto}
          </td>
        )
      })}
    </tr>
  )
}

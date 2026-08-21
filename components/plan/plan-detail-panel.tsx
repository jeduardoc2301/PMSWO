/**
 * El detalle de una línea del plan.
 *
 * Es de presentación pura: recibe la línea ya trazada y sus vínculos, y los dibuja. No consulta el
 * motor ni calcula nada que no sea concordancia gramatical o traducir un código a palabras.
 *
 * Su trabajo real es de traducción. El motor habla en enumeraciones —`DECIDE_UN_TERCERO`,
 * `ENTREGA_CLIENTE`, `FS +3`— porque necesita precisión; quien mira el plan habla en español. Si una
 * de esas cadenas llega cruda a la pantalla, la pantalla dejó de estar escrita para quien la lee.
 * Hay una prueba que lo prohíbe explícitamente.
 */

import { MINUTOS_POR_JORNADA, comoTexto } from '@/lib/scheduling/unidades'
import { comoHora } from '@/lib/scheduling/reloj'
import { type GanttRow, linkLabel } from '@/lib/scheduling/gantt'
import { restriccion } from '@/lib/scheduling/restricciones'
import { CeldaEditable } from '@/components/plan/celda-editable'
import type { LinkType, Recoverability, TaskKind } from '@/lib/scheduling/types'

export interface PlanLink {
  readonly id: string
  readonly name: string
  readonly type: LinkType
  readonly lag: number
  /** El desfase en minutos laborables (§2.2), cuando el vínculo lo lleva. */
  readonly lagMin?: number
}

export interface PlanDetailPanelProps {
  readonly row: GanttRow
  /** De quién depende esta línea. */
  readonly predecessors: readonly PlanLink[]
  /** Quién la está esperando. */
  readonly successors: readonly PlanLink[]
  /**
   * Dónde está parada esta línea, de la raíz hacia abajo (§4.7).
   *
   * Opcional porque una línea de primer nivel no tiene ruta. Antes aquí iba `row.id`: un UUID de
   * treinta y seis caracteres en el sitio de la única frase que sitúa a quien abre el panel.
   */
  readonly ruta?: readonly string[]
  /** Saltar a otra línea del plan. */
  readonly onNavigate: (id: string) => void
  readonly onClose: () => void
  /**
   * Renombrar la línea desde aquí (§4.7: «Nombre de la tarea (editable inline)»).
   *
   * Opcional, y sin ella el nombre se dibuja como texto. No es prudencia: el panel lo montan las
   * seis vistas y no todas pueden escribir — el Panel de control entra por el widget de hitos, donde
   * lo que hay son cifras agregadas, y un campo editable ahí prometería algo que la vista no sabe
   * hacer.
   */
  readonly onRenombrar?: (id: string, nombre: string) => void
  /**
   * Capturar el avance desde aquí (§4.7).
   *
   * Se recibe de 0 a 1, como lo guarda el modelo, aunque se teclee en porcentaje: convertir en el
   * borde y no en cada llamador es lo que impide que una vista guarde 40 donde otra guarda 0,4.
   */
  readonly onAvance?: (id: string, progreso: number) => void
}

/** Cómo se llama cada clase de línea cuando se le dice a una persona. */
const CLASE: Readonly<Record<TaskKind, string>> = Object.freeze({
  ACTIVIDAD: 'Actividad',
  HITO: 'Hito',
  PUNTO_DE_CONTROL: 'Punto de control',
  APROBACION_CLIENTE: 'Aprobación del cliente',
  ENTREGA_CLIENTE: 'Entrega del cliente',
  COMPUERTA: 'Compuerta',
  RESUMEN: 'Resumen',
})

/**
 * Por qué una línea no se recupera con más gente, dicho en lenguaje de negocio.
 *
 * `RECUPERABLE` no aparece: cuando el atraso sí se recupera con recursos no hay nada que explicar, y
 * un bloque que dice «esto sí se puede acelerar» en cada tarea normal es ruido.
 */
const POR_QUE: Readonly<Record<Exclude<Recoverability, 'RECUPERABLE'>, string>> = Object.freeze({
  DECIDE_UN_TERCERO: 'Depende de una decisión o una firma, no de cuánta gente se ponga.',
  TIEMPO_TRANSCURRIDO: 'Es tiempo que tiene que pasar. Más gente no lo acorta.',
  FECHA_PACTADA: 'La fecha está acordada con terceros y moverla es otra negociación.',
})

/**
 * Por qué lo tecleado no es un avance, o `null` si lo es.
 *
 * Se admite la coma decimal y el signo de porcentaje: quien teclea «40 %» o «33,5» está diciendo algo
 * perfectamente claro, y rechazarlo por la forma es hacerle aprender el formato del campo.
 */
function porQueNoEsUnAvance(valor: string): string | null {
  const limpio = valor.replace('%', '').replace(',', '.').trim()
  if (limpio === '') return 'Escribe un porcentaje de 0 a 100.'
  const n = Number(limpio)
  if (!Number.isFinite(n)) return `«${valor}» no es un número.`
  if (n < 0 || n > 100) return 'El avance va de 0 a 100.'
  return null
}

/** Quién responde, dicho sin siglas. */
const PARTE: Readonly<Record<string, string>> = Object.freeze({
  PROVEEDOR: 'Nosotros',
  CLIENTE: 'El cliente',
  AMBOS: 'Las dos partes',
})

export function PlanDetailPanel({
  row,
  predecessors,
  successors,
  ruta,
  onNavigate,
  onClose,
  onRenombrar,
  onAvance,
}: PlanDetailPanelProps) {
  return (
    <section
      aria-labelledby="titulo-detalle-linea"
      className="flex flex-col gap-4 rounded-lg border border-borde bg-superficie p-5"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-tinta-2" data-testid="clase-linea">
            {CLASE[row.kind]}
          </p>
          {ruta !== undefined && ruta.length > 0 ? (
            <nav aria-label="Dónde está esta línea" data-testid="ruta-linea" className="mt-0.5">
              <p className="truncate text-xs text-tinta-3" title={ruta.join(" › ")}>
                {ruta.join(" › ")}
              </p>
            </nav>
          ) : null}
          <h3 id="titulo-detalle-linea" className="mt-1 text-base font-semibold text-tinta">
            {onRenombrar ? (
              // La misma celda que la rejilla y la Lista, no una copia: son las mismas reglas
              // —Enter guarda, Escape cancela, vacío se rechaza— y dos celdas editables que se
              // comportan distinto es peor que una sola en menos sitios.
              <CeldaEditable
                texto={row.name}
                valor={row.name}
                etiqueta={`Nombre de «${row.name}»`}
                validar={(v) => (v.trim().length === 0 ? 'El nombre no puede quedar vacío.' : null)}
                onGuardar={(v) => onRenombrar(row.id, v.trim())}
              />
            ) : (
              row.name
            )}
          </h3>
        </div>
        <button
          type="button"
          aria-label="Cerrar el detalle"
          onClick={onClose}
          className="shrink-0 rounded px-2 py-1 text-tinta-2 hover:bg-superficie-3 hover:text-tinta"
        >
          ✕
        </button>
      </header>

      <Dato titulo="Fechas" valor={fechas(row)} />
      <Dato titulo="Margen" valor={margen(row)} />
      {/* La libre solo se enseña cuando dice algo distinto de la total. Repetir la misma cifra con
          dos nombres no informa: entrena a no leerla. */}
      {row.freeFloat !== row.totalFloat ? (
        <Dato titulo="Margen sin molestar a nadie" valor={margenLibre(row)} />
      ) : null}
      {row.esfuerzo ? <Esfuerzo coherencia={row.esfuerzo} /> : null}
      {row.restriccion ? <Restriccion puesta={row.restriccion} /> : null}

      {row.recoverability !== 'RECUPERABLE' ? (
        <div data-testid="no-se-recupera" className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-xs uppercase tracking-wide text-red-300">No se recupera con más gente</p>
          <p className="mt-1 text-sm text-tinta-2">{POR_QUE[row.recoverability]}</p>
          {row.reason ? <p className="mt-1 text-xs text-tinta-2">{row.reason}</p> : null}
        </div>
      ) : null}

      <Dato titulo="Responde" valor={PARTE[row.party] ?? row.party} />
      {onAvance && !row.hasChildren ? (
        // Un resumen no captura avance: lo acumula de sus hijas (§3.6). Ofrecer el campo ahí sería
        // ofrecer un valor que el próximo cálculo pisa sin avisar.
        <div className="flex flex-col gap-0.5">
          <p className="text-xs uppercase tracking-wide text-tinta-2">Avance</p>
          <CeldaEditable
            texto={`${avance(row.progress)} %`}
            valor={String(avance(row.progress))}
            etiqueta={`Avance de «${row.name}», en porcentaje`}
            validar={porQueNoEsUnAvance}
            // Se teclea en porcentaje y se guarda de 0 a 1: convertir en el borde y no en cada
            // llamador es lo que impide que una vista guarde 40 donde otra guarda 0,4.
            onGuardar={(v) => onAvance(row.id, Number(v.replace(',', '.').replace('%', '').trim()) / 100)}
          />
        </div>
      ) : (
        <Dato
          titulo="Avance"
          valor={`${avance(row.progress)} %${row.hasChildren ? ' · se acumula de sus líneas' : ''}`}
        />
      )}

      <Vinculos
        titulo={`De quién depende (${predecessors.length})`}
        vacio="No depende de ninguna otra línea."
        vinculos={predecessors}
        onNavigate={onNavigate}
        prefijo="predecesora"
      />
      <Vinculos
        titulo={`Quién la espera (${successors.length})`}
        vacio="Nadie la está esperando."
        vinculos={successors}
        onNavigate={onNavigate}
        prefijo="sucesora"
      />
    </section>
  )
}

/**
 * Las fechas de la línea.
 *
 * Un hito no dice «del X al X»: eso confunde más de lo que informa. Dice su fecha y que no consume
 * calendario, que es lo que un hito significa.
 */
function fechas(row: GanttRow): string {
  if (row.isMilestone) return `${row.start} · no consume días`

  const dias = row.width === 1 ? '1 día hábil' : `${row.width} días hábiles`

  /**
   * Cuando la línea no encaja con la jornada, las horas van **dentro** de las fechas.
   *
   * Es el caso de una tarea de cuatro horas y el de una que empieza a media mañana porque su
   * vínculo trae dos horas de espera: esa segunda ocupa dos días de calendario y trabaja uno, así
   * que «Del 16 al 17 · 1 día hábil» se lee como una contradicción. Con las horas puestas —«Del 16
   * a las 11:00 al 17 a las 11:00»— deja de serlo, y de paso se ve por qué.
   */
  if (!row.alineadaConLaJornada) {
    const cuanto = row.duracionMin === undefined ? dias : `dura ${comoTexto(row.duracionMin)}`
    return `Del ${row.start} ${hora(row.comienzoInstante)} al ${row.finish} ${hora(row.finInstante)} · ${cuanto}`
  }

  return `Del ${row.start} al ${row.finish} · ${dias}`
}

/** La hora de un instante, sin la fecha: la fecha ya está dicha al lado. */
function hora(instante: number): string {
  return comoHora(instante).slice(11)
}

/**
 * El avance en porcentaje entero.
 *
 * Con una regla que no es cosmética: **solo dice 100 cuando de verdad está terminada**. Redondear
 * 0.998 a «100 %» le informa a quien lee que una línea cerró cuando no cerró, y esa línea sigue
 * empujando la fecha de cierre. Por debajo de uno se trunca; en uno exacto, cien.
 */
function avance(progress: number): number {
  if (progress >= 1) return 100
  return Math.min(99, Math.floor(progress * 100))
}

/** El margen dicho como lo diría una persona, no como un número con signo. */
function margen(row: GanttRow): string {
  if (row.totalFloat === 0) return 'Ninguno: cualquier atraso mueve el cierre'
  if (row.totalFloat < 0) {
    const tarde = Math.abs(row.totalFloat)
    return tarde === 1 ? '1 día tarde' : `${tarde} días tarde`
  }
  return row.totalFloat === 1 ? '1 día' : `${row.totalFloat} días`
}

/**
 * La holgura libre, dicha por lo que significa y no por su nombre técnico.
 *
 * «Holgura libre» no se entiende sin haber estudiado el método; «cuánto puedes atrasarte antes de
 * estropearle el día a alguien» sí. La cifra es la misma.
 */
function margenLibre(row: GanttRow): string {
  if (row.freeFloat <= 0) return 'Ninguno: atrasarla mueve a quien va detrás'
  return row.freeFloat === 1 ? '1 día' : `${row.freeFloat} días`
}

/** Horas legibles a partir de minutos. Se convierte aquí, donde ya no se vuelve a operar. */
function horas(minutos: number): string {
  const h = minutos / 60
  return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1)} h`
}

/**
 * El esfuerzo capturado, y si se sostiene con la duración y la gente asignada (§3.5).
 *
 * Cuando cuadra se dice y ya está. Cuando no, se dicen las dos cifras: sin las dos, «no cuadra» es
 * una acusación sin pruebas, y quien lo lee no puede decidir cuál de las tres cosas —las horas, los
 * días o la gente— es la que está mal. El sistema no puede saberlo; quien planifica, sí.
 */
function Esfuerzo({ coherencia }: { coherencia: NonNullable<GanttRow['esfuerzo']> }) {
  if (coherencia.cuadra) return <Dato titulo="Esfuerzo" valor={horas(coherencia.capturado)} />

  const sobra = coherencia.diferencia > 0
  return (
    <div className="flex flex-col gap-0.5" data-testid="esfuerzo-descuadra">
      <p className="text-xs uppercase tracking-wide text-amber-300">Esfuerzo · no cuadra</p>
      <p className="text-sm text-tinta">
        {horas(coherencia.capturado)} capturadas, y en estos días con esta gente caben{' '}
        {horas(coherencia.implicado)}.
      </p>
      <p className="text-xs text-tinta-2">
        {sobra
          ? 'Sobran horas: o la tarea dura más, o hace falta más gente, o las horas están de más.'
          : 'Faltan horas: o la tarea dura menos, o sobra gente, o las horas se quedaron cortas.'}
      </p>
    </div>
  )
}

/**
 * La restricción de fecha que alguien le puso (§3.4).
 *
 * Sólo aparece cuando hay una. Es la respuesta a «por qué esta línea no se mueve», que hasta aquí no
 * se podía contestar mirando: una línea clavada con «debe empezar el» se ve exactamente igual que
 * una que la cadena dejó ahí, y la diferencia decide qué hacer cuando el plan se atrasa.
 *
 * Se dice el nombre y debajo qué hace, no la sigla: quien lee un plan no tiene por qué saber que
 * `MSO` y `SNET` son cosas distintas, y aquí es donde importa que lo sepa.
 */
function Restriccion({ puesta }: { puesta: NonNullable<GanttRow['restriccion']> }) {
  const r = restriccion(puesta.tipo)
  // Un código que el catálogo no conoce se enseña tal cual en vez de esconderse: un dato guardado
  // que la pantalla no sabe leer tiene que verse, no desaparecer.
  if (!r) {
    return <Dato titulo="Restricción de fecha" valor={`${puesta.tipo}${puesta.fecha ? ` · ${puesta.fecha}` : ''}`} />
  }
  return (
    <div data-testid="restriccion-de-la-linea" className="flex flex-col gap-0.5">
      <p className="text-xs uppercase tracking-wide text-tinta-2">Restricción de fecha</p>
      <p className="text-sm text-tinta">
        {r.nombre}
        {puesta.fecha ? ` · ${puesta.fecha}` : ''}
      </p>
      <p className="text-xs text-tinta-2">{r.explicacion}</p>
    </div>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs uppercase tracking-wide text-tinta-2">{titulo}</p>
      <p className="text-sm text-tinta">{valor}</p>
    </div>
  )
}

/**
 * Una lista de vínculos.
 *
 * Cada renglón es un botón porque saltar de una línea a la de la que depende es la forma en que se
 * lee un plan: nadie mira una tarea aislada, mira la cadena que la empuja. Y cada renglón dice el
 * tipo de vínculo con su desfase, porque «depende de la 288» y «depende de la 288, tres días
 * después de que termine» son dos planes distintos.
 */
function Vinculos({
  titulo,
  vacio,
  vinculos,
  onNavigate,
  prefijo,
}: {
  titulo: string
  vacio: string
  prefijo: 'predecesora' | 'sucesora'
  vinculos: readonly PlanLink[]
  onNavigate: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs uppercase tracking-wide text-tinta-2">{titulo}</p>
      {vinculos.length === 0 ? (
        <p className="text-sm text-tinta-3">{vacio}</p>
      ) : (
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {vinculos.map((vinculo) => (
            <li key={`${vinculo.id}-${vinculo.type}-${vinculo.lag}`}>
              <button
                type="button"
                data-testid={`${prefijo}-${vinculo.id}`}
                onClick={() => onNavigate(vinculo.id)}
                className="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left hover:bg-superficie-3"
              >
                {/* El identificador ya no se enseña: es un UUID de treinta y seis caracteres y en un
                    panel de 320 px se comía el renglón entero antes de que empezara el nombre. El
                    comentario de arriba —«depende de la 288»— se escribió suponiendo un código corto
                    de plan; el modelo no tiene ninguno, así que lo que sitúa el vínculo es el nombre. */}
                <span className="min-w-0 flex-1 truncate text-sm text-tinta" title={vinculo.name}>
                  {vinculo.name}
                </span>
                <span className="shrink-0 text-xs text-tinta-2">{linkLabel(vinculo)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

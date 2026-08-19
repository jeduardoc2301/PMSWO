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

import { type GanttRow, linkLabel } from '@/lib/scheduling/gantt'
import type { LinkType, Recoverability, TaskKind } from '@/lib/scheduling/types'

export interface PlanLink {
  readonly id: string
  readonly name: string
  readonly type: LinkType
  readonly lag: number
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

/** Quién responde, dicho sin siglas. */
const PARTE: Readonly<Record<string, string>> = Object.freeze({
  PROVEEDOR: 'Nosotros',
  CLIENTE: 'El cliente',
  AMBOS: 'Las dos partes',
})

export function PlanDetailPanel({ row, predecessors, successors, ruta, onNavigate, onClose }: PlanDetailPanelProps) {
  return (
    <section
      aria-labelledby="titulo-detalle-linea"
      className="flex flex-col gap-4 rounded-lg border border-zinc-800 bg-[#18181b] p-5"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-zinc-400" data-testid="clase-linea">
            {CLASE[row.kind]}
          </p>
          {ruta !== undefined && ruta.length > 0 ? (
            <nav aria-label="Dónde está esta línea" data-testid="ruta-linea" className="mt-0.5">
              <p className="truncate text-xs text-zinc-500" title={ruta.join(" › ")}>
                {ruta.join(" › ")}
              </p>
            </nav>
          ) : null}
          <h3 id="titulo-detalle-linea" className="mt-1 text-base font-semibold text-zinc-100">
            {row.name}
          </h3>
        </div>
        <button
          type="button"
          aria-label="Cerrar el detalle"
          onClick={onClose}
          className="shrink-0 rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          ✕
        </button>
      </header>

      <Dato titulo="Fechas" valor={fechas(row)} />
      <Dato titulo="Margen" valor={margen(row)} />

      {row.recoverability !== 'RECUPERABLE' ? (
        <div data-testid="no-se-recupera" className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-xs uppercase tracking-wide text-red-300">No se recupera con más gente</p>
          <p className="mt-1 text-sm text-zinc-300">{POR_QUE[row.recoverability]}</p>
          {row.reason ? <p className="mt-1 text-xs text-zinc-400">{row.reason}</p> : null}
        </div>
      ) : null}

      <Dato titulo="Responde" valor={PARTE[row.party] ?? row.party} />
      <Dato titulo="Avance" valor={`${avance(row.progress)} %`} />

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
  return `Del ${row.start} al ${row.finish} · ${dias}`
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

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{titulo}</p>
      <p className="text-sm text-zinc-200">{valor}</p>
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
      <p className="text-xs uppercase tracking-wide text-zinc-400">{titulo}</p>
      {vinculos.length === 0 ? (
        <p className="text-sm text-zinc-500">{vacio}</p>
      ) : (
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {vinculos.map((vinculo) => (
            <li key={`${vinculo.id}-${vinculo.type}-${vinculo.lag}`}>
              <button
                type="button"
                data-testid={`${prefijo}-${vinculo.id}`}
                onClick={() => onNavigate(vinculo.id)}
                className="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left hover:bg-zinc-800"
              >
                {/* El identificador ya no se enseña: es un UUID de treinta y seis caracteres y en un
                    panel de 320 px se comía el renglón entero antes de que empezara el nombre. El
                    comentario de arriba —«depende de la 288»— se escribió suponiendo un código corto
                    de plan; el modelo no tiene ninguno, así que lo que sitúa el vínculo es el nombre. */}
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200" title={vinculo.name}>
                  {vinculo.name}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">{linkLabel(vinculo)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Los controles del plan.
 *
 * Es de presentación pura: no guarda estado, no calcula nada y no le pregunta nada al motor. Recibe
 * los cuatro valores que están puestos ahora y avisa el nuevo cuando alguien toca un botón. Quien
 * manda sobre el plan es quien monta esta barra, y por eso la barra se puede probar sin montar
 * proveedores ni base de datos.
 *
 * El primer control es el que importa. El plan de referencia tiene 1 368 líneas: verlas todas no es
 * ver el plan, es ver una lista. En «Bloques» quedan 27, y ese es el único movimiento que convierte
 * la pantalla en algo que alguien puede leer en una junta y decidir encima.
 */

// `React` en el ámbito porque este archivo usa `React.Fragment` de forma explícita.
import React from 'react'

import { type AxisScale, type GanttFilter, type LinkVisibility } from '@/lib/scheduling/gantt'
import { type ResponsibleParty } from '@/lib/scheduling/types'

export interface PlanControlsProps {
  /** Hasta qué profundidad se ve el árbol. 0 = solo bloques, 3 = todo abierto. */
  readonly level: number
  readonly onLevelChange: (level: number) => void
  readonly links: LinkVisibility
  readonly onLinksChange: (links: LinkVisibility) => void
  readonly filter: GanttFilter
  readonly onFilterChange: (filter: GanttFilter) => void
  readonly scale: AxisScale
  readonly onScaleChange: (scale: AxisScale) => void
  /** Cuántas líneas se están viendo y cuántas hay en total, para rotular. */
  readonly visibleRows: number
  readonly totalRows: number
}

/**
 * Los cuatro niveles, con el nombre que tienen en el plan y no con su número.
 *
 * «Nivel 2» no le dice nada a nadie; «Fases» sí, porque es la palabra con la que el plan está
 * escrito. El número queda en el código, que es donde sirve.
 */
const NIVELES: readonly { readonly value: number; readonly label: string }[] = [
  { value: 0, label: 'Bloques' },
  { value: 1, label: 'Etapas' },
  { value: 2, label: 'Fases' },
  { value: 3, label: 'Todo' },
]

const FLECHAS: readonly { readonly value: LinkVisibility; readonly label: string }[] = [
  { value: 'NINGUNO', label: 'Ninguna' },
  { value: 'SELECCION', label: 'De la selección' },
  { value: 'TODOS', label: 'Todas' },
]

/**
 * Solo dos escalas, y «Día» no está.
 *
 * Los 122 días hábiles del plan de referencia serían 122 columnas: no caben, y las que caben quedan
 * tan angostas que la fecha no se alcanza a leer. El motor sí admite `DIA` —un plan de dos semanas
 * se lee bien por día— pero esta barra es para el plan de un proyecto, y ofrecer una escala que
 * vuelve ilegible la pantalla es ofrecer una trampa.
 */
const ESCALAS: readonly { readonly value: AxisScale; readonly label: string }[] = [
  { value: 'MES', label: 'Mes' },
  { value: 'SEMANA', label: 'Semana' },
]

/** El eje «qué líneas» del filtro. La parte responsable es el otro eje y va aparte. */
type Naturaleza = 'SUPER' | 'HITOS'

// React 19 dejó de declarar el espacio de nombres `JSX` global, así que el tipo se nombra por su
// ruta actual. Es el mismo tipo de siempre.
export function PlanControls({
  level,
  onLevelChange,
  links,
  onLinksChange,
  filter,
  onFilterChange,
  scale,
  onScaleChange,
  visibleRows,
  totalRows,
}: PlanControlsProps): React.JSX.Element {
  const naturaleza = naturalezaDe(filter)
  const parte = filter.party ?? null
  // «Todo» se marca solo cuando de verdad no queda nada filtrado. Se mira también `onlyCritical`,
  // que esta barra no ofrece: marcar «Todo» con un filtro encendido sería mentir sobre lo que se ve.
  const sinFiltro = naturaleza === null && parte === null && filter.onlyCritical !== true

  /**
   * Por qué unos botones del filtro se apagan entre sí.
   *
   * Hay dos ejes y contestan preguntas distintas: **qué líneas** —todo, la ruta súper crítica, solo
   * hitos— y **quién responde** —el cliente o nosotros—. Dentro de un eje se excluyen: cruzar «ruta
   * súper crítica» con «solo hitos» contesta una pregunta que nadie hace, y cuando el cruce queda
   * vacío la pantalla se ve igual que un plan que no tiene ruta crítica. Entre ejes se combinan,
   * porque «qué de la ruta súper crítica depende del cliente» es la pregunta de todos los lunes.
   *
   * Tocar el botón activo lo apaga. Un filtro que solo se cambia por otro filtro obliga a adivinar
   * cuál era el estado sin filtro, y ese estado es el que se necesita para comparar.
   *
   * Lo que se avisa es el filtro completo, no un parche sobre el que había: lo que no aparezca aquí
   * queda apagado. Por eso un `onlyCritical` encendido desde otro lado se cae en cuanto alguien toca
   * esta barra — un filtro que no se ve y no se puede apagar es peor que ningún filtro.
   */
  const cambiarNaturaleza = (valor: Naturaleza): void =>
    onFilterChange(armarFiltro(naturaleza === valor ? null : valor, parte))
  const cambiarParte = (valor: ResponsibleParty): void =>
    onFilterChange(armarFiltro(naturaleza, parte === valor ? null : valor))

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-lg border border-[#27272a] bg-[#18181b] px-4 py-3">
      <Grupo titulo="Nivel de detalle">
        {NIVELES.map((opcion) => (
          // El nivel nunca se apaga: siempre hay una profundidad puesta, aunque sea la máxima.
          <Boton key={opcion.value} activo={level === opcion.value} onClick={() => onLevelChange(opcion.value)}>
            {opcion.label}
          </Boton>
        ))}
      </Grupo>

      <Grupo titulo="Flechas" nota="En un plan grande son miles.">
        {FLECHAS.map((opcion) => (
          <Boton key={opcion.value} activo={links === opcion.value} onClick={() => onLinksChange(opcion.value)}>
            {opcion.label}
          </Boton>
        ))}
      </Grupo>

      <Grupo titulo="Filtro">
        <Boton activo={sinFiltro} onClick={() => onFilterChange({})}>
          Todo
        </Boton>
        <Boton activo={naturaleza === 'SUPER'} onClick={() => cambiarNaturaleza('SUPER')}>
          Ruta súper crítica
        </Boton>
        <Boton activo={naturaleza === 'HITOS'} onClick={() => cambiarNaturaleza('HITOS')}>
          Solo hitos
        </Boton>
        <Boton activo={parte === 'CLIENTE'} onClick={() => cambiarParte('CLIENTE')}>
          Del cliente
        </Boton>
        <Boton activo={parte === 'PROVEEDOR'} onClick={() => cambiarParte('PROVEEDOR')}>
          Nuestro
        </Boton>
      </Grupo>

      <Grupo titulo="Escala">
        {ESCALAS.map((opcion) => (
          <Boton key={opcion.value} activo={scale === opcion.value} onClick={() => onScaleChange(opcion.value)}>
            {opcion.label}
          </Boton>
        ))}
      </Grupo>

      {/* Sin este rótulo, un filtro encendido se ve igual que un plan corto. */}
      <p className="ml-auto text-xs text-zinc-400">{rotuloDeConteo(visibleRows, totalRows)}</p>
    </div>
  )
}

/**
 * Un grupo de botones con su rótulo.
 *
 * Va en `fieldset` con `legend` porque así el rótulo visible es también el nombre accesible del
 * grupo, sin inventar identificadores que chocarían si la barra se monta dos veces en la pantalla.
 */
function Grupo({
  titulo,
  nota,
  children,
}: {
  titulo: string
  nota?: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1 p-0 text-[11px] uppercase tracking-wide text-zinc-400">{titulo}</legend>
      <div className="flex flex-wrap items-center gap-1">
        {children}
        {nota ? <span className="text-xs text-zinc-400">{nota}</span> : null}
      </div>
    </fieldset>
  )
}

/**
 * Un botón de la barra.
 *
 * Lleva `aria-pressed` en vez de ser un radio: el estado no viaja en ningún formulario, se avisa
 * hacia arriba en cuanto se toca, y así el activo se anuncia igual para quien lee la pantalla y para
 * quien la escucha.
 */
function Boton({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1] focus-visible:ring-offset-2 focus-visible:ring-offset-[#18181b] ${
        activo
          ? 'border-[#6366f1] bg-[#6366f1] text-zinc-100'
          : 'border-[#27272a] bg-[#111113] text-zinc-300 hover:border-[#6366f1] hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}

/** Qué eje «qué líneas» está encendido. La súper crítica manda si por error vinieran las dos. */
function naturalezaDe(filter: GanttFilter): Naturaleza | null {
  if (filter.onlySuperCritical === true) return 'SUPER'
  if (filter.onlyMilestones === true) return 'HITOS'
  return null
}

/** Arma el filtro completo con los dos ejes. Lo que no se pone aquí, queda apagado. */
function armarFiltro(naturaleza: Naturaleza | null, parte: ResponsibleParty | null): GanttFilter {
  const filtro: {
    onlySuperCritical?: boolean
    onlyMilestones?: boolean
    party?: ResponsibleParty
  } = {}
  if (naturaleza === 'SUPER') filtro.onlySuperCritical = true
  if (naturaleza === 'HITOS') filtro.onlyMilestones = true
  if (parte !== null) filtro.party = parte
  return filtro
}

/**
 * El separador de millares es un espacio fino que no se rompe.
 *
 * Un número partido al final del renglón se lee como dos números, y en esta barra el número es el
 * argumento: «27 de 1 368» es lo que justifica haber plegado el plan.
 */
const ESPACIO_FINO = ' '

function conMiles(valor: number): string {
  return String(Math.trunc(valor)).replace(/\B(?=(\d{3})+(?!\d))/g, ESPACIO_FINO)
}

/** La concordancia va con el total, que es el sustantivo que el número acompaña: «1 de 1 línea». */
function rotuloDeConteo(visibles: number, total: number): string {
  return `${conMiles(visibles)} de ${conMiles(total)} ${total === 1 ? 'línea' : 'líneas'}`
}

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

import { ConfiguracionDeExportacion } from './configuracion-de-exportacion'
import { type AxisScale, type GanttFilter, type LinkVisibility } from '@/lib/scheduling/gantt'
import { type IsoDate } from '@/lib/scheduling/date'
import { type ResponsibleParty } from '@/lib/scheduling/types'

export interface PlanControlsProps {
  /** Hasta qué profundidad se ve el árbol. 0 = solo bloques. */
  readonly level: number
  /**
   * La profundidad real del plan que se está mirando. Es el valor del botón «Todo».
   *
   * Estaba fijo en 3, y «Todo» enseñaba 1051 de las 1368 líneas del plan de referencia: las 317 que
   * viven por debajo del nivel 3 quedaban plegadas para siempre. Entre ellas, las seis entregas del
   * banco que el propio informe ejecutivo nombra como lo que más arrastra el plan —una de ellas
   * detiene 797 líneas—. Un botón que dice «Todo» tiene que enseñar todo.
   */
  readonly nivelMaximo: number
  readonly onLevelChange: (level: number) => void
  readonly links: LinkVisibility
  readonly onLinksChange: (links: LinkVisibility) => void
  /** Resaltar las líneas vencidas y sin terminar (§4.6, conmutador 2). */
  readonly atrasadas: boolean
  /** Cuántas líneas del plan están atrasadas ahora mismo. */
  readonly cuantasAtrasadas: number
  /** Cuántas líneas de trabajo caen dentro del corte puesto. Cero si no hay corte. */
  readonly cuantasEnElCorte: number
  /**
   * Quién aparece en el plan y con cuántas líneas cada uno.
   *
   * Llega calculado en vez de deducirse aquí de las tareas: esta barra no las tiene, y la lista
   * tiene que salir de la misma función que después decide el filtro. Una lista construida aparte
   * podría ofrecer a alguien que el filtro luego no encuentra.
   */
  readonly responsables?: readonly { readonly nombre: string; readonly clave: string; readonly cuantas: number }[]
  /**
   * El proyecto que se está mirando, para poder descargar su plan.
   *
   * Opcional porque esta barra también se monta sobre planes que aún no existen en la base —una
   * plantilla en vista previa, por ejemplo—, y ahí no hay nada que descargar. Sin él, el grupo de
   * exportar sencillamente no aparece; ofrecer un botón que da 404 es peor que no ofrecerlo.
   */
  readonly idDelProyecto?: string
  /**
   * Qué se lleva la exportación: los identificadores del filtro, o `null` para el plan entero.
   *
   * Llega ya calculado en vez de resolverse aquí porque quien sabe qué líneas sobreviven al filtro
   * es el motor que dibuja el Gantt, no esta barra de botones.
   */
  readonly paraExportar?: { readonly ids: string[] | null; readonly cuantas: number }
  /** Conmutador 3 del §4.6, mitad «ruta crítica»: barras críticas en rojo. */
  readonly rutaCritica: boolean
  readonly onRutaCriticaChange: (valor: boolean) => void
  /** Conmutador 3 del §4.6, mitad «reserva»: columnas de holgura y sombra tras cada barra. */
  readonly reserva: boolean
  readonly onReservaChange: () => void
  readonly onAtrasadasChange: (activo: boolean) => void
  /** Selección múltiple (§4.6, conmutador 1). */
  readonly seleccionando: boolean
  readonly onSeleccionandoChange: (activo: boolean) => void
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
const NIVELES_FIJOS: readonly { readonly value: number; readonly label: string }[] = [
  { value: 0, label: 'Bloques' },
  { value: 1, label: 'Etapas' },
  { value: 2, label: 'Fases' },
]

/** Los cuatro botones, con «Todo» apuntando a lo hondo que de verdad llegue este plan. */
function nivelesDe(nivelMaximo: number): readonly { readonly value: number; readonly label: string }[] {
  return [...NIVELES_FIJOS.filter((n) => n.value < nivelMaximo), { value: nivelMaximo, label: 'Todo' }]
}

const FLECHAS: readonly { readonly value: LinkVisibility; readonly label: string }[] = [
  { value: 'NINGUNO', label: 'Ninguna' },
  { value: 'SELECCION', label: 'De la selección' },
  { value: 'TODOS', label: 'Todas' },
]

/**
 * Las cinco escalas del §4.3 que este motor puede dibujar.
 *
 * Hubo dos, y el motivo escrito aquí era: «los 122 días hábiles del plan serían 122 columnas, y las
 * que caben quedan tan angostas que la fecha no se alcanza a leer». La observación era correcta y
 * el diagnóstico no: **lo ilegible no era la escala, era la cabecera de una sola fila**. Con la
 * fila de arriba diciendo el mes, la de abajo sólo tiene que decir «15» — y con el ancho de día
 * atado al zoom, cambiar de escala acerca y aleja de verdad en vez de repartir la misma anchura en
 * trozos distintos.
 *
 * La sexta —hora— estuvo fuera mientras fue verdad que ninguna tarea tenía nada por debajo del día:
 * un eje por horas habría dibujado ocho columnas idénticas por jornada y todas las barras pegadas
 * al límite del día. Dejó de serlo cuando la duración empezó a guardarse en minutos (§2): una tarea
 * de cuatro horas mide media columna y el eje enseña dónde cae. El comentario que decía «no puede
 * estar» era cierto cuando se escribió y falso desde el día siguiente, que es como envejecen los
 * comentarios que explican una ausencia.
 */
const ESCALAS: readonly { readonly value: AxisScale; readonly label: string }[] = [
  { value: 'HORA', label: 'Hora' },
  { value: 'DIA', label: 'Día' },
  { value: 'SEMANA', label: 'Semana' },
  { value: 'MES', label: 'Mes' },
  { value: 'TRIMESTRE', label: 'Trimestre' },
  { value: 'ANIO', label: 'Año' },
]

/** El eje «qué líneas» del filtro. La parte responsable es el otro eje y va aparte. */
type Naturaleza = 'SUPER' | 'HITOS'

// React 19 dejó de declarar el espacio de nombres `JSX` global, así que el tipo se nombra por su
// ruta actual. Es el mismo tipo de siempre.
export function PlanControls({
  level,
  nivelMaximo,
  onLevelChange,
  links,
  onLinksChange,
  atrasadas,
  cuantasAtrasadas,
  cuantasEnElCorte,
  responsables,
  idDelProyecto,
  paraExportar,
  rutaCritica,
  onRutaCriticaChange,
  reserva,
  onReservaChange,
  onAtrasadasChange,
  seleccionando,
  onSeleccionandoChange,
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
  const soloAtrasadas = filter.onlyOverdue === true
  const hasta = filter.hasta ?? null
  const sinFiltro =
    naturaleza === null &&
    parte === null &&
    !soloAtrasadas &&
    hasta === null &&
    (filter.responsables ?? []).length === 0 &&
    filter.onlyCritical !== true

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
    onFilterChange(armarFiltro(filter, naturaleza === valor ? null : valor, parte, soloAtrasadas, hasta))
  const cambiarParte = (valor: ResponsibleParty): void =>
    onFilterChange(armarFiltro(filter, naturaleza, parte === valor ? null : valor, soloAtrasadas, hasta))
  const cambiarAtrasadas = (): void =>
    onFilterChange(armarFiltro(filter, naturaleza, parte, !soloAtrasadas, hasta))
  const cambiarHasta = (valor: IsoDate | null): void =>
    onFilterChange(armarFiltro(filter, naturaleza, parte, soloAtrasadas, valor))

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-lg border border-borde bg-superficie px-4 py-3">
      <Grupo titulo="Nivel de detalle">
        {nivelesDe(nivelMaximo).map((opcion) => (
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

      <Grupo titulo="Selección" nota="Para operar sobre varias.">
        {/* Apagarlo esconde las casillas y CONSERVA lo marcado: quien apaga para ver mejor el
            diagrama y vuelve a encender espera sus líneas donde las dejó. */}
        <Boton activo={seleccionando} onClick={() => onSeleccionandoChange(!seleccionando)}>
          {seleccionando ? 'Activa' : 'Múltiple'}
        </Boton>
      </Grupo>

      <Grupo titulo="Atrasadas" nota="Vencidas y sin terminar.">
        {/* Resalta, no filtra. El §4.6 lo llama conmutador y no filtro por una razón: lo que importa
            de una tarea atrasada es dónde cae respecto de las demás, y sacar el resto de la pantalla
            esconde justo eso.

            La cifra va en la etiqueta por dos motivos. El primero es para quien lo usa: saber que
            son 127 antes de pulsar es lo que decide si vale la pena mirarlas, y con el diagrama
            virtualizado no hay forma de contarlas a ojo. El segundo es que el §9.3 pide que esta
            cifra coincida **exactamente** con la del Panel de control, y un número que no se puede
            leer en pantalla no se puede comprobar en pantalla. */}
        <Boton activo={atrasadas} onClick={() => onAtrasadasChange(!atrasadas)}>
          <span data-cuenta-atrasadas={cuantasAtrasadas}>
            {atrasadas ? 'Resaltadas' : 'Resaltar'}
            {cuantasAtrasadas > 0 ? ` (${cuantasAtrasadas})` : ''}
          </span>
        </Boton>
      </Grupo>

      {/* El conmutador 3 del §4.6: dos casillas **independientes**. El spec las pone en un submenú;
          aquí van sueltas porque son dos y esconderlas tras un menú cuesta un clic más que leerlas.

          Están juntas porque se leen juntas: con la ruta crítica se ve qué manda la fecha de cierre
          y con la reserva cuánto margen tiene lo demás. Y son independientes de verdad —cada una
          hace su cosa— porque mirar el margen de un plan y mirar qué lo aprieta son dos preguntas.

          La reserva mueve además sus dos columnas: el §4.6 lo dice en una frase —«añade las
          columnas Total float y Free float, y dibuja la holgura como sombra»— y es una elección,
          no dos. */}
      <Grupo titulo="Ruta crítica" nota="Qué manda la fecha y cuánto margen queda.">
        <Boton activo={rutaCritica} onClick={() => onRutaCriticaChange(!rutaCritica)}>
          {rutaCritica ? 'En rojo' : 'Sin colorear'}
        </Boton>
        <Boton activo={reserva} onClick={onReservaChange}>
          {reserva ? 'Con reserva' : 'Reserva'}
        </Boton>
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
        {/* Tercer eje, independiente de los otros dos: «qué de la ruta súper crítica está atrasado»
            es una pregunta que se hace, y excluirlo de los demás la dejaría sin contestar.

            Va aquí y no en el grupo «Atrasadas» para que «Todo» siga diciendo la verdad: un filtro
            encendido fuera de este grupo se vería igual que un plan corto. El conmutador de allá
            sigue resaltando, que contesta otra pregunta —dónde caen respecto de las demás— y por eso
            los dos conviven en vez de sustituirse. */}
        <Boton activo={soloAtrasadas} onClick={cambiarAtrasadas}>
          <span data-cuenta-atrasadas-filtro={cuantasAtrasadas}>
            Solo atrasadas{cuantasAtrasadas > 0 ? ` (${cuantasAtrasadas})` : ''}
          </span>
        </Boton>
      </Grupo>

      {/* El corte: hasta cuándo se está preguntando.

          Va en su propio grupo y no entre los botones del Filtro porque es un **valor**, no un
          interruptor: un campo metido en una fila de conmutadores se lee como uno más y no se
          entiende que espera algo escrito.

          Lo que deja no es «lo que termina antes de la fecha» sino «lo que hay que trabajar para
          llegar a ella»: una línea que arranca antes y cierra después también cuenta, y lo atrasado
          también, porque sigue siendo trabajo pendiente para cualquier fecha futura.

          La cifra va al lado y no dentro del campo porque el campo ya dice una fecha, y dos números
          en el mismo control se confunden. */}
      <Grupo titulo="Hasta" nota="Lo que hay que trabajar para esa fecha.">
        <input
          type="date"
          aria-label="Fecha de corte"
          value={hasta ?? ''}
          onChange={(evento) => cambiarHasta(evento.target.value === '' ? null : evento.target.value)}
          className="rounded border border-borde-fuerte bg-superficie px-2 py-1 text-xs text-tinta"
        />
        {hasta !== null ? (
          <>
            <span data-cuenta-en-el-corte={cuantasEnElCorte} className="text-xs text-tinta-2">
              {conMiles(cuantasEnElCorte)} {cuantasEnElCorte === 1 ? 'línea' : 'líneas'}
            </span>
            <Boton activo={false} onClick={() => cambiarHasta(null)}>
              Quitar
            </Boton>
          </>
        ) : null}
      </Grupo>

      {/* Quién lleva la línea.

          Va aquí por la misma razón que el corte: es un **valor** que se elige de una lista, no un
          conmutador. Con cinco personas cabrían como botones; con treinta, no, y el plan que las
          traiga no tiene por qué ser peor de usar.

          Sale de `responsablesDelPlan`, que es la misma función que consulta el filtro: así la lista
          no puede ofrecer a alguien que luego no aparezca. Y cada nombre lleva su carga, porque
          «Bryan (152)» dice algo que «Bryan» no dice. */}
      {responsables && responsables.length > 0 ? (
        <Grupo titulo="Responsable" nota="Quién lleva cada línea.">
          <PanelDeResponsables
            gente={responsables}
            elegidos={filter.responsables ?? []}
            onCambio={(claves) =>
              onFilterChange({ ...filter, responsables: claves.length === 0 ? undefined : claves })
            }
          />
        </Grupo>
      ) : null}

      <Grupo titulo="Escala">
        {ESCALAS.map((opcion) => (
          <Boton key={opcion.value} activo={scale === opcion.value} onClick={() => onScaleChange(opcion.value)}>
            {opcion.label}
          </Boton>
        ))}
      </Grupo>

      {idDelProyecto ? (
        <Grupo
          titulo="Exportar"
          nota={
            paraExportar?.ids
              ? `Las ${paraExportar.cuantas} líneas del filtro, con su jerarquía.`
              : 'El plan entero, con su jerarquía.'
          }
        >
          <BotonDeExcel idDelProyecto={idDelProyecto} lineas={paraExportar?.ids ?? null} />
          {/* Quien no puede cambiarla la ve igual, en sólo lectura: el diálogo lo pregunta a la
              ruta, que es quién decide. Esconderla dejaría a quien recibe el archivo sin poder
              averiguar por qué está pintado así. */}
          <ConfiguracionDeExportacion idDelProyecto={idDelProyecto} />
        </Grupo>
      ) : null}

      {/* Sin este rótulo, un filtro encendido se ve igual que un plan corto. */}
      <p className="ml-auto text-xs text-tinta-2">{rotuloDeConteo(visibleRows, totalRows)}</p>
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
      <legend className="mb-1 p-0 text-[11px] uppercase tracking-wide text-tinta-2">{titulo}</legend>
      <div className="flex flex-wrap items-center gap-1">
        {children}
        {nota ? <span className="text-xs text-tinta-2">{nota}</span> : null}
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
/**
 * Descarga el plan como libro de Excel.
 *
 * Vive aquí —en el Timeline— y no en la lista de Elementos de trabajo porque lo que baja es **el
 * plan**: la jerarquía completa, con sus niveles plegables y sus fórmulas. La lista exportaba lo
 * que la tabla dibujaba, que es otra cosa y se quedaba plana.
 *
 * La descarga se hace con `fetch` y no con un enlace directo porque la ruta va autenticada y hay
 * que poder enseñar el error: un `<a href>` que recibe un 403 deja al navegador enseñando una
 * página de JSON, y quien lo ve no sabe si el archivo salió mal o no salió.
 */
function BotonDeExcel({
  idDelProyecto,
  lineas,
}: {
  idDelProyecto: string
  lineas: string[] | null
}) {
  const [bajando, setBajando] = React.useState(false)

  const bajar = async (): Promise<void> => {
    setBajando(true)
    try {
      const respuesta = await fetch(`/api/v1/projects/${idDelProyecto}/export/xlsx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sin lista, el servidor manda el plan entero. Con ella, exactamente esas líneas: es lo
        // que hace que el archivo y la pantalla digan lo mismo.
        body: JSON.stringify(lineas ? { lineas } : {}),
      })
      if (!respuesta.ok) {
        const detalle = await respuesta.json().catch(() => null)
        throw new Error(detalle?.message ?? 'No se pudo generar el archivo.')
      }

      const nombre = /filename="([^"]+)"/.exec(respuesta.headers.get('Content-Disposition') ?? '')?.[1]
      const url = URL.createObjectURL(await respuesta.blob())
      const enlace = document.createElement('a')
      enlace.href = url
      enlace.download = nombre ?? 'plan.xlsx'
      enlace.click()
      // Sin esto el archivo se queda retenido en memoria hasta recargar la página.
      URL.revokeObjectURL(url)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo generar el archivo.')
    } finally {
      setBajando(false)
    }
  }

  return (
    <button
      type="button"
      data-testid="exportar-plan-excel"
      onClick={() => void bajar()}
      disabled={bajando}
      title={
        lineas
          ? 'Descarga en Excel lo que el filtro deja, con su jerarquía y el avance que se recalcula'
          : 'Descarga el plan completo en Excel, con jerarquía plegable y avance que se recalcula'
      }
      className="rounded-md border border-borde bg-superficie px-3 py-1.5 text-sm text-tinta-2 transition-colors hover:border-acento hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1] focus-visible:ring-offset-2 focus-visible:ring-offset-superficie disabled:cursor-not-allowed disabled:opacity-50"
    >
      {bajando ? 'Generando…' : 'Excel'}
    </button>
  )
}

/**
 * Elegir a una o varias personas.
 *
 * Un panel de casillas y no un desplegable: elegir a dos personas en un `select` obliga a
 * arrastrar con la tecla puesta, que casi nadie descubre. Y no botones sueltos en la barra,
 * porque cinco caben y treinta no.
 *
 * El botón dice a quién hay puesto sin abrirlo: con uno, su nombre; con varios, cuántos. Un
 * control que sólo dice «Responsable» obliga a abrirlo para saber si está filtrando.
 */
function PanelDeResponsables({
  gente,
  elegidos,
  onCambio,
}: {
  gente: readonly { readonly nombre: string; readonly clave: string; readonly cuantas: number }[]
  elegidos: readonly string[]
  onCambio: (claves: string[]) => void
}) {
  const [abierto, setAbierto] = React.useState(false)
  const caja = React.useRef<HTMLDivElement | null>(null)

  // Cerrar al pinchar fuera, como el panel de Campos: un menú que tapa el plan y sólo se cierra
  // por su propio botón obliga a apuntar de vuelta a un sitio concreto para seguir leyendo.
  React.useEffect(() => {
    if (!abierto) return
    const alPinchar = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', alPinchar)
    return () => document.removeEventListener('mousedown', alPinchar)
  }, [abierto])

  const puestos = new Set(elegidos)
  const alternar = (clave: string) => {
    const siguiente = new Set(puestos)
    if (siguiente.has(clave)) siguiente.delete(clave)
    else siguiente.add(clave)
    // En el orden de la lista, no en el de los clics: así dos personas dan el mismo filtro se
    // marquen como se marquen, y el archivo exportado sale igual.
    onCambio(gente.filter((g) => siguiente.has(g.clave)).map((g) => g.clave))
  }

  const rotulo =
    elegidos.length === 0
      ? 'Todos'
      : elegidos.length === 1
        ? (gente.find((g) => g.clave === elegidos[0])?.nombre ?? '1')
        : `${elegidos.length} personas`

  return (
    <div ref={caja} className="relative flex items-center gap-2">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        data-testid="boton-responsables"
        onClick={() => setAbierto((v) => !v)}
        className="max-w-[14rem] truncate rounded border border-borde-fuerte bg-superficie px-2 py-1 text-xs text-tinta-2 hover:bg-superficie-3"
      >
        {rotulo} ▾
      </button>

      {elegidos.length > 0 ? (
        <Boton activo={false} onClick={() => onCambio([])}>
          Quitar
        </Boton>
      ) : null}

      {abierto ? (
        <div
          role="menu"
          aria-label="Responsables"
          data-testid="panel-responsables"
          className="absolute left-0 top-full z-40 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-borde bg-superficie p-2 shadow-xl"
        >
          {gente.map((g) => (
            <label
              key={g.clave}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-superficie-3"
            >
              <input
                type="checkbox"
                checked={puestos.has(g.clave)}
                onChange={() => alternar(g.clave)}
                className="h-3.5 w-3.5 accent-[#6366f1]"
              />
              <span className="flex-1 truncate text-xs text-tinta-2">{g.nombre}</span>
              {/* La carga de cada uno: «Bryan (152)» dice algo que «Bryan» no dice. */}
              <span className="shrink-0 text-[11px] text-tinta-3">{conMiles(g.cuantas)}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}

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
      className={`rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1] focus-visible:ring-offset-2 focus-visible:ring-offset-superficie ${
        activo
          ? 'border-acento-relleno bg-acento-relleno text-sobre-acento'
          : 'border-borde bg-superficie text-tinta-2 hover:border-acento hover:text-tinta'
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

/**
 * Arma el filtro con los cuatro ejes que manejan estos botones.
 *
 * La regla es: **se conserva lo que esta barra sabe enseñar y apagar; se cae lo demás.**
 *
 * Los cuatro que recibe se construyen desde cero porque se apagan entre sí y hace falta poder
 * dejarlos todos en blanco. Las personas elegidas no llegan por parámetro pero sí tienen su
 * panel, así que se arrastran: arrancar de un objeto vacío las borraba, y elegir a Bryan y
 * pulsar después «Solo atrasadas» dejaba el plan entero atrasado y a Bryan fuera — con su
 * casilla todavía marcada, porque nadie le dijo al panel que había perdido la selección.
 *
 * Y lo que la barra NO ofrece — hoy, `onlyCritical` — sigue cayéndose a propósito, y ese es el
 * motivo de que esto no sea un `{ ...base }` a secas. Un filtro que no se ve y no se puede apagar
 * deja la pantalla recortada sin explicación; que se caiga al tocar cualquier botón es la única
 * salida que le queda a quien lo tiene puesto.
 */
function armarFiltro(
  base: GanttFilter,
  naturaleza: Naturaleza | null,
  parte: ResponsibleParty | null,
  soloAtrasadas: boolean,
  hasta: IsoDate | null,
): GanttFilter {
  const filtro: {
    onlySuperCritical?: boolean
    onlyMilestones?: boolean
    party?: ResponsibleParty
    onlyOverdue?: boolean
    hasta?: IsoDate
    responsables?: readonly string[]
  } = {}
  // Lo que la barra ofrece y no llega por parámetro. Al añadir un eje con control propio, su
  // sitio es esta línea.
  if (base.responsables !== undefined) filtro.responsables = base.responsables
  if (naturaleza === 'SUPER') filtro.onlySuperCritical = true
  if (naturaleza === 'HITOS') filtro.onlyMilestones = true
  if (parte !== null) filtro.party = parte
  if (soloAtrasadas) filtro.onlyOverdue = true
  if (hasta !== null) filtro.hasta = hasta
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

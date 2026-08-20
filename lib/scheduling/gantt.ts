/**
 * El trazado del Gantt.
 *
 * Este módulo no dibuja: calcula **dónde va cada cosa** y devuelve geometría en unidades de día
 * hábil. Quien pinta decide cuántos píxeles mide un día; aquí no se sabe ni hace falta. Eso es lo
 * que permite probar el trazado entero sin montar un navegador.
 *
 * ## Por qué existe, si ya hay una línea de tiempo
 *
 * La que hay inventa las fechas que faltan: parte la ventana del proyecto entre el número de fases y
 * desplaza cada barra con un factor pseudoaleatorio. Es decoración. Un Gantt que no sale del plan no
 * es un Gantt, es un dibujo con forma de Gantt, y la diferencia se nota el día que alguien toma una
 * decisión mirándolo.
 *
 * ## Cuatro reglas, y por qué cada una
 *
 * **1 · Cada tipo de vínculo se ancla donde de verdad amarra.** Un `FF` amarra los dos finales; un
 * `SS`, los dos comienzos. Dibujarlos a todos como si fueran `FS` —de fin a comienzo— es cómodo y
 * es mentira. En el plan de referencia serían 159 flechas mintiendo sobre qué amarra qué, que es
 * justo lo que alguien va a mirar cuando pregunte por qué una tarea no se puede adelantar.
 *
 * **2 · La barra se mide en días hábiles.** Si el ancho se mide en días de calendario, una tarea de
 * cinco días que cruza un fin de semana se ve un 40 % más larga que otra de cinco días que no lo
 * cruza. Las dos duran lo mismo. Todo el resto del sistema habla de días hábiles; el dibujo también.
 *
 * **3 · El desfase se dibuja, no se pierde.** El vínculo lleva su desfase con signo y el trazado
 * expone dónde ponerlo. Un vínculo con quince días de espera y otro sin espera no son la misma
 * flecha, y son 394 los que tienen desfase en el plan de referencia.
 *
 * **4 · Al plegar un resumen, sus flechas se pliegan con él.** No desaparecen: se reanclan al
 * ancestro visible y se cuentan. Es lo que vuelve legible un plan de 1 660 vínculos, porque decenas
 * de flechas entre dos bloques se convierten en una sola que dice cuántas representa.
 */

import { esClaseDeHito } from '@/lib/scheduling/kinds'

import { type WorkCalendar } from './calendar'
import { type ClassifiedTask } from './critical-path'
import { type DayNumber, type IsoDate, toDayNumber, toIsoDate } from './date'
import { type Schedule } from './schedule'
import { type Coherencia, comprobarCoherencia } from './effort'
import { fechasDeResumen } from './summary-rollup'
import { estaTerminada } from '@/lib/urgency'
import { numerarPlan } from './wbs'
import { type Dependency, type LinkType, type PlanTask, type Recoverability, type ResponsibleParty, type TaskKind } from './types'

/** De qué extremo de una barra sale o entra una flecha. */
export type Anchor = 'INICIO' | 'FIN'

/**
 * Dónde amarra cada tipo de vínculo.
 *
 * Esta tabla es la regla 1 escrita una sola vez. El `FS` sale del fin y entra al comienzo; el `SS`
 * une los dos comienzos; el `FF`, los dos finales; el `SF` sale del comienzo de la predecesora y
 * entra al fin de la sucesora.
 */
export const LINK_ANCHORS: Readonly<Record<LinkType, { readonly from: Anchor; readonly to: Anchor }>> =
  Object.freeze({
    FS: Object.freeze({ from: 'FIN' as const, to: 'INICIO' as const }),
    SS: Object.freeze({ from: 'INICIO' as const, to: 'INICIO' as const }),
    FF: Object.freeze({ from: 'FIN' as const, to: 'FIN' as const }),
    SF: Object.freeze({ from: 'INICIO' as const, to: 'FIN' as const }),
  })

export interface GanttRow {
  readonly id: string
  readonly name: string
  /** Profundidad en el árbol. Cero es raíz. */
  readonly level: number
  readonly isSummary: boolean
  readonly hasChildren: boolean
  readonly isCollapsed: boolean
  readonly kind: TaskKind
  readonly party: ResponsibleParty

  readonly start: IsoDate
  readonly finish: IsoDate
  readonly isMilestone: boolean

  /**
   * Comienzo de la barra, en días hábiles desde el arranque del plan. Cero es el primer día.
   *
   * No es un píxel ni una fecha: es una coordenada de rejilla. Quien pinta multiplica por el ancho
   * que haya elegido para un día.
   */
  readonly x: number
  /** Ancho de la barra en días hábiles. Un hito mide cero. */
  readonly width: number

  /**
   * Dónde empezaba y cuánto medía esta línea según la foto, si hay una puesta.
   *
   * Se calcula aquí, en las mismas unidades que `x` y `width`, para que la vista no tenga que
   * convertir fechas a posiciones: es la única aritmética que se le pidió no hacer.
   *
   * `undefined` cuando no hay foto, o cuando la línea no estaba en ella —una línea nueva no tiene
   * contra qué compararse, y dibujarle una barra fantasma en el día cero sería inventarse un
   * compromiso que nadie hizo—.
   */
  readonly baseX?: number
  readonly baseWidth?: number
  /** Días hábiles que se corrió el arranque contra la foto. Positivo es más tarde. */
  readonly baseDrift?: number
  /**
   * Las fechas que tenía la línea en la foto, tal cual (§4.6 conmutador 4).
   *
   * La barra de debajo enseña **dónde** estaba; esto enseña **cuándo**, que es lo que hace falta
   * para escribirlo en un correo. Van como fecha civil y no como ordinal porque quien las lee no
   * piensa en días hábiles desde el arranque del proyecto.
   */
  readonly baseStart?: IsoDate
  readonly baseFinish?: IsoDate
  /** Días hábiles que se corrió el **cierre** contra la foto. Positivo es más tarde. */
  readonly baseFinishDrift?: number

  readonly totalFloat: number
  /**
   * Holgura libre en días hábiles: cuánto se puede atrasar sin mover a ninguna sucesora.
   *
   * Va aparte de la total porque son dos preguntas distintas y la vista las enseña juntas: una
   * tarea con tres días de total y cero de libre se puede atrasar tres días sin tocar la entrega,
   * pero al primer día ya empujó a quien venía detrás.
   */
  readonly freeFloat: number
  /**
   * Si el esfuerzo capturado se sostiene con la duración y la gente asignada (§3.5).
   *
   * `undefined` cuando falta alguno de los tres datos, que es distinto de «cuadra»: no se puede
   * afirmar que algo cuadra cuando no hay con qué comprobarlo.
   */
  readonly esfuerzo?: Coherencia
  /**
   * Numeración EDT jerárquica: «2.6.1».
   *
   * Se calcula sobre el plan ENTERO, no sobre lo que se está viendo. El Gantt enseñaba aquí un
   * contador de posición —1, 2, 3…— así que la misma línea tenía un número en el Gantt y otro en el
   * esquema, y el del Gantt cambiaba al plegar una rama o al filtrar. Un identificador que cambia
   * según cómo mires no identifica nada, y es el que la gente se dice por teléfono.
   */
  readonly wbs: string
  /** Fecha comprometida, si la tiene. Es la promesa, distinta de la que calcula el plan. */
  readonly deadline?: IsoDate
  /**
   * La restricción de fecha, dicha en palabras.
   *
   * En palabras y no con el código del motor porque esta columna la lee quien planifica, no quien
   * programa: «No antes del 2026-06-12» se entiende; «NO_ANTES_DE» hay que traducirlo cada vez.
   */
  readonly constraint?: string
  /**
   * La línea venció y no está terminada (§4.6, conmutador 2).
   *
   * El spec pide además que su estado sea «Abierto» o «En progreso». El plan que llega al trazado no
   * trae estado —lo trae avance—, así que aquí eso se dice con «avance por debajo del 100 %», que
   * es la misma frontera dicha con lo que hay. Una línea al 100 % no está atrasada aunque su estado
   * siga abierto: terminó.
   */
  readonly atrasada: boolean
  readonly isCritical: boolean
  readonly isSuperCritical: boolean
  readonly recoverability: Recoverability
  /** Por qué está clasificada así, en palabras. */
  readonly reason: string

  /** Avance de 0 a 1. */
  readonly progress: number
  /** Ancho de la parte ya cubierta de la barra, en días hábiles. */
  readonly progressWidth: number

  /**
   * Comienzo y ancho de la holgura, en días hábiles.
   *
   * Se dibuja después de la barra: es el margen que la tarea tiene antes de empujar el cierre del
   * plan. En una tarea crítica mide cero y no se dibuja nada.
   */
  readonly floatX: number
  readonly floatWidth: number
}

export interface GanttLink {
  /** Los identificadores reales del vínculo, antes de cualquier plegado. */
  readonly predecessorId: string
  readonly successorId: string
  /** Las filas visibles a las que se dibuja. Coinciden con las de arriba si nada está plegado. */
  readonly fromRowId: string
  readonly toRowId: string

  readonly type: LinkType
  /** Desfase con signo, en días hábiles. Se conserva para poder rotularlo. */
  readonly lag: number

  readonly fromAnchor: Anchor
  readonly toAnchor: Anchor
  /** Coordenada horizontal de salida, en días hábiles. */
  readonly fromX: number
  /** Coordenada horizontal de llegada. */
  readonly toX: number
  /** Índice de la fila de salida dentro de `rows`. */
  readonly fromIndex: number
  readonly toIndex: number

  /** Verdadero cuando alguno de los dos extremos se reancló a un ancestro. */
  readonly isFolded: boolean
  /** Cuántos vínculos reales representa esta flecha. Uno, si no plegó nada. */
  readonly foldedCount: number

  /**
   * Verdadero cuando este vínculo es el que de verdad empuja a la sucesora **y** las dos puntas
   * están en la ruta crítica.
   *
   * Las dos condiciones importan. Que las dos tareas sean críticas no basta: una tarea crítica puede
   * tener cuatro predecesoras críticas y solo una la está empujando. Pintar las cuatro de rojo dice
   * que hay cuatro caminos donde hay uno, y la ruta crítica deja de leerse.
   */
  readonly isCritical: boolean
}

export type LinkVisibility =
  /** Ninguna flecha. Para leer las barras sin ruido. */
  | 'NINGUNO'
  /** Solo las de la fila seleccionada, entrantes y salientes. */
  | 'SELECCION'
  /** Todas. En un plan grande es ilegible, y por eso no es lo que se ofrece primero. */
  | 'TODOS'

export interface GanttFilter {
  /** Deja solo la ruta súper crítica: lo que no se recupera con más gente. */
  readonly onlySuperCritical?: boolean
  /** Deja solo lo que está en la ruta crítica. */
  readonly onlyCritical?: boolean
  /** Deja solo hitos y puntos de control. */
  readonly onlyMilestones?: boolean
  /** Deja solo lo que responde una de las partes. */
  readonly party?: ResponsibleParty
}

export interface GanttInput {
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  readonly schedule: Schedule
  /** Las tareas ya analizadas y clasificadas. De aquí salen la holgura y la criticidad. */
  readonly classified: readonly ClassifiedTask[]
  readonly calendar: WorkCalendar
  /**
   * Las fechas que la línea base guardó, por identificador.
   *
   * Sin esto la vista no puede dibujar la desviación, y con ello el §4.8 pide que se vea «la
   * desviación de cada tarea» y no un número agregado en una tarjeta.
   */
  readonly baseline?: ReadonlyMap<string, { readonly start: IsoDate; readonly finish: IsoDate }>
  /** Identificadores de los resúmenes plegados. */
  readonly collapsed?: readonly string[]
  readonly links?: LinkVisibility
  /** Fila seleccionada, si hay alguna. Manda cuando la visibilidad es `SELECCION`. */
  readonly selectedId?: string | null
  readonly filter?: GanttFilter
  /** Escala del eje de tiempo. */
  readonly scale?: AxisScale
  /**
   * Hoy, en fecha civil, para marcar lo atrasado (§4.6, conmutador 2).
   *
   * Entra por parámetro y no se lee el reloj aquí: esta función es pura, y una función que consulta
   * la hora devuelve trazados distintos con los mismos datos — lo que hace imposible probarla y
   * convierte cualquier fallo en «a mí no me pasa».
   *
   * Sin ella no se marca nada, que es lo correcto: no saber qué día es no es lo mismo que saber que
   * nada está atrasado.
   */
  readonly hoy?: IsoDate
}

export type AxisScale = 'DIA' | 'SEMANA' | 'MES'

export interface AxisTick {
  /** Dónde cae la marca, en días hábiles desde el arranque. */
  readonly x: number
  /** Cuántos días hábiles abarca. Sirve para pintar la banda, no solo la raya. */
  readonly width: number
  readonly label: string
  readonly date: IsoDate
}

export interface GanttLayout {
  readonly rows: readonly GanttRow[]
  readonly links: readonly GanttLink[]
  readonly ticks: readonly AxisTick[]
  /** Ancho total del lienzo, en días hábiles. */
  readonly span: number
  readonly start: IsoDate
  readonly finish: IsoDate
  /** Cuántas filas quedaron ocultas por el plegado o por el filtro. */
  readonly hiddenCount: number
  /** Cuántos vínculos se plegaron dentro de otros. */
  readonly foldedLinkCount: number
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

/** La restricción de una línea, dicha como la diría quien planifica. */
function enPalabras(c: { readonly type: string; readonly date: IsoDate }): string {
  const como =
    c.type === 'NO_ANTES_DE' ? 'No antes del'
    : c.type === 'DEBE_EMPEZAR_EL' ? 'Empieza el'
    : c.type === 'DEBE_TERMINAR_EL' ? 'Termina el'
    : c.type === 'NO_TERMINA_ANTES_DE' ? 'No termina antes del'
    : c.type === 'NO_EMPIEZA_DESPUES_DE' ? 'No empieza después del'
    : c.type === 'NO_TERMINA_DESPUES_DE' ? 'No termina después del'
    : c.type
  return `${como} ${c.date}`
}

/**
 * Calcula el trazado completo.
 *
 * Es una función pura: los mismos datos devuelven el mismo trazado. No lee el reloj, no consulta la
 * base y no guarda estado entre llamadas — el plegado y la selección entran como parámetros.
 */
export function ganttLayout(input: GanttInput): GanttLayout {
  const { tasks, dependencies, schedule, classified, calendar } = input
  const linkMode: LinkVisibility = input.links ?? 'SELECCION'
  const selectedId = input.selectedId ?? null
  const collapsed = new Set(input.collapsed ?? [])

  const byId = new Map(tasks.map((task) => [task.id, task]))
  const analysis = new Map(classified.map((task) => [task.id, task]))

  const children = new Map<string, string[]>()
  for (const task of tasks) {
    if (task.parentId === undefined) continue
    const siblings = children.get(task.parentId)
    if (siblings) siblings.push(task.id)
    else children.set(task.parentId, [task.id])
  }

  const level = depthOf(tasks, byId)
  const origin = toDayNumber(schedule.start)
  const originOrdinal = calendar.ordinalOf(origin)

  /**
   * Dónde estaba la línea según la foto, en las mismas unidades que la barra de hoy.
   *
   * Devuelve un objeto vacío si no hay foto o la línea no estaba en ella: así el resultado se
   * esparce sin dejar campos en `undefined` explícito, y una línea nueva no gana una barra fantasma.
   */
  const deLaFoto = (
    id: string,
  ): {
    baseX?: number
    baseWidth?: number
    baseDrift?: number
    baseStart?: IsoDate
    baseFinish?: IsoDate
    baseFinishDrift?: number
  } => {
    const guardada = input.baseline?.get(id)
    if (!guardada) return {}
    const inicio = calendar.ordinalOf(toDayNumber(guardada.start))
    const fin = calendar.ordinalOf(toDayNumber(guardada.finish))
    const baseX = inicio - originOrdinal
    return {
      baseX,
      // Ambos extremos cuentan, como `NETWORKDAYS`: del lunes al viernes son cinco días, no cuatro.
      baseWidth: Math.max(0, fin - inicio + 1),
      baseDrift: (schedule.earlyStart.get(id) ?? originOrdinal) - inicio,
      baseStart: guardada.start,
      baseFinish: guardada.finish,
      // El corrimiento del cierre se calcula aparte del de arranque: una línea puede empezar a
      // tiempo y acabar tarde —porque se alargó— y con un solo número eso no se ve.
      baseFinishDrift: (schedule.earlyFinish.get(id) ?? originOrdinal) - fin,
    }
  }

  // ── Qué se ve ────────────────────────────────────────────────────────────
  // Dos razones distintas para no ver una fila, y conviene no confundirlas: está **plegada** dentro
  // de un resumen cerrado, o el **filtro** la dejó fuera. La primera se deshace abriendo el resumen;
  // la segunda, quitando el filtro.
  const folded = new Set<string>()
  for (const task of tasks) {
    for (let padre = task.parentId; padre !== undefined; padre = byId.get(padre)?.parentId) {
      if (collapsed.has(padre)) {
        folded.add(task.id)
        break
      }
    }
  }

  const passesFilter = filterPredicate(input.filter, analysis)
  const kept = keepWithAncestors(tasks, byId, passesFilter)

  const visible = tasks.filter((task) => !folded.has(task.id) && kept.has(task.id))
  const indexOf = new Map(visible.map((task, index) => [task.id, index]))

  /**
   * Lo que abarca cada resumen, calculado a partir de sus hijos ya programados (§3.6, §12 caso 11).
   *
   * Sin esto la barra del resumen dibujaba las fechas que traía de la base, y en cuanto alguien
   * movía un hijo dejaba de corresponder con su rama. Medido en el plan de referencia: «Inicio:
   * presentar y aprobar el plan de trabajo» se dibujaba terminando el 19 de junio con una rama que
   * llega al 2 de julio — nueve días hábiles de menos, en la fila que más se mira porque es la que
   * queda cuando el plan está plegado.
   */
  const abarcado = fechasDeResumen(
    tasks,
    new Map(
      tasks
        .filter((t) => !children.has(t.id))
        .flatMap((t) => {
          const s = schedule.byId.get(t.id)
          return s ? [[t.id, { start: s.start, finish: s.finish }] as const] : []
        }),
    ),
  )

  // El EDT sale del plan completo y en su orden, no de las filas visibles: plegar una rama no puede
  // renumerar el plan.
  const edt = new Map(numerarPlan(tasks).map((n) => [n.id, n.wbs]))

  const rows: GanttRow[] = visible.map((task) => {
    const scheduled = schedule.byId.get(task.id)
    const tramo = abarcado.get(task.id)
    const classifiedTask = analysis.get(task.id)
    const startOrdinal =
      (tramo
        ? calendar.ordinalOf(toDayNumber(tramo.start))
        : (schedule.earlyStart.get(task.id) ?? originOrdinal)) - originOrdinal
    // El ancho de un resumen es lo que abarca, no la duración que traía guardada: una barra que
    // empieza donde su rama y mide otra cosa es peor que una que no se movió, porque parece exacta.
    const width = tramo
      ? calendar.ordinalOf(toDayNumber(tramo.finish)) - calendar.ordinalOf(toDayNumber(tramo.start)) + 1
      : scheduled?.isMilestone ? 0 : Math.max(task.duration, 0)
    const progress = clamp(task.progress ?? 0)
    const float = classifiedTask?.totalFloat ?? 0

    return {
      id: task.id,
      name: task.name,
      wbs: edt.get(task.id) ?? '',
      // Un hito vencido también cuenta: es una fecha que pasó sin ocurrir, que es peor que una
      // tarea a medias.
      //
      // «Terminada» se pregunta con `estaTerminada`, la **misma** función que usa el Panel: el
      // §9.3 pide que las dos cifras coincidan exactamente, y con «avance por debajo del 100 %» a
      // secas coincidían por casualidad —en el plan de referencia dan las mismas 127— pero se
      // separarían en cuanto existiera una línea cerrada al 50 %. Dos definiciones de «terminada»
      // en el mismo módulo ya costaron un defecto en este proyecto.
      atrasada:
        input.hoy !== undefined &&
        // Un resumen no se atrasa: no tiene trabajo propio, y su retraso es el de sus hijas. Con
        // los resúmenes dentro, el mismo atraso se contaría dos veces —una en la hoja y otra en
        // cada antepasado suyo— y en un plan de siete niveles eso multiplica la cifra.
        //
        // «Resumen» aquí es **tener hijas**, y no la clase declarada, que es lo que usa `isSummary`
        // para pintarlo gris. No son lo mismo y la diferencia importa: en el plan de referencia hay
        // catorce líneas marcadas RESUMEN de las que no cuelga nadie. No tienen hijas de las que
        // heredar nada, así que sus fechas son suyas y su atraso es real; descartarlas por la clase
        // las borraría de la cuenta sin que nadie las echara de menos. El Panel ya cuenta así —sus
        // «hojas» son las que nadie nombra como madre— y dos definiciones de la misma palabra en la
        // misma pantalla es exactamente lo que el §9.3 pide que no pase.
        !children.has(task.id) &&
        (tramo?.finish ?? scheduled?.finish ?? schedule.start) < input.hoy &&
        clamp(task.progress ?? 0) < 1 &&
        !estaTerminada(task.status ?? ''),
      ...(task.dueDate ? { deadline: task.dueDate } : {}),
      ...(task.constraint ? { constraint: enPalabras(task.constraint) } : {}),
      level: level.get(task.id) ?? 0,
      isSummary: task.kind === 'RESUMEN' || children.has(task.id),
      hasChildren: children.has(task.id),
      isCollapsed: collapsed.has(task.id),
      kind: task.kind ?? 'ACTIVIDAD',
      party: classifiedTask?.party ?? task.party ?? 'PROVEEDOR',
      start: tramo?.start ?? scheduled?.start ?? schedule.start,
      finish: tramo?.finish ?? scheduled?.finish ?? schedule.start,
      isMilestone: scheduled?.isMilestone ?? task.duration === 0,
      x: startOrdinal,
      width,
      totalFloat: float,
      freeFloat: classifiedTask?.freeFloat ?? 0,
      // El esfuerzo solo se comprueba en líneas que trabajan y que tienen los tres datos. Un hito
      // no consume esfuerzo, y un resumen hereda el de sus hijas: en los dos, comparar sería
      // inventarse un descuadre.
      //
      // Cero horas **no** es una estimación de cero: es «nadie lo dijo», igual que el nulo. Tratarlo
      // como estimación marcaba 52 líneas del plan de referencia —casi todas entregas del cliente
      // con alguien asignado de oficio— y ninguna era un error de planificación. Un aviso que salta
      // 52 veces sin razón enseña a ignorar el aviso.
      ...(task.estimacionMin !== undefined &&
      task.estimacionMin > 0 &&
      task.capacidadDiariaMin !== undefined &&
      !children.has(task.id) &&
      task.duration > 0
        ? {
            esfuerzo: comprobarCoherencia(task.estimacionMin, task.duration, [
              { minutosPorDia: task.capacidadDiariaMin, unidadesBp: 10000 },
            ]),
          }
        : {}),
      isCritical: classifiedTask?.isCritical ?? false,
      isSuperCritical: classifiedTask?.isSuperCritical ?? false,
      recoverability: classifiedTask?.recoverability ?? 'RECUPERABLE',
      reason: classifiedTask?.reason ?? '',
      progress,
      progressWidth: width * progress,
      // La holgura arranca donde termina la barra y se extiende hasta el fin tardío.
      floatX: startOrdinal + width,
      floatWidth: Math.max(float, 0),
      ...deLaFoto(task.id),
    }
  })

  // ── Las flechas ──────────────────────────────────────────────────────────
  const links = layoutLinks({
    dependencies,
    rows,
    indexOf,
    byId,
    visibleIds: new Set(visible.map((task) => task.id)),
    schedule,
    analysis,
    linkMode,
    selectedId,
  })

  const span = Math.max(1, calendar.ordinalOf(toDayNumber(schedule.finish)) - originOrdinal + 1)

  return Object.freeze({
    rows: Object.freeze(rows),
    links: Object.freeze(links),
    ticks: Object.freeze(axisTicks(calendar, schedule.start, schedule.finish, input.scale ?? 'MES')),
    span,
    start: schedule.start,
    finish: schedule.finish,
    hiddenCount: tasks.length - visible.length,
    foldedLinkCount: links.reduce((total, link) => total + link.foldedCount - 1, 0),
  })
}

/**
 * Reancla al ancestro visible y pliega los duplicados.
 *
 * Cuando las dos puntas de un vínculo caen en la misma fila visible —porque las dos tareas viven
 * dentro del mismo resumen cerrado— la flecha desaparece: sería una flecha de una fila a sí misma.
 * Cuando caen en filas distintas, la flecha se conserva y las repetidas se cuentan en una sola.
 */
function layoutLinks(context: {
  dependencies: readonly Dependency[]
  rows: readonly GanttRow[]
  indexOf: ReadonlyMap<string, number>
  byId: ReadonlyMap<string, PlanTask>
  visibleIds: ReadonlySet<string>
  schedule: Schedule
  analysis: ReadonlyMap<string, ClassifiedTask>
  linkMode: LinkVisibility
  selectedId: string | null
}): GanttLink[] {
  const { dependencies, rows, indexOf, byId, visibleIds, schedule, analysis } = context
  if (context.linkMode === 'NINGUNO') return []

  const anchorOf = (id: string): string | null => {
    for (let current: string | undefined = id; current !== undefined; current = byId.get(current)?.parentId) {
      if (visibleIds.has(current)) return current
    }
    return null
  }

  const selectedAnchor = context.selectedId === null ? null : anchorOf(context.selectedId)
  const rowById = new Map(rows.map((row) => [row.id, row]))
  const porClave = new Map<string, GanttLink>()

  for (const dependency of dependencies) {
    const fromRowId = anchorOf(dependency.predecessorId)
    const toRowId = anchorOf(dependency.successorId)
    // Sin ancestro visible, o los dos dentro del mismo resumen cerrado: no hay flecha que dibujar.
    if (fromRowId === null || toRowId === null || fromRowId === toRowId) continue

    if (context.linkMode === 'SELECCION') {
      if (selectedAnchor === null) continue
      const tocaLaSeleccion =
        fromRowId === selectedAnchor ||
        toRowId === selectedAnchor ||
        dependency.predecessorId === context.selectedId ||
        dependency.successorId === context.selectedId
      if (!tocaLaSeleccion) continue
    }

    // La clave junta las tres cosas que hacen unica a una flecha. Se serializa como arreglo en vez
    // de pegarlas con un separador: cualquier separador que se elija puede aparecer dentro de un
    // identificador y volver ambigua la clave, y el que estaba aqui era un byte nulo, que ademas
    // hacia que `grep` tratara este archivo como binario y lo saltara.
    const clave = JSON.stringify([fromRowId, toRowId, dependency.type])
    const yaEsta = porClave.get(clave)
    if (yaEsta) {
      porClave.set(clave, { ...yaEsta, foldedCount: yaEsta.foldedCount + 1 })
      continue
    }

    const anchors = LINK_ANCHORS[dependency.type]
    const desde = rowById.get(fromRowId)!
    const hacia = rowById.get(toRowId)!
    const esPlegado = fromRowId !== dependency.predecessorId || toRowId !== dependency.successorId

    porClave.set(clave, {
      predecessorId: dependency.predecessorId,
      successorId: dependency.successorId,
      fromRowId,
      toRowId,
      type: dependency.type,
      lag: dependency.lag,
      fromAnchor: anchors.from,
      toAnchor: anchors.to,
      fromX: anchorX(desde, anchors.from),
      toX: anchorX(hacia, anchors.to),
      fromIndex: indexOf.get(fromRowId)!,
      toIndex: indexOf.get(toRowId)!,
      isFolded: esPlegado,
      foldedCount: 1,
      isCritical: esPlegado
        ? false
        : isDrivingAndCritical(dependency, schedule, analysis),
    })
  }

  return [...porClave.values()]
}

/**
 * Un vínculo se pinta como crítico solo si empuja de verdad.
 *
 * El pase adelante ya guardó, para cada tarea, cuál de sus predecesoras le fijó el inicio. Ese es el
 * único vínculo por el que pasa la ruta. Los demás llegan antes y no mandan, aunque unan dos tareas
 * críticas.
 */
function isDrivingAndCritical(
  dependency: Dependency,
  schedule: Schedule,
  analysis: ReadonlyMap<string, ClassifiedTask>,
): boolean {
  const successor = schedule.byId.get(dependency.successorId)
  const driving = successor?.drivingDependency
  if (
    !driving ||
    driving.predecessorId !== dependency.predecessorId ||
    driving.type !== dependency.type ||
    driving.lag !== dependency.lag
  ) {
    return false
  }
  return (
    (analysis.get(dependency.predecessorId)?.isCritical ?? false) &&
    (analysis.get(dependency.successorId)?.isCritical ?? false)
  )
}

function anchorX(row: GanttRow, anchor: Anchor): number {
  // El fin de una barra es el borde derecho, no el último día trabajado: una tarea de tres días que
  // arranca en el día 0 ocupa los días 0, 1 y 2, y su flecha de salida arranca en el 3.
  return anchor === 'INICIO' ? row.x : row.x + row.width
}

/**
 * Deja pasar lo que el filtro pide **y sus ancestros**.
 *
 * Un filtro que borra los ancestros deja una lista de tareas sueltas sin el bloque al que pertenecen.
 * Quien mira «solo la ruta súper crítica» necesita saber de qué etapa sale cada línea; si no, tiene
 * la respuesta sin la pregunta.
 */
function keepWithAncestors(
  tasks: readonly PlanTask[],
  byId: ReadonlyMap<string, PlanTask>,
  passes: (task: PlanTask) => boolean,
): Set<string> {
  const kept = new Set<string>()
  for (const task of tasks) {
    if (!passes(task)) continue
    kept.add(task.id)
    for (let padre = task.parentId; padre !== undefined; padre = byId.get(padre)?.parentId) {
      if (kept.has(padre)) break
      kept.add(padre)
    }
  }
  return kept
}

function filterPredicate(
  filter: GanttFilter | undefined,
  analysis: ReadonlyMap<string, ClassifiedTask>,
): (task: PlanTask) => boolean {
  if (!filter || Object.values(filter).every((value) => value === undefined || value === false)) {
    return () => true
  }

  return (task: PlanTask): boolean => {
    const clasificada = analysis.get(task.id)
    if (filter.onlySuperCritical && !(clasificada?.isSuperCritical ?? false)) return false
    if (filter.onlyCritical && !(clasificada?.isCritical ?? false)) return false
    if (filter.onlyMilestones && !esClaseDeHito(task.kind, task.duration)) return false
    if (filter.party !== undefined && (clasificada?.party ?? task.party ?? 'PROVEEDOR') !== filter.party) {
      return false
    }
    return true
  }
}

/**
 * Las marcas del eje de tiempo.
 *
 * Van en días hábiles, igual que las barras. Un mes de veintidós días hábiles se ve más ancho que
 * uno de diecinueve, y así debe ser: en el que tiene veintidós cabe más trabajo.
 */
export function axisTicks(
  calendar: WorkCalendar,
  start: IsoDate,
  finish: IsoDate,
  scale: AxisScale,
): AxisTick[] {
  const desde = toDayNumber(start)
  const hasta = toDayNumber(finish)
  if (hasta < desde) return []

  const origen = calendar.ordinalOf(desde)
  const marcas: AxisTick[] = []
  let cursor = desde
  let actual: { key: string; day: DayNumber; x: number } | null = null

  const cerrar = (finX: number): void => {
    if (actual === null) return
    marcas.push({
      x: actual.x,
      width: Math.max(1, finX - actual.x),
      label: labelFor(actual.day, scale),
      date: toIsoDate(actual.day),
    })
  }

  while (cursor <= hasta) {
    if (calendar.isWorkingDay(cursor)) {
      const key = bucketKey(cursor, scale, calendar, origen)
      if (actual === null || actual.key !== key) {
        cerrar(calendar.ordinalOf(cursor) - origen)
        actual = { key, day: cursor, x: calendar.ordinalOf(cursor) - origen }
      }
    }
    cursor += 1
  }
  cerrar(calendar.ordinalOf(hasta) - origen + 1)

  return marcas
}

function bucketKey(day: DayNumber, scale: AxisScale, calendar: WorkCalendar, origen: number): string {
  if (scale === 'DIA') return String(day)
  if (scale === 'MES') return toIsoDate(day).slice(0, 7)
  // Semana: bloques de cinco días hábiles contados **desde el arranque del plan**, no desde una
  // referencia absoluta ni por número de semana del calendario. Contarlos desde una referencia
  // absoluta parte la primera columna en donde caiga el arranque, y la rejilla arranca torcida.
  return String(Math.floor((calendar.ordinalOf(day) - origen) / 5))
}

function labelFor(day: DayNumber, scale: AxisScale): string {
  const iso = toIsoDate(day)
  if (scale === 'MES') return `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
  if (scale === 'SEMANA') return iso
  return iso.slice(8, 10)
}

/** Profundidad de cada tarea en el árbol de resúmenes. */
function depthOf(tasks: readonly PlanTask[], byId: ReadonlyMap<string, PlanTask>): Map<string, number> {
  const level = new Map<string, number>()
  for (const task of tasks) {
    let profundidad = 0
    const visto = new Set<string>([task.id])
    for (let padre = task.parentId; padre !== undefined; padre = byId.get(padre)?.parentId) {
      if (visto.has(padre)) break
      visto.add(padre)
      profundidad += 1
    }
    level.set(task.id, profundidad)
  }
  return level
}

function clamp(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/**
 * Los resúmenes que hay que plegar para ver el plan hasta cierto nivel.
 *
 * Es lo que hacen los botones de «Detalle / Etapas / Resumen»: no ocultan filas una por una, cierran
 * todo lo que esté a la profundidad pedida o más abajo.
 */
export function collapseToLevel(rows: readonly { id: string; level: number; hasChildren: boolean }[], level: number): string[] {
  return rows.filter((row) => row.hasChildren && row.level >= level).map((row) => row.id)
}

/** Rótulo del desfase, o cadena vacía si no hay. Positivo es espera; negativo, solapamiento. */
export function lagLabel(lag: number): string {
  if (lag === 0) return ''
  const dias = Math.abs(lag) === 1 ? 'día' : 'días'
  return lag > 0 ? `+${lag} ${dias}` : `${lag} ${dias}`
}

/** Sirve para rotular la flecha: `FS`, `SS +3 días`, `FF -2 días`. */
export function linkLabel(link: Pick<GanttLink, 'type' | 'lag'>): string {
  const desfase = lagLabel(link.lag)
  return desfase === '' ? link.type : `${link.type} ${desfase}`
}

/**
 * La disposición de la vista de calendario: colocar barras multi-día sin que se pisen.
 *
 * Es lo único difícil de esa vista, y es un problema de empaquetado de intervalos: cada tarea ocupa
 * un rango de días, y hay que darle un carril —una fila dentro de la semana— donde quepa entera sin
 * chocar con otra. Vive aquí, en el motor, y no en el componente, por la misma razón que el resto:
 * es aritmética, se prueba sin navegador, y una vista que calcula su propio empaquetado termina
 * calculando también otras cosas.
 *
 * ## Las tres reglas del orden, y por qué ese orden
 *
 * Se ordena por inicio ascendente y, a igual inicio, por duración descendente. Las largas primero
 * no es estética: una barra larga que llega tarde al reparto encuentra todos los carriles altos
 * ocupados en algún día de su recorrido y baja hasta el fondo, dejando huecos por encima. Poniendo
 * las largas arriba, las cortas rellenan los huecos que quedan y el resultado usa menos carriles.
 * El desempate final es por identificador, para que dos planes iguales se dibujen iguales.
 *
 * ## El corte por semana
 *
 * Una tarea del 28 de julio al 4 de agosto no es una barra: son dos trozos, uno por semana, y cada
 * uno se coloca por separado —pueden caer en carriles distintos y está bien—. Los trozos saben si
 * vienen de antes o siguen después, que es lo que permite dibujar las puntas de continuación.
 */

import { type WorkCalendar } from './calendar'
import { type DayNumber, type IsoDate, toDayNumber, toIsoDate, weekdayOf } from './date'

/** Una tarea tal como la necesita el calendario: un rango de días y poco más. */
export interface CalendarTask {
  readonly id: string
  readonly name: string
  /** Primer día que ocupa. */
  readonly start: IsoDate
  /** Último día que ocupa, inclusive. En un hito coincide con el inicio. */
  readonly finish: IsoDate
  /**
   * Un hito no se dibuja como barra sino como rombo, y **nunca cae en «N tareas más»**.
   *
   * Es una mejora deliberada sobre la referencia, y la razón es que un hito es precisamente lo que
   * no se puede perder de vista: marca un compromiso, no trabajo. Un día saturado esconde tareas
   * sin drama —se despliegan— pero esconder el hito de cierre de una etapa detrás de un «12 tareas
   * más» es esconder justo lo que alguien vino a buscar.
   */
  readonly isMilestone?: boolean
  /** Fecha límite comprometida, si es distinta del fin. Se marca en su día con un aviso. */
  readonly deadline?: IsoDate
}

/** Un trozo de tarea dentro de una semana, ya colocado en su carril. */
export interface CalendarSegment {
  readonly taskId: string
  readonly name: string
  /** Carril donde se dibuja, empezando en cero. */
  readonly lane: number
  /** Día de la semana donde empieza el trozo, 0 = primera columna de la semana. */
  readonly startColumn: number
  /** Cuántas columnas ocupa. Siempre uno o más. */
  readonly span: number
  /** La tarea venía de la semana anterior: se dibuja con punta de continuación a la izquierda. */
  readonly continuesFromPrevious: boolean
  /** La tarea sigue en la semana siguiente. */
  readonly continuesIntoNext: boolean
  /** Se dibuja como rombo, no como barra. */
  readonly isMilestone: boolean
}

export interface CalendarWeek {
  /** Primer día de la semana. */
  readonly start: IsoDate
  /** Los días de la semana, en orden, con su marca de laborable. */
  readonly days: readonly CalendarDay[]
  /** Los trozos que se dibujan, ya con carril asignado y dentro del límite visible. */
  readonly segments: readonly CalendarSegment[]
  /**
   * Cuántas tareas quedaron fuera por día, por haber caído en un carril más allá del límite.
   * Es lo que alimenta el «N tareas más» de cada casilla.
   */
  readonly overflowByColumn: readonly number[]
  /** Cuántos carriles se usaron antes de recortar. Sirve para decidir el alto de la fila. */
  readonly laneCount: number
  /** Qué tareas vencen en cada columna, para poner el aviso de fecha límite en su día. */
  readonly deadlinesByColumn: readonly (readonly string[])[]
}

export interface CalendarLayout {
  readonly weeks: readonly CalendarWeek[]
  /** Cuántas tareas del conjunto de entrada aparecen dibujadas al menos una vez. */
  readonly placedTasks: number
  /**
   * Cuántas solapan el rango pedido, dibujadas o escondidas tras un «N líneas más».
   *
   * No es `placedTasks`: en un mes denso casi todas caen al desborde, y contar sólo las dibujadas
   * dejaba la cabecera diciendo «37 de 1368 caen en este mes» mientras las casillas de ese mismo mes
   * decían «63 líneas más» cada una. Dos números que no pueden ser ciertos a la vez.
   */
  readonly tasksInRange: number
  /** Cuántas quedaron completamente fuera del rango pedido. */
  readonly outOfRange: number
}

export interface CalendarDay {
  readonly date: IsoDate
  readonly isWorking: boolean
  /** Verdadero cuando el día cae fuera del mes que se está mirando, para atenuarlo. */
  readonly isOutsideMonth: boolean
}

export interface CalendarLayoutInput {
  readonly tasks: readonly CalendarTask[]
  /** Primer día del rango a dibujar. Se expande hacia atrás hasta el inicio de su semana. */
  readonly from: IsoDate
  /** Último día del rango, inclusive. Se expande hacia adelante hasta el fin de su semana. */
  readonly to: IsoDate
  readonly calendar: WorkCalendar
  /**
   * Cuántos carriles caben en una casilla antes de resumir el resto en «N tareas más».
   * Por omisión tres: es lo que cabe en una casilla de mes sin volverla ilegible.
   */
  readonly maxLanes?: number
  /** Mes que se está mirando (1-12), para atenuar los días de los meses vecinos. */
  readonly month?: number
  readonly year?: number
  /** Con qué día abre la semana: 1 = lunes (por omisión), 0 = domingo. */
  readonly weekStartsOn?: 0 | 1
}

const MAX_LANES_POR_OMISION = 3

/**
 * Cuántos carriles ocupa de verdad lo dibujado en una semana.
 *
 * No es `laneCount` ni el tope de carriles visibles: un hito está exento del recorte, así que puede
 * tocarle un carril por encima del tope y la fila tiene que medir para él. Quien pinte la fila con el
 * tope en lugar de con esto deja las barras de más colgando sobre la fila siguiente.
 */
export function carrilesDibujados(semana: Pick<CalendarWeek, 'segments'>): number {
  return semana.segments.reduce((alto, trozo) => Math.max(alto, trozo.lane + 1), 0)
}

/**
 * Arma la rejilla del calendario con sus tareas ya colocadas.
 *
 * Devuelve semanas completas siempre: un calendario que empieza a media semana se lee mal, y las
 * casillas de relleno se atenúan con `isOutsideMonth`.
 */
export function calendarLayout(input: CalendarLayoutInput): CalendarLayout {
  const maxLanes = input.maxLanes ?? MAX_LANES_POR_OMISION
  const weekStartsOn = input.weekStartsOn ?? 1

  const primerDia = inicioDeSemana(toDayNumber(input.from), weekStartsOn)
  const ultimoDia = finDeSemana(toDayNumber(input.to), weekStartsOn)

  const semanas: CalendarWeek[] = []
  const colocadas = new Set<string>()

  for (let cursor = primerDia; cursor <= ultimoDia; cursor += 7) {
    const dias: CalendarDay[] = []
    for (let i = 0; i < 7; i += 1) {
      const dia = (cursor + i) as DayNumber
      const iso = toIsoDate(dia)
      dias.push({
        date: iso,
        isWorking: input.calendar.isWorkingDay(dia),
        isOutsideMonth: estaFueraDelMes(iso, input.month, input.year),
      })
    }

    const { segments, overflowByColumn, laneCount, deadlinesByColumn } = colocarSemana(
      input.tasks,
      cursor,
      maxLanes,
    )
    for (const trozo of segments) colocadas.add(trozo.taskId)

    semanas.push({
      start: toIsoDate(cursor as DayNumber),
      days: dias,
      segments,
      overflowByColumn,
      laneCount,
      deadlinesByColumn,
    })
  }

  /**
   * Las que caen dentro del rango **pedido**, no dentro de la rejilla.
   *
   * No es lo mismo, y la diferencia no es pequeña. Una rejilla de mes empieza el lunes anterior al
   * día 1 y acaba el domingo posterior al último: hasta doce días de más, y esos días se dibujan
   * atenuados **precisamente porque no son de este mes**.
   *
   * Contando contra la rejilla, la cabecera decía «300 líneas caen en este mes» cuando en agosto de
   * 2026 caen **171**. En septiembre, 549 contra 490. La cifra que se enseña responde a la pregunta
   * que hace quien la lee —«¿cuánto hay este mes?»— y no a la que le resulta cómoda al repartidor
   * de carriles.
   */
  const desde = toDayNumber(input.from)
  const hasta = toDayNumber(input.to)
  const dentroDelRango = input.tasks.filter((tarea) => {
    const inicio = toDayNumber(tarea.start)
    const fin = toDayNumber(tarea.finish)
    return fin >= desde && inicio <= hasta
  })

  return {
    weeks: semanas,
    placedTasks: colocadas.size,
    tasksInRange: dentroDelRango.length,
    outOfRange: input.tasks.length - dentroDelRango.length,
  }
}

/**
 * El reparto de carriles de una semana.
 *
 * Un carril guarda hasta dónde llega lo que ya se le asignó; una tarea entra en el primer carril
 * cuyo ocupante anterior haya terminado antes de que ella empiece. Como las tareas llegan ordenadas
 * por inicio, basta comparar contra el último día ocupado: no hace falta revisar todo el rango.
 */
function colocarSemana(
  tasks: readonly CalendarTask[],
  inicioSemana: number,
  maxLanes: number,
): {
  segments: CalendarSegment[]
  overflowByColumn: number[]
  laneCount: number
  deadlinesByColumn: string[][]
} {
  const finSemana = inicioSemana + 6

  const enLaSemana = tasks
    .map((tarea) => ({
      tarea,
      inicio: toDayNumber(tarea.start),
      fin: toDayNumber(tarea.finish),
    }))
    // Un rango invertido no es un intervalo; se descarta en vez de dibujar una barra imposible.
    .filter((t) => t.fin >= t.inicio && t.fin >= inicioSemana && t.inicio <= finSemana)
    /**
     * Por **inicio**, y eso no es una preferencia: es la invariante del repartidor de carriles.
     *
     * El voraz de más abajo —«el primer carril cuyo último día ocupado sea anterior a mi inicio»—
     * sólo da el mínimo de carriles si los intervalos entran en orden de inicio. Fuera de ese orden
     * sigue produciendo un dibujo **válido** —nada se solapa— pero abre carriles de más, y cada
     * carril de más empuja tareas detrás del «N más».
     *
     * Aquí los hitos iban primero de todo, con el motivo escrito: «así toman los carriles altos y
     * nunca caen en el recorte». El motivo era bueno y la implementación sobraba: los hitos **ya
     * están exentos** del recorte unas líneas más abajo, así que adelantarlos no los protegía de nada
     * — sólo rompía el empaquetado.
     *
     * Medido sobre el plan de referencia: en septiembre pasan de **37 a 44** líneas dibujadas y de
     * 1 559 a 1 473 escondidas; en octubre, de 36 a 38 y de 1 098 a 1 015.
     */
    .sort((a, b) => {
      if (a.inicio !== b.inicio) return a.inicio - b.inicio
      // Empatados en inicio sí van primero: entre dos que arrancan el mismo día, el hito es el que
      // alguien vino a buscar. Aquí no cuesta nada — el orden entre iguales no toca la invariante.
      const hitoA = a.tarea.isMilestone === true
      const hitoB = b.tarea.isMilestone === true
      if (hitoA !== hitoB) return hitoA ? -1 : 1
      const duracionA = a.fin - a.inicio
      const duracionB = b.fin - b.inicio
      if (duracionA !== duracionB) return duracionB - duracionA
      return a.tarea.id.localeCompare(b.tarea.id)
    })

  /** Último día ocupado de cada carril, o `-Infinity` si está libre. */
  const ocupadoHasta: number[] = []
  const segments: CalendarSegment[] = []
  const overflowByColumn = new Array<number>(7).fill(0)
  const deadlinesByColumn: string[][] = Array.from({ length: 7 }, () => [])

  for (const tarea of tasks) {
    if (!tarea.deadline) continue
    const dia = toDayNumber(tarea.deadline)
    if (dia >= inicioSemana && dia <= finSemana) deadlinesByColumn[dia - inicioSemana].push(tarea.id)
  }

  for (const { tarea, inicio, fin } of enLaSemana) {
    const desde = Math.max(inicio, inicioSemana)
    const hasta = Math.min(fin, finSemana)

    let carril = ocupadoHasta.findIndex((ultimo) => ultimo < desde)
    if (carril === -1) {
      carril = ocupadoHasta.length
      ocupadoHasta.push(hasta)
    } else {
      ocupadoHasta[carril] = hasta
    }

    // Un hito nunca se recorta: es un compromiso, no trabajo, y esconderlo tras un «N tareas más»
    // es esconder justo lo que alguien vino a buscar. **Esta línea es lo que lo garantiza** — no el
    // orden, que ahora es el que el repartidor necesita.
    if (carril >= maxLanes && tarea.isMilestone !== true) {
      // No cabe: cuenta como «una más» en cada día que habría ocupado, que es lo que la casilla
      // necesita saber para decir «N tareas más».
      for (let d = desde; d <= hasta; d += 1) overflowByColumn[d - inicioSemana] += 1
      continue
    }

    segments.push({
      taskId: tarea.id,
      name: tarea.name,
      lane: carril,
      startColumn: desde - inicioSemana,
      span: hasta - desde + 1,
      continuesFromPrevious: inicio < inicioSemana,
      continuesIntoNext: fin > finSemana,
      isMilestone: tarea.isMilestone === true,
    })
  }

  return { segments, overflowByColumn, laneCount: ocupadoHasta.length, deadlinesByColumn }
}

/**
 * Las tareas que una casilla esconde tras «N tareas más».
 *
 * La rejilla dice cuántas hay; esto dice cuáles, para desplegarlas al tocar. Se recalcula con la
 * misma regla de orden y reparto, así que lo que se despliega es exactamente lo que no se dibujó.
 */
export function hiddenTasksOfDay(
  tasks: readonly CalendarTask[],
  day: IsoDate,
  maxLanes = MAX_LANES_POR_OMISION,
  weekStartsOn: 0 | 1 = 1,
): CalendarTask[] {
  const dia = toDayNumber(day)
  const inicioSemana = inicioDeSemana(dia, weekStartsOn)
  const { segments } = colocarSemana(tasks, inicioSemana, maxLanes)

  const visibles = new Set(
    segments
      .filter((trozo) => {
        const desde = inicioSemana + trozo.startColumn
        return dia >= desde && dia < desde + trozo.span
      })
      .map((trozo) => trozo.taskId),
  )

  return tasks.filter((tarea) => {
    if (visibles.has(tarea.id)) return false
    const inicio = toDayNumber(tarea.start)
    const fin = toDayNumber(tarea.finish)
    return fin >= inicio && dia >= inicio && dia <= fin
  })
}

function inicioDeSemana(dia: number, weekStartsOn: 0 | 1): number {
  const diaDeLaSemana = weekdayOf(dia as DayNumber)
  const desplazamiento = (diaDeLaSemana - weekStartsOn + 7) % 7
  return dia - desplazamiento
}

function finDeSemana(dia: number, weekStartsOn: 0 | 1): number {
  return inicioDeSemana(dia, weekStartsOn) + 6
}

function estaFueraDelMes(iso: IsoDate, month?: number, year?: number): boolean {
  if (month === undefined || year === undefined) return false
  return Number(iso.slice(0, 4)) !== year || Number(iso.slice(5, 7)) !== month
}

/**
 * Cómo se está mirando el calendario (§7.2).
 *
 * El spec pide tres. `calendarLayout` ya servía para las dos primeras sin tocarlo —recibe `from` y
 * `to`, no un mes— así que lo único que faltaba era decir qué rango pide cada modo. La tercera no
 * usa la rejilla: una agenda es una lista, y meterla por el mismo camino la obligaría a inventarse
 * carriles que nadie va a ver.
 */
export type ModoDeCalendario = 'MES' | 'SEMANA' | 'AGENDA'

/**
 * Qué rango cubre cada modo alrededor de un día.
 *
 * El día de referencia es cualquiera **dentro** del periodo, no su primer día: así el mismo valor
 * sirve para los tres modos y cambiar de modo no salta a otra parte del plan. Pasar de la semana
 * del 15 al mes deja el mes del 15, que es donde estaba mirando quien cambió.
 *
 * `calendarLayout` expande hacia atrás hasta el lunes y hacia adelante hasta el domingo, así que
 * aquí no hace falta redondear a semanas: se dice el periodo y él completa las filas.
 */
export function rangoDelModo(
  modo: ModoDeCalendario,
  ancla: IsoDate,
  weekStartsOn: 0 | 1 = 1,
): { readonly from: IsoDate; readonly to: IsoDate } {
  if (modo === 'SEMANA') {
    const lunes = inicioDeSemana(toDayNumber(ancla), weekStartsOn)
    return { from: toIsoDate(lunes), to: toIsoDate(lunes + 6) }
  }
  // Mes y agenda comparten periodo: la agenda es el mismo mes leído como lista, y darle otro
  // periodo haría que las flechas movieran distinto según el modo sin motivo visible.
  const anio = Number(ancla.slice(0, 4))
  const mes = Number(ancla.slice(5, 7))
  return {
    from: `${ancla.slice(0, 7)}-01` as IsoDate,
    to: `${ancla.slice(0, 7)}-${String(diasDelMesDe(anio, mes)).padStart(2, '0')}` as IsoDate,
  }
}

/** El día de referencia tras pulsar una flecha. */
export function anclaTrasAvanzar(modo: ModoDeCalendario, ancla: IsoDate, pasos: number): IsoDate {
  if (modo === 'SEMANA') return toIsoDate(toDayNumber(ancla) + pasos * 7)

  // Por meses no se puede sumar días: los meses no miden lo mismo. Y hay que sujetar el día del mes,
  // porque el 31 de enero más un mes no es el 31 de febrero — sin esto, avanzar desde un día 31
  // saltaba meses enteros.
  const anio = Number(ancla.slice(0, 4))
  const mes = Number(ancla.slice(5, 7))
  const dia = Number(ancla.slice(8, 10))
  const total = anio * 12 + (mes - 1) + pasos
  const nuevoAnio = Math.floor(total / 12)
  const nuevoMes = (total % 12) + 1
  const diaFinal = Math.min(dia, diasDelMesDe(nuevoAnio, nuevoMes))
  return `${nuevoAnio}-${String(nuevoMes).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}` as IsoDate
}

/** Una entrada de la agenda: un día con lo que ocurre en él. */
export interface DiaDeAgenda {
  readonly date: IsoDate
  readonly isWorking: boolean
  /** Las que **empiezan** ese día. */
  readonly empiezan: readonly CalendarTask[]
  /** Las que **terminan** ese día y no empezaron en él. */
  readonly terminan: readonly CalendarTask[]
  /** Las que vienen de antes y siguen después: en curso, sin evento propio ese día. */
  readonly enCurso: readonly CalendarTask[]
}

/**
 * La agenda: qué pasa cada día del rango, en orden.
 *
 * Se separan las que **empiezan**, las que **terminan** y las que sólo están en curso, y esa
 * separación es la razón de que la agenda exista. Una lista que dijera «estas 63 tareas tocan el
 * martes» no dice nada: en un plan de 1368 líneas casi todos los días tocan decenas de tareas
 * porque duran semanas. Lo que se quiere saber al mirar un día es **qué arranca y qué vence**, que
 * es lo accionable; lo demás es contexto y va contado, no listado por quien lo consume.
 *
 * Los días sin nada se omiten: una agenda con veinte renglones vacíos entre dos eventos obliga a
 * desplazarse para no encontrar nada.
 */
export function agendaDelRango(
  tasks: readonly CalendarTask[],
  from: IsoDate,
  to: IsoDate,
  calendar: WorkCalendar,
): readonly DiaDeAgenda[] {
  const desde = toDayNumber(from)
  const hasta = toDayNumber(to)
  if (hasta < desde) return []

  const dias: DiaDeAgenda[] = []
  for (let d = desde; d <= hasta; d += 1) {
    const iso = toIsoDate(d)
    const empiezan: CalendarTask[] = []
    const terminan: CalendarTask[] = []
    const enCurso: CalendarTask[] = []

    for (const t of tasks) {
      const arranca = t.start === iso
      const acaba = t.finish === iso
      if (arranca) empiezan.push(t)
      else if (acaba) terminan.push(t)
      else if (t.start < iso && iso < t.finish) enCurso.push(t)
    }

    if (empiezan.length === 0 && terminan.length === 0 && enCurso.length === 0) continue

    const porNombre = (a: CalendarTask, b: CalendarTask) => a.name.localeCompare(b.name, 'es')
    dias.push({
      date: iso,
      isWorking: calendar.isWorkingDay(d),
      // Los hitos primero dentro de cada grupo, por lo mismo que en la rejilla: un hito es un
      // compromiso, y en una lista larga lo que va al final no se lee.
      empiezan: [...empiezan].sort((a, b) =>
        (b.isMilestone ? 1 : 0) - (a.isMilestone ? 1 : 0) || porNombre(a, b),
      ),
      terminan: [...terminan].sort((a, b) =>
        (b.isMilestone ? 1 : 0) - (a.isMilestone ? 1 : 0) || porNombre(a, b),
      ),
      enCurso: [...enCurso].sort(porNombre),
    })
  }
  return dias
}

/** Cuántos días tiene un mes. Bisiestos incluidos, que es de lo que se olvida quien lo escribe a mano. */
function diasDelMesDe(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

/**
 * El rango que queda tras arrastrar de un día a otro (§7.2).
 *
 * Se ordena, porque arrastrar hacia atrás es tan natural como hacia adelante y nadie debería tener
 * que pensarlo: quien empieza en el 20 y suelta en el 15 está pidiendo del 15 al 20.
 */
export function rangoSeleccionado(
  desde: IsoDate,
  hasta: IsoDate,
): { readonly from: IsoDate; readonly to: IsoDate } {
  return desde <= hasta ? { from: desde, to: hasta } : { from: hasta, to: desde }
}

/**
 * Por qué no se puede crear una línea en este rango, o `null` si se puede.
 *
 * La única razón real es que el rango no tenga **ningún** día laborable. Un rango que empieza en
 * sábado sí vale: el motor empuja el arranque al lunes, que es lo correcto y lo que ya hace con
 * cualquier fecha. Lo que no vale es un fin de semana entero, porque entonces no hay ningún día en
 * que la línea pueda ocurrir y la fecha que se guardara no significaría nada.
 */
export function porQueNoSePuedeCrearAhi(
  from: IsoDate,
  to: IsoDate,
  calendar: WorkCalendar,
): string | null {
  const desde = toDayNumber(from)
  const hasta = toDayNumber(to)
  if (hasta < desde) return 'El rango está al revés.'
  for (let d = desde; d <= hasta; d += 1) {
    if (calendar.isWorkingDay(d)) return null
  }
  return 'Ese rango no tiene ningún día laborable, así que la línea no podría ocurrir en él.'
}

/**
 * Las fechas con que nace una línea creada arrastrando: el primer y el último día **hábil** del
 * rango.
 *
 * Se recortan a hábiles a propósito. Arrastrar de viernes a lunes selecciona cuatro casillas pero
 * son dos días de trabajo, y guardar el sábado como inicio dejaría una línea cuya fecha el motor
 * corrige sola en cuanto alguien reprograma — una fecha que cambia sin que nadie la toque.
 */
export function fechasDelRango(
  from: IsoDate,
  to: IsoDate,
  calendar: WorkCalendar,
): { readonly start: IsoDate; readonly finish: IsoDate } | null {
  const desde = toDayNumber(from)
  const hasta = toDayNumber(to)
  let primero: DayNumber | null = null
  let ultimo: DayNumber | null = null
  for (let d = desde; d <= hasta; d += 1) {
    if (!calendar.isWorkingDay(d)) continue
    if (primero === null) primero = d
    ultimo = d
  }
  if (primero === null || ultimo === null) return null
  return { start: toIsoDate(primero), finish: toIsoDate(ultimo) }
}

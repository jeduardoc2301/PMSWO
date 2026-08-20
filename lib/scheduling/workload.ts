/**
 * El cálculo de carga por recurso y día (§3.7 y §8.3).
 *
 * Puro y sin base de datos: entra el plan con sus asignaciones y sale la matriz recurso × día. Es
 * la única forma de comprobar la aritmética contra una cuenta hecha a mano, y de que la vista
 * pueda cambiar de modo —horas, tareas, porcentajes— sin volver a pedir nada al servidor.
 *
 * ## Todo en minutos por día
 *
 * Carga y capacidad se comparan en la misma unidad, minutos/día. El spec avisa del error
 * dimensional que se cuela siempre: `work / duración` **ya es** `units`; volver a multiplicarlo por
 * `units` da `units²` y la comparación deja de significar nada. Aquí sólo existe `units`, y la
 * conversión a horas o a porcentaje se hace al pintar, nunca al calcular.
 *
 * ## `units` en puntos base, no en decimales
 *
 * Media jornada es `5000`, no `0.5`. Tres asignaciones de un tercio suman exactamente `10000` y no
 * `0.9999999999999999`, así que «¿está sobrecargado?» no depende de por dónde caiga el error de un
 * flotante. La misma razón por la que el dinero no se guarda en `float`.
 *
 * ## La capacidad la pone el recurso, no el calendario del proyecto
 *
 * Un día que el proyecto trabaja pero el recurso tiene de vacaciones vale capacidad cero, y
 * cualquier carga que caiga ahí es sobrecarga por definición (§8.5). Esa es la precedencia del
 * §3.1 —calendario de recurso sobre calendario de proyecto— aplicada a lo único que esta vista
 * necesita de ella.
 */

import { type WorkCalendar } from '@/lib/scheduling/calendar'
import { type DayNumber, type IsoDate, toDayNumber, toIsoDate } from '@/lib/scheduling/date'

/** Cien por cien de la jornada, en puntos base. */
export const UNIDADES_COMPLETAS = 10_000

export interface RecursoDeCarga {
  readonly id: string
  readonly name: string
  /** PERSONA, EQUIPO, PROVEEDOR, MAQUINA o CLIENTE. Sólo se usa para agrupar y para el rótulo. */
  readonly kind: string
  /** Minutos que este recurso trabaja en un día laborable suyo. */
  readonly dailyMinutes: number
  /** Días en los que no está: vacaciones, incapacidad, festivo propio. */
  readonly absences: readonly { readonly from: IsoDate; readonly to: IsoDate }[]
}

export interface TareaDeCarga {
  readonly id: string
  readonly name: string
  readonly start: IsoDate
  readonly finish: IsoDate
  /**
   * Un hito no consume calendario, así que **no aporta carga** (§3.5: `Work = Duration × Units`, y
   * la duración de un hito es cero).
   *
   * Sin este campo, un hito con asignación cargaba **una jornada completa** el día que cae. En el
   * plan de referencia son **86 hitos, los 86 con asignación: 86 jornadas de carga que nadie
   * trabaja**. Y no se podía deducir de las fechas, porque **1 064 de las 1 243 hojas duran un solo
   * día**: un hito y una tarea de un día tienen `start === finish` y no son lo mismo.
   *
   * Tener a alguien asignado a un hito significa «esta persona responde de este punto de control», y
   * responder de un punto de control no es trabajo que ocupe una jornada.
   */
  readonly isMilestone?: boolean
}

export interface AsignacionDeCarga {
  readonly taskId: string
  readonly resourceId: string
  /** Fracción de la jornada del recurso, en puntos base. 10000 = jornada completa. */
  readonly unitsBp: number
}

export interface CeldaDeCarga {
  /** Minutos de trabajo comprometidos ese día. */
  readonly cargaMin: number
  /** Minutos que el recurso puede dar ese día. Cero si no trabaja o está ausente. */
  readonly capacidadMin: number
  /** Cuántas tareas suyas están activas ese día. */
  readonly tareas: number
  readonly sobrecargado: boolean
}

export interface FilaDeCarga {
  readonly resource: RecursoDeCarga | null
  /** Una celda por día del rango, en el mismo orden que `days`. */
  readonly celdas: readonly CeldaDeCarga[]
  /** Cuántos días del rango van en rojo. Sirve para ordenar por quién está peor. */
  readonly diasSobrecargados: number
}

export interface DiaDeCarga {
  readonly date: IsoDate
  /** Si el proyecto trabaja ese día. Los que no, se atenúan. */
  readonly isWorking: boolean
}

export interface MatrizDeCarga {
  readonly days: readonly DiaDeCarga[]
  readonly rows: readonly FilaDeCarga[]
  /**
   * La fila «sin asignar»: trabajo huérfano (§8.1).
   *
   * No tiene capacidad —nadie la tiene— así que nunca sale en rojo. Que salga en rojo diría «esta
   * persona está saturada», y el problema es justo el contrario: no hay ninguna persona.
   */
  readonly sinAsignar: FilaDeCarga
  /** Fila superior de capacidad agregada del equipo (§8.4). */
  readonly total: FilaDeCarga
}

export interface EntradaDeCarga {
  readonly resources: readonly RecursoDeCarga[]
  readonly tasks: readonly TareaDeCarga[]
  readonly assignments: readonly AsignacionDeCarga[]
  /** Calendario del proyecto: decide qué días se dibujan atenuados y cuáles cuentan. */
  readonly calendar: WorkCalendar
  readonly from: IsoDate
  readonly to: IsoDate
}

/** Un intervalo cerrado de días, ya en números para poder comparar con enteros. */
interface Tramo {
  readonly desde: DayNumber
  readonly hasta: DayNumber
}

function tramosDeAusencia(recurso: RecursoDeCarga): Tramo[] {
  return recurso.absences.map((a) => ({ desde: toDayNumber(a.from), hasta: toDayNumber(a.to) }))
}

function estaAusente(tramos: readonly Tramo[], dia: DayNumber): boolean {
  for (const tramo of tramos) if (dia >= tramo.desde && dia <= tramo.hasta) return true
  return false
}

/**
 * La matriz de carga del rango pedido.
 *
 * El coste es O(asignaciones × días de la tarea dentro del rango + recursos × días), no
 * O(recursos × días × asignaciones): se recorre cada asignación una vez y se suma sólo en los días
 * que toca. Con cincuenta recursos y tres meses son 4 500 celdas, y el spec pide menos de 500 ms
 * (§8.3); así sobra de largo.
 */
export function workloadMatrix(entrada: EntradaDeCarga): MatrizDeCarga {
  const { resources, tasks, assignments, calendar, from, to } = entrada

  const desde = toDayNumber(from)
  const hasta = toDayNumber(to)
  const anchura = Math.max(0, hasta - desde + 1)

  const days: DiaDeCarga[] = []
  for (let i = 0; i < anchura; i += 1) {
    const dia = (desde + i) as DayNumber
    days.push({ date: toIsoDate(dia), isWorking: calendar.isWorkingDay(dia) })
  }

  const tareaPorId = new Map(tasks.map((t) => [t.id, t]))
  const recursoPorId = new Map(resources.map((r) => [r.id, r]))

  // ── Capacidad, primero ───────────────────────────────────────────────────────────────────────
  // Se resuelve antes que la carga porque «sobrecargado» la necesita, y porque un recurso sin
  // ninguna asignación tiene que salir igual en la matriz: su fila a cero es información —hay
  // quien está libre— y es la mitad de la respuesta a «¿a quién le paso esto?».
  const capacidad = new Map<string, number[]>()
  for (const recurso of resources) {
    const ausencias = tramosDeAusencia(recurso)
    const fila = new Array<number>(anchura)
    for (let i = 0; i < anchura; i += 1) {
      const dia = (desde + i) as DayNumber
      fila[i] = calendar.isWorkingDay(dia) && !estaAusente(ausencias, dia) ? recurso.dailyMinutes : 0
    }
    capacidad.set(recurso.id, fila)
  }

  const carga = new Map<string, number[]>()
  const cuenta = new Map<string, number[]>()
  for (const recurso of resources) {
    carga.set(recurso.id, new Array<number>(anchura).fill(0))
    cuenta.set(recurso.id, new Array<number>(anchura).fill(0))
  }

  const asignadas = new Set<string>()
  for (const asignacion of assignments) asignadas.add(asignacion.taskId)

  // ── Carga ────────────────────────────────────────────────────────────────────────────────────
  for (const asignacion of assignments) {
    const tarea = tareaPorId.get(asignacion.taskId)
    const recurso = recursoPorId.get(asignacion.resourceId)
    // Una asignación a una tarea o a un recurso que no vienen en el corte se ignora sin ruido: el
    // corte está acotado a un proyecto y a un rango, y lo de fuera no es un error.
    if (!tarea || !recurso) continue

    // Un hito no aporta carga: su duración es cero y `Work = Duration × Units` (§3.5). Se salta aquí
    // y no al construir el corte para que el hito siga existiendo en `tasks` — el desglose de un día
    // lo enumera, y quien mira quiere ver qué vence ese día aunque no pese.
    if (tarea.isMilestone) continue

    const filaCarga = carga.get(recurso.id)!
    const filaCuenta = cuenta.get(recurso.id)!

    const inicio = Math.max(desde, toDayNumber(tarea.start))
    const fin = Math.min(hasta, toDayNumber(tarea.finish))

    for (let dia = inicio; dia <= fin; dia += 1) {
      const i = dia - desde
      // El día que el recurso no trabaja no acumula carga: el trabajo no desaparece, se hace otro
      // día. Lo que sí es sobrecarga es tener trabajo comprometido en un día de vacaciones, y eso
      // se detecta en la comparación de abajo, no inflando la carga de un día que no existe.
      if (!calendar.isWorkingDay(dia as DayNumber)) continue

      const jornada = recurso.dailyMinutes
      filaCarga[i] += Math.round((asignacion.unitsBp * jornada) / UNIDADES_COMPLETAS)
      filaCuenta[i] += 1
      // Que la capacidad de ese día sea cero por ausencia no resta carga: acumular igual es
      // precisamente lo que hace que salga en rojo, que es lo que el §8.5 pide ver.
    }
  }

  const rows: FilaDeCarga[] = resources.map((recurso) => {
    const filaCarga = carga.get(recurso.id)!
    const filaCuenta = cuenta.get(recurso.id)!
    const filaCapacidad = capacidad.get(recurso.id)!

    let diasSobrecargados = 0
    const celdas: CeldaDeCarga[] = new Array(anchura)
    for (let i = 0; i < anchura; i += 1) {
      const sobrecargado = filaCarga[i] > filaCapacidad[i]
      if (sobrecargado) diasSobrecargados += 1
      celdas[i] = {
        cargaMin: filaCarga[i],
        capacidadMin: filaCapacidad[i],
        tareas: filaCuenta[i],
        sobrecargado,
      }
    }
    return { resource: recurso, celdas, diasSobrecargados }
  })

  // ── La fila del trabajo huérfano ─────────────────────────────────────────────────────────────
  const huerfanas = tasks.filter((t) => !asignadas.has(t.id))
  const celdasSinAsignar: CeldaDeCarga[] = new Array(anchura)
  const cuentaHuerfana = new Array<number>(anchura).fill(0)
  for (const tarea of huerfanas) {
    const inicio = Math.max(desde, toDayNumber(tarea.start))
    const fin = Math.min(hasta, toDayNumber(tarea.finish))
    for (let dia = inicio; dia <= fin; dia += 1) {
      if (!calendar.isWorkingDay(dia as DayNumber)) continue
      cuentaHuerfana[dia - desde] += 1
    }
  }
  for (let i = 0; i < anchura; i += 1) {
    celdasSinAsignar[i] = {
      cargaMin: 0,
      capacidadMin: 0,
      tareas: cuentaHuerfana[i],
      sobrecargado: false,
    }
  }

  // ── La fila del equipo entero (§8.4) ─────────────────────────────────────────────────────────
  const celdasTotal: CeldaDeCarga[] = new Array(anchura)
  let diasTotalSobrecargados = 0
  for (let i = 0; i < anchura; i += 1) {
    let cargaMin = 0
    let capacidadMin = 0
    let tareas = 0
    for (const fila of rows) {
      cargaMin += fila.celdas[i].cargaMin
      capacidadMin += fila.celdas[i].capacidadMin
      tareas += fila.celdas[i].tareas
    }
    const sobrecargado = cargaMin > capacidadMin
    if (sobrecargado) diasTotalSobrecargados += 1
    celdasTotal[i] = { cargaMin, capacidadMin, tareas, sobrecargado }
  }

  return {
    days,
    rows,
    sinAsignar: { resource: null, celdas: celdasSinAsignar, diasSobrecargados: 0 },
    total: { resource: null, celdas: celdasTotal, diasSobrecargados: diasTotalSobrecargados },
  }
}

export interface DesgloseDeDia {
  readonly taskId: string
  readonly name: string
  readonly unitsBp: number
  readonly minutos: number
}

/**
 * Qué tareas componen la celda de un recurso en un día (§8.5: «las horas cuadran con el total»).
 *
 * Se calcula aparte y bajo demanda en vez de guardarlo en cada celda: con cincuenta recursos y tres
 * meses son 4 500 celdas, y arrastrar el desglose de todas para enseñar el de la que alguien
 * despliegue multiplicaría por veinte lo que viaja por la red para nada.
 */
export function desgloseDelDia(
  entrada: Pick<EntradaDeCarga, 'tasks' | 'assignments' | 'calendar'>,
  resources: readonly RecursoDeCarga[],
  resourceId: string,
  date: IsoDate,
): DesgloseDeDia[] {
  const { tasks, assignments, calendar } = entrada
  const dia = toDayNumber(date)
  if (!calendar.isWorkingDay(dia)) return []

  const recurso = resources.find((r) => r.id === resourceId)
  if (!recurso) return []

  const tareaPorId = new Map(tasks.map((t) => [t.id, t]))

  return assignments
    .filter((a) => a.resourceId === resourceId)
    .flatMap((asignacion) => {
      const tarea = tareaPorId.get(asignacion.taskId)
      if (!tarea) return []
      if (dia < toDayNumber(tarea.start) || dia > toDayNumber(tarea.finish)) return []
      return [
        {
          taskId: tarea.id,
          name: tarea.name,
          unitsBp: asignacion.unitsBp,
          minutos: Math.round((asignacion.unitsBp * recurso.dailyMinutes) / UNIDADES_COMPLETAS),
        },
      ]
    })
    .sort((a, b) => (b.minutos === a.minutos ? a.name.localeCompare(b.name) : b.minutos - a.minutos))
}

/**
 * Quién tiene sitio ese día (§8.4).
 *
 * La mejora sobre la referencia: enseñar la sobrecarga sin ofrecer nada para resolverla deja el
 * problema donde estaba. Devuelve los recursos ordenados por hueco libre, de más a menos.
 */
export function recursosConHueco(
  matriz: MatrizDeCarga,
  date: IsoDate,
): { readonly resource: RecursoDeCarga; readonly libreMin: number }[] {
  const i = matriz.days.findIndex((d) => d.date === date)
  if (i === -1) return []

  return matriz.rows
    .flatMap((fila) => {
      if (!fila.resource) return []
      const celda = fila.celdas[i]
      const libreMin = celda.capacidadMin - celda.cargaMin
      return libreMin > 0 ? [{ resource: fila.resource, libreMin }] : []
    })
    .sort((a, b) =>
      b.libreMin === a.libreMin ? a.resource.name.localeCompare(b.resource.name) : b.libreMin - a.libreMin,
    )
}

export interface FilaDeDesglose {
  readonly taskId: string
  readonly name: string
  readonly unitsBp: number
  /** Minutos que esta tarea aporta cada día del rango, en el mismo orden que `days`. */
  readonly minutosPorDia: readonly number[]
  /** Minutos que suma en todo el rango. Sirve para ordenar por quién pesa más. */
  readonly total: number
}

/**
 * El desglose de un recurso: una fila por tarea suya, a lo largo del rango (§8.5, criterio 4).
 *
 * El criterio dice «expandir un recurso muestra el desglose por tarea **y las horas cuadran con el
 * total de la celda**». Esa segunda mitad es la que obliga a calcularlo aquí y no a ojo en la
 * pantalla: la suma de la columna en el desglose tiene que dar exactamente la celda del recurso, y
 * eso sólo se garantiza si las dos salen de la misma aritmética.
 *
 * Ojo con la simetría: un día no laborable no acumula carga en la celda del recurso, así que
 * tampoco puede acumularla aquí. Si el desglose contara ese día, la suma dejaría de cuadrar justo
 * en los fines de semana.
 */
export function desglosePorTarea(
  entrada: Pick<EntradaDeCarga, 'tasks' | 'assignments' | 'calendar' | 'from' | 'to'>,
  resources: readonly RecursoDeCarga[],
  resourceId: string,
): FilaDeDesglose[] {
  const { tasks, assignments, calendar, from, to } = entrada
  const recurso = resources.find((r) => r.id === resourceId)
  if (!recurso) return []

  const desde = toDayNumber(from)
  const hasta = toDayNumber(to)
  const anchura = Math.max(0, hasta - desde + 1)
  const tareaPorId = new Map(tasks.map((t) => [t.id, t]))

  const filas: FilaDeDesglose[] = []

  for (const asignacion of assignments) {
    if (asignacion.resourceId !== resourceId) continue
    const tarea = tareaPorId.get(asignacion.taskId)
    if (!tarea) continue

    const minutosPorDia = new Array<number>(anchura).fill(0)
    const porDia = Math.round((asignacion.unitsBp * recurso.dailyMinutes) / UNIDADES_COMPLETAS)

    const inicio = Math.max(desde, toDayNumber(tarea.start))
    const fin = Math.min(hasta, toDayNumber(tarea.finish))
    let total = 0
    for (let dia = inicio; dia <= fin; dia += 1) {
      if (!calendar.isWorkingDay(dia as DayNumber)) continue
      minutosPorDia[dia - desde] = porDia
      total += porDia
    }

    // Una tarea que no toca ni un día laborable del rango no aporta una fila vacía: sería una
    // línea de ceros que sólo estorba a quien busca de dónde sale la sobrecarga.
    if (total === 0) continue
    filas.push({
      taskId: tarea.id,
      name: tarea.name,
      unitsBp: asignacion.unitsBp,
      minutosPorDia,
      total,
    })
  }

  return filas.sort((a, b) => (b.total === a.total ? a.name.localeCompare(b.name) : b.total - a.total))
}

/**
 * Qué está atrasado, cuánto, y de quién depende.
 *
 * ## Las tres decisiones que hacen que esto no mienta
 *
 * **1. Solo hojas.** Una línea que tiene hijas es un renglón de agrupación: nadie la ejecuta, su
 * fecha es el envoltorio de las fechas de abajo y su avance en la base está en cero porque el
 * acumulado se calcula al dibujar, no al guardar. Contarla como atrasada suma el atraso de sus
 * hijas por segunda vez. En el plan real eso metía 75 renglones de resumen en la lista de
 * vencidas —de los cuales 23 tenían TODAS sus hojas terminadas—, y siete de las diez peores que
 * llegaban al reporte eran resúmenes. La narrativa del comité se estaba construyendo sobre
 * renglones que nadie puede ejecutar.
 *
 * «Tener hijas» y no `kind === 'RESUMEN'`: en el plan real son 125 contra 121, y esas cuatro
 * líneas de diferencia sí tienen hijas.
 *
 * **2. Días hábiles, y se dice la palabra.** El motor cuenta en días hábiles y el calendario
 * civil en naturales. Sobre las mismas hojas la diferencia es más del doble. Un directivo que lee
 * «72 días de atraso» piensa en dos meses y medio; son catorce semanas. Aquí todo va en hábiles y
 * el maquetado escribe «hábiles» cada vez.
 *
 * **3. Lo que vence hoy no está atrasado.** Se usa `isOverdue`, la definición única del §9.3 que
 * ya comparten el Panel, la lista y el Tablero: medianoche local, `<` estricto, y fuera lo que
 * está al 100 % o en estado terminal. Comparar contra la marca de tiempo completa marcaba como
 * incumplidas once tareas cuyo plazo vencía al cierre de ese mismo día.
 */
import { type WorkCalendar } from '@/lib/scheduling/calendar'
import { toDayNumber } from '@/lib/scheduling/date'
import { isOverdue } from '@/lib/urgency'

/** Clases que el comité decide. El resto es ejecución. */
const CLASES_DE_COMPROMISO = new Set([
  'HITO',
  'PUNTO_DE_CONTROL',
  'ENTREGA_CLIENTE',
  'APROBACION_CLIENTE',
  'COMPUERTA',
])

export interface LineaDelPlan {
  readonly id: string
  readonly parentId?: string | null
  readonly title: string
  readonly phase?: string | null
  readonly kind?: string | null
  readonly party?: string | null
  readonly status: string
  readonly progressPct?: number | null
  readonly startDate: Date
  readonly estimatedEndDate: Date
}

export interface LineaAtrasada {
  readonly id: string
  readonly titulo: string
  readonly fase: string | null
  readonly clase: string
  readonly parte: 'CLIENTE' | 'PROVEEDOR'
  readonly comprometidaPara: Date
  readonly diasHabilesDeAtraso: number
  readonly avancePct: number
  /** Hito, entrega, aprobación o compuerta: lo que un comité decide, no lo que un equipo ejecuta. */
  readonly esCompromiso: boolean
  /**
   * Líneas cuya barra abarca casi todo el proyecto: comités recurrentes, gobierno, seguimiento.
   * Su «atraso» es que llevan corriendo desde el arranque, no que alguien falló.
   */
  readonly esCadencia: boolean
}

/** Un tramo del reparto de atrasos: cuántas actividades caen en él. */
export interface TramoDeAtraso {
  readonly rotulo: string
  readonly desde: number
  readonly hasta: number | null
  readonly cuantas: number
}

export interface Atrasos {
  /** Cuántas líneas ejecutables se examinaron. */
  readonly hojasExaminadas: number
  readonly atrasadas: readonly LineaAtrasada[]

  /**
   * Cuánto lleva de atraso la actividad que está justo a la mitad.
   *
   * Se publica la mediana y NO la suma de todos los atrasos. La suma daba 2 188 en el plan real, y
   * leída como duración son casi nueve años: absurda. El error no es de redondeo, es de concepto —
   * las actividades corren en paralelo, así que sumar sus atrasos no produce ningún periodo de
   * tiempo. Doscientas cuarenta y siete actividades atrasadas nueve días cada una son nueve días
   * de atraso, no dos mil.
   *
   * La mediana sí se puede leer: «la mitad del trabajo atrasado lleva una semana y media o más».
   */
  readonly medianaDiasHabiles: number
  /** El peor atraso individual. Junto con la mediana da la forma del problema. */
  readonly maximoDiasHabiles: number
  /**
   * El reparto por tramos.
   *
   * Distingue el caso «cien actividades con tres días de atraso» del caso «diez actividades
   * paradas dos meses». Los dos dan la misma mediana y piden decisiones opuestas.
   */
  readonly reparto: readonly TramoDeAtraso[]
  /** Atrasos de lo que el comité decide, de mayor a menor. Es la lista que importa. */
  readonly compromisos: readonly LineaAtrasada[]
  /** Atrasos de ejecución, sin las líneas de cadencia. */
  readonly ejecucion: readonly LineaAtrasada[]
  /** Apartadas a propósito para que no encabecen el ranking siendo ruido. */
  readonly cadencia: readonly LineaAtrasada[]
  readonly porParte: { readonly CLIENTE: number; readonly PROVEEDOR: number }
  /** Cuántas de las atrasadas todavía no han arrancado (0 % capturado). */
  readonly sinArrancar: number
}

/**
 * Una línea es «de cadencia» cuando su barra cubre más de la mitad del proyecto.
 *
 * No es una heurística caprichosa: las dos peores del ranking real eran un comité semanal y un
 * seguimiento, ambos con la barra corriendo desde junio y 0 % capturado. Presentarlos como las dos
 * mayores fallas del proyecto ante el comité tapa lo que de verdad importa — la aprobación formal
 * del diseño de red, el Transit Gateway — con ruido de gobierno.
 */
const FRACCION_DE_CADENCIA = 0.5

export interface EntradaDeAtrasos {
  readonly lineas: readonly LineaDelPlan[]
  readonly calendar: WorkCalendar
  /**
   * La fecha de corte, como fecha civil `AAAA-MM-DD`. Entra así y no como `Date` a propósito.
   *
   * Un `Date` obliga a decidir en cada uso si su día es el local o el de UTC, y aquí conviven las
   * dos convenciones: `isOverdue` compara contra medianoche LOCAL, y los ordinales del calendario
   * laborable se leen de la fecha civil. En un servidor en UTC las dos coinciden y el defecto no
   * se ve; desde una máquina en UTC−6 a las siete de la tarde, el corte se va un día y el reporte
   * cuenta las actividades de mañana. Una cadena no se puede malinterpretar.
   */
  readonly corte: string
  readonly inicioDelProyecto: Date
  readonly finDelProyecto: Date
}

export function calcularAtrasos(entrada: EntradaDeAtrasos): Atrasos {
  const { lineas, calendar, corte, inicioDelProyecto, finDelProyecto } = entrada

  const conHijas = new Set(
    lineas.map((l) => l.parentId).filter((id): id is string => Boolean(id))
  )
  const hojas = lineas.filter((l) => !conHijas.has(l.id))

  // Prisma devuelve las columnas `@db.Date` en medianoche UTC, así que su día correcto es el de
  // UTC. La fecha de corte, en cambio, ya viene resuelta como fecha civil.
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  // Medianoche LOCAL del día de corte: es lo que `isOverdue` necesita para que su comparación
  // caiga en el día civil correcto.
  const [anio, mes, dia] = corte.split('-').map(Number)
  const hoyLocal = new Date(anio, mes - 1, dia)
  const ordinalDeHoy = calendar.ordinalOf(toDayNumber(corte))

  const duracionDelProyecto = Math.max(
    1,
    Math.round((+finDelProyecto - +inicioDelProyecto) / 86400000)
  )

  const atrasadas: LineaAtrasada[] = []
  for (const l of hojas) {
    const vencida = isOverdue(
      {
        estimatedEndDate: iso(l.estimatedEndDate),
        status: l.status,
        progressPct: l.progressPct ?? 0,
      },
      hoyLocal
    )
    if (!vencida) continue

    // La deuda es cuántos días hábiles han pasado desde que debió cerrar. Nunca menos de uno: si
    // `isOverdue` dijo que sí, la fecha ya quedó atrás aunque en medio solo hubiera fin de semana.
    const diasHabiles = Math.max(1, ordinalDeHoy - calendar.ordinalOf(toDayNumber(iso(l.estimatedEndDate))))

    const abarca = Math.round((+l.estimatedEndDate - +l.startDate) / 86400000)
    const clase = l.kind ?? 'ACTIVIDAD'

    atrasadas.push({
      id: l.id,
      titulo: l.title,
      fase: l.phase ?? null,
      clase,
      parte: l.party === 'CLIENTE' ? 'CLIENTE' : 'PROVEEDOR',
      comprometidaPara: l.estimatedEndDate,
      diasHabilesDeAtraso: diasHabiles,
      avancePct: Math.round((l.progressPct ?? 0) * 100),
      esCompromiso: CLASES_DE_COMPROMISO.has(clase),
      esCadencia: abarca > duracionDelProyecto * FRACCION_DE_CADENCIA,
    })
  }

  atrasadas.sort((a, b) => b.diasHabilesDeAtraso - a.diasHabilesDeAtraso)

  const compromisos = atrasadas.filter((a) => a.esCompromiso && !a.esCadencia)
  const cadencia = atrasadas.filter((a) => a.esCadencia)
  const ejecucion = atrasadas.filter((a) => !a.esCompromiso && !a.esCadencia)

  const ordenados = atrasadas.map((a) => a.diasHabilesDeAtraso).sort((x, y) => x - y)
  const mediana = ordenados.length === 0 ? 0 : ordenados[Math.floor((ordenados.length - 1) / 2)]

  const TRAMOS: readonly { rotulo: string; desde: number; hasta: number | null }[] = [
    { rotulo: 'Hasta una semana', desde: 1, hasta: 5 },
    { rotulo: 'Una a dos semanas', desde: 6, hasta: 10 },
    { rotulo: 'Dos a cuatro semanas', desde: 11, hasta: 20 },
    { rotulo: 'Más de cuatro semanas', desde: 21, hasta: null },
  ]
  const reparto = TRAMOS.map((t) => ({
    ...t,
    cuantas: ordenados.filter((d) => d >= t.desde && (t.hasta === null || d <= t.hasta)).length,
  }))

  return {
    hojasExaminadas: hojas.length,
    atrasadas,
    medianaDiasHabiles: mediana,
    maximoDiasHabiles: ordenados.length === 0 ? 0 : ordenados[ordenados.length - 1],
    reparto,
    compromisos,
    ejecucion,
    cadencia,
    porParte: {
      CLIENTE: atrasadas.filter((a) => a.parte === 'CLIENTE').length,
      PROVEEDOR: atrasadas.filter((a) => a.parte === 'PROVEEDOR').length,
    },
    sinArrancar: atrasadas.filter((a) => a.avancePct === 0).length,
  }
}

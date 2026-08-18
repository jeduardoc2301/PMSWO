/**
 * Las métricas del panel de control del proyecto (§9).
 *
 * Es una función pura: entra el plan y una fecha de corte, sale el paquete completo de métricas.
 * No toca la base, no sabe de React y no lee el reloj por su cuenta. Eso es lo que permite
 * comprobar cada fórmula contra una cuenta hecha a mano, que es justo lo que pide el §9.3.
 *
 * ## Por qué el paquete viene entero
 *
 * El §9.2 pide un solo cálculo en el servidor en vez de seis consultas desde el navegador. La razón
 * no es sólo el número de viajes: son seis números que tienen que hablar entre sí. «Avance real» del
 * widget de calendario y «progreso global» del widget de información son *la misma cuenta*. Si cada
 * widget la resolviera por su lado, el día que alguien cambie el ponderado tendríamos un panel que
 * se contradice a sí mismo en la misma pantalla.
 *
 * ## Los dos widgets que no se entregan
 *
 * El §9.4 lo anticipa: sin `TimeLog` no hay «tiempo registrado», y sin `budget`/`actualCost` no hay
 * presupuesto. Aquí se devuelven como `null` —no como ceros— y la pantalla enseña un estado vacío
 * que dice qué falta. Un gráfico en cero se lee como «no hay desviación», que es exactamente lo
 * contrario de lo que pasa: no hay dato.
 */

import { type WorkCalendar } from '@/lib/scheduling/calendar'
import { type DayNumber, type IsoDate } from '@/lib/scheduling/date'
import { esClaseDeHito } from '@/lib/scheduling/kinds'
import { isOverdue } from '@/lib/urgency'

/** Una línea del plan, con lo justo que el panel necesita. */
export interface LineaDelPanel {
  readonly id: string
  readonly title: string
  readonly kind: string
  readonly status: string
  readonly startDate: IsoDate
  readonly estimatedEndDate: IsoDate
  /** Avance capturado, de 0 a 1. */
  readonly progressPct: number
  readonly parentId: string | null
  /** Quién responde: PROVEEDOR, CLIENTE o AMBOS. */
  readonly party: string
  /** Nombre del responsable del lado del cliente, cuando lo hay. */
  readonly clientOwner: string | null
}

export interface CorteDelPanel {
  readonly lineas: readonly LineaDelPanel[]
  readonly proyecto: {
    readonly startDate: IsoDate
    readonly estimatedEndDate: IsoDate
    readonly updatedAt: string
  }
  readonly calendar: WorkCalendar
  /** Fecha civil de corte. Entra por parámetro: una métrica que lee el reloj no se puede probar. */
  readonly hoy: IsoDate
}

export interface RebanadaDeEstado {
  readonly estado: string
  readonly cantidad: number
  /** De 0 a 1 sobre el total del grupo. Cero cuando el grupo está vacío. */
  readonly fraccion: number
}

export interface HitoDelPanel {
  readonly id: string
  readonly nombre: string
  readonly fecha: IsoDate
  readonly estado: string
  readonly atrasado: boolean
}

export interface MetricasDelPanel {
  readonly proyecto: {
    readonly inicio: IsoDate
    readonly fin: IsoDate
    readonly ultimoCambio: string
    /** Avance global ponderado por duración sobre las hojas, de 0 a 1. */
    readonly progresoGlobal: number
    /** Duración del proyecto en días hábiles. */
    readonly duracionHabil: number
  }
  readonly tareas: {
    readonly total: number
    readonly hojas: number
    readonly resumenes: number
    /**
     * Líneas que responde el cliente y no tienen a nadie nombrado.
     *
     * No es «sin asignar» en el sentido del spec —que cuenta líneas sin ninguna `Assignment`—
     * porque en este modelo `ownerId` es obligatorio: del lado del proveedor nunca hay una línea
     * sin dueño, y un contador que siempre dice cero no informa de nada. Lo que sí puede faltar,
     * y falta a menudo, es el nombre del responsable del lado del cliente.
     */
    readonly sinResponsableDelCliente: number
    readonly atrasadas: number
    readonly porEstado: readonly RebanadaDeEstado[]
  }
  readonly hitos: {
    readonly total: number
    readonly atrasados: number
    readonly porEstado: readonly RebanadaDeEstado[]
    readonly lista: readonly HitoDelPanel[]
  }
  readonly avanceTemporal: {
    /** Fracción del calendario laborable del proyecto ya transcurrida, de 0 a 1. */
    readonly planificado: number
    /** El avance global: la misma cuenta que `proyecto.progresoGlobal`, no una segunda. */
    readonly real: number
    /** Real menos planificado. Positivo va adelantado; negativo, retrasado. */
    readonly desviacion: number
  }
  /** `null` mientras no exista `TimeLog`. Ver §9.4. */
  readonly tiempo: null
  /** `null` mientras no existan `budget`/`actualCost`. Ver §9.4. */
  readonly presupuesto: null
}

/** El orden en que se leen los estados: es un embudo, no un conjunto de etiquetas sueltas. */
export const ORDEN_DE_ESTADOS: readonly string[] = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE']

/** Convierte `AAAA-MM-DD` al número de día civil que usa el calendario laborable. */
function aDia(fecha: IsoDate): DayNumber {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return Math.floor(Date.UTC(a, m - 1, d) / 86_400_000) as DayNumber
}

/**
 * Duración de una línea en días hábiles, contando los dos extremos.
 *
 * Es la misma cuenta que `NETWORKDAYS`, que es la que hace el resto del sistema. Un hito —un solo
 * día— pesa uno, no cero: si pesara cero, un plan que fuera sólo compromisos daría división por
 * cero y el avance global sería incalculable en vez de ser, sencillamente, la media de los hitos.
 */
function duracionHabil(calendar: WorkCalendar, inicio: IsoDate, fin: IsoDate): number {
  return calendar.countBetween(aDia(inicio), aDia(fin))
}

/** Reparte un grupo de líneas por estado, en el orden del embudo y con los desconocidos al final. */
function repartirPorEstado(lineas: readonly LineaDelPanel[]): RebanadaDeEstado[] {
  const cuenta = new Map<string, number>()
  for (const linea of lineas) cuenta.set(linea.status, (cuenta.get(linea.status) ?? 0) + 1)

  const conocidos = ORDEN_DE_ESTADOS.filter((estado) => cuenta.has(estado))
  // Un estado que no esté en el embudo se dibuja igual, al final: los estados son texto libre en
  // este modelo, y esconder uno porque no lo esperábamos haría que las rebanadas no sumaran el
  // total y nadie sabría por qué.
  const inesperados = [...cuenta.keys()].filter((estado) => !ORDEN_DE_ESTADOS.includes(estado)).sort()

  const total = lineas.length
  return [...conocidos, ...inesperados].map((estado) => {
    const cantidad = cuenta.get(estado) ?? 0
    return { estado, cantidad, fraccion: total === 0 ? 0 : cantidad / total }
  })
}

export function dashboardMetrics(corte: CorteDelPanel): MetricasDelPanel {
  const { lineas, proyecto, calendar, hoy } = corte
  const hoyFecha = new Date(`${hoy}T00:00:00`)

  const conHijos = new Set<string>()
  for (const linea of lineas) if (linea.parentId) conHijos.add(linea.parentId)

  const hojas = lineas.filter((linea) => !conHijos.has(linea.id))
  const resumenes = lineas.length - hojas.length

  // ── Avance global ponderado por duración, sobre las hojas ────────────────────────────────────
  // Sobre las hojas y no sobre todo el plan porque un resumen no tiene avance propio: hereda el de
  // sus hijas. Sumarlo otra vez sería contar el mismo trabajo dos veces, y en un plan con siete
  // niveles de resumen el ponderado quedaría dominado por las ramas más profundas.
  let trabajo = 0
  let hecho = 0
  for (const hoja of hojas) {
    const duracion = duracionHabil(calendar, hoja.startDate, hoja.estimatedEndDate)
    trabajo += duracion
    hecho += duracion * Math.min(1, Math.max(0, hoja.progressPct))
  }
  const progresoGlobal = trabajo === 0 ? 0 : hecho / trabajo

  // ── Avance temporal ──────────────────────────────────────────────────────────────────────────
  // Con el calendario laborable, no con días naturales (§9.3): un proyecto de tres meses con dos
  // semanas de fiestas de por medio va menos avanzado de lo que dice el almanaque.
  //
  // Las dos cuentas son inclusivas —la misma convención que la duración— para que el primer día
  // del proyecto valga 1/N y el último, N/N. El recorte importa en los dos extremos: antes de
  // empezar `countBetween` ya devuelve cero, y después de la fecha de fin el numerador supera al
  // denominador.
  const duracionDelProyecto = duracionHabil(calendar, proyecto.startDate, proyecto.estimatedEndDate)
  const transcurrido = duracionHabil(calendar, proyecto.startDate, hoy)
  const planificado =
    duracionDelProyecto === 0 ? 0 : Math.min(1, Math.max(0, transcurrido / duracionDelProyecto))

  // ── Hitos ────────────────────────────────────────────────────────────────────────────────────
  const hitos = lineas.filter((linea) => esClaseDeHito(linea.kind))
  const listaDeHitos: HitoDelPanel[] = hitos
    .map((hito) => ({
      id: hito.id,
      nombre: hito.title,
      fecha: hito.estimatedEndDate,
      estado: hito.status,
      atrasado: isOverdue(
        { estimatedEndDate: hito.estimatedEndDate, status: hito.status, progressPct: hito.progressPct },
        hoyFecha,
      ),
    }))
    .sort((a, b) => (a.fecha === b.fecha ? a.nombre.localeCompare(b.nombre) : a.fecha.localeCompare(b.fecha)))

  const atrasadas = lineas.filter((linea) =>
    isOverdue(
      { estimatedEndDate: linea.estimatedEndDate, status: linea.status, progressPct: linea.progressPct },
      hoyFecha,
    ),
  ).length

  const sinResponsableDelCliente = lineas.filter(
    (linea) =>
      (linea.party === 'CLIENTE' || linea.party === 'AMBOS') &&
      (linea.clientOwner === null || linea.clientOwner.trim() === ''),
  ).length

  return {
    proyecto: {
      inicio: proyecto.startDate,
      fin: proyecto.estimatedEndDate,
      ultimoCambio: proyecto.updatedAt,
      progresoGlobal,
      duracionHabil: duracionDelProyecto,
    },
    tareas: {
      total: lineas.length,
      hojas: hojas.length,
      resumenes,
      sinResponsableDelCliente,
      atrasadas,
      porEstado: repartirPorEstado(hojas),
    },
    hitos: {
      total: hitos.length,
      atrasados: listaDeHitos.filter((hito) => hito.atrasado).length,
      porEstado: repartirPorEstado(hitos),
      lista: listaDeHitos,
    },
    avanceTemporal: {
      planificado,
      real: progresoGlobal,
      desviacion: progresoGlobal - planificado,
    },
    tiempo: null,
    presupuesto: null,
  }
}

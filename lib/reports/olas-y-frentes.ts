/**
 * Las olas de migración y los frentes de plataforma, medidos contra la proyección.
 *
 * La cifra principal del reporte dice cuándo cierra el proyecto. Al banco, sin embargo, lo que le
 * pesa es cuándo se mueve CADA grupo de servidores, y al comité lo que le sirve es saber qué parte
 * de la plataforma está deteniendo a esas olas. Esto contesta las dos cosas con el mismo método que
 * la cifra principal, para que los números de las tres secciones cuadren entre sí:
 *
 *   **Atraso real** = días hábiles entre la fecha comprometida en el plan y la fecha proyectada.
 *
 * La proyección (`lib/scheduling/proyeccion.ts`) reancla a hoy lo que ya debió arrancar y no ha
 * arrancado, y reprograma la cadena. No es un pronóstico: es el suelo mecánico.
 *
 * ## Cómo se reconoce cada cosa
 *
 * Por el título de la línea, porque es lo único estable que tiene el plan. Si mañana alguien
 * renombra una ola, sale del reporte en vez de salir mal: una sección que falta se nota; una cifra
 * equivocada, no.
 *
 *   - **Ola**: grupo cuyo título empieza con «Ola N», con hijas. Su corte es la hoja que dice
 *     «aceptación del cutover».
 *   - **Compuerta**: línea «HAB-0N · … — … olas X a Y» o «… olas 5, 7, 8 y 10».
 *   - **Frente**: las líneas EN-0X (diseño y construcción juntas), la construcción semanal de la
 *     Landing Zone, el servicio de migración, Oracle y los insumos del banco.
 *
 * Los grupos no traen fechas propias en el motor —su fecha no se deriva de sus hijas— ni avance —el
 * acumulado se calcula al dibujar—, así que todo se mide sobre las hojas.
 *
 * Este módulo no lee el reloj ni la base: todo entra por parámetro.
 */
import type { WorkCalendar } from '@/lib/scheduling/calendar'
import { type IsoDate, toDayNumber } from '@/lib/scheduling/date'
import type { PlanTask } from '@/lib/scheduling/types'

const TERMINALES = new Set(['DONE', 'CLOSED', 'CANCELLED'])

export type Semaforo = 'En tiempo' | 'Atención' | 'En riesgo'

/**
 * Los umbrales, en días hábiles de atraso real. Acordados con el PM: cero es en tiempo; hasta una
 * semana es atención; más de una semana es riesgo.
 */
export function semaforoDe(diasHabiles: number): Semaforo {
  if (diasHabiles <= 0) return 'En tiempo'
  if (diasHabiles <= 5) return 'Atención'
  return 'En riesgo'
}

export interface OlaDelReporte {
  readonly numero: number
  /** «QA», «QA/DEV», «PROD». */
  readonly ambiente: string
  readonly servidores: number | null
  readonly fase: string
  readonly corteComprometido: IsoDate | null
  /** Nulo cuando la ola ya se cortó: no hay nada que proyectar. */
  readonly corteProyectado: IsoDate | null
  readonly cortada: boolean
  /** Avance capturado del hito de corte, de 0 a 1. */
  readonly avanceDelCorte: number
  readonly atrasoDiasHabiles: number | null
  readonly semaforo: Semaforo | null
  readonly avanceReal: number
  readonly avanceEsperado: number
  readonly vencidas: number
  /** Códigos de las compuertas que la condicionan, «HAB-01». */
  readonly compuertas: readonly string[]
}

export interface CompuertaDelReporte {
  readonly codigo: string
  readonly nombre: string
  readonly olas: readonly number[]
  readonly listas: number
  readonly total: number
  readonly vencidas: number
  /** La fecha comprometida más antigua entre las vencidas: desde cuándo está parada. */
  readonly vencidaDesde: IsoDate | null
  readonly comprometida: IsoDate
  readonly proyectada: IsoDate
  readonly atrasoDiasHabiles: number
  readonly semaforo: Semaforo
  readonly terminada: boolean
}

export interface FrenteDelReporte {
  readonly nombre: string
  readonly hojas: number
  readonly avanceReal: number
  readonly avanceEsperado: number
  readonly comprometido: IsoDate
  readonly proyectado: IsoDate
  readonly atrasoDiasHabiles: number
  readonly semaforo: Semaforo
  readonly terminado: boolean
  readonly vencidas: number
}

export type AlertaDeOlas =
  /** Una ola aparece cortada antes que otra de número menor. Puede ser real o un error de captura. */
  | { readonly tipo: 'orden'; readonly cortada: number; readonly pendiente: number; readonly avanceDelCortePendiente: number }
  /** Todas las olas pendientes se corren lo mismo: van encadenadas. */
  | { readonly tipo: 'encadenadas'; readonly cuantas: number; readonly diasHabiles: number }
  /** Una compuerta sin ninguna actividad lista y con todas vencidas. */
  | { readonly tipo: 'compuertaDetenida'; readonly codigo: string; readonly nombre: string; readonly total: number; readonly desde: IsoDate; readonly olas: readonly number[] }

export interface OlasYFrentes {
  readonly olas: readonly OlaDelReporte[]
  readonly compuertas: readonly CompuertaDelReporte[]
  readonly frentes: readonly FrenteDelReporte[]
  readonly alertas: readonly AlertaDeOlas[]
}

export interface EntradaDeOlasYFrentes {
  readonly tasks: readonly PlanTask[]
  /** El pase adelante del plan tal como está capturado: de aquí sale lo comprometido. */
  readonly base: { readonly byId: ReadonlyMap<string, { readonly start: IsoDate; readonly finish: IsoDate }> }
  /** El fin proyectado de cada hoja, de `Proyeccion.finPorLinea`. */
  readonly finProyectado: ReadonlyMap<string, IsoDate>
  readonly calendar: WorkCalendar
  readonly hoy: IsoDate
}

/** Sin acentos y en minúsculas, para reconocer títulos escritos a mano. */
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Los frentes, en el orden en que se leen. El orden importa: primero lo que se diseñó por frente,
 * luego la construcción de la Landing Zone —que el plan organiza por semanas y no por frente, y por
 * eso va aparte—, luego lo que alimenta a las olas.
 */
const FRENTES: readonly { readonly nombre: string; readonly patron: RegExp }[] = [
  { nombre: 'EN-01 · Landing Zone', patron: /^en-01\b/ },
  { nombre: 'EN-02 · Red y conectividad', patron: /^en-02\b/ },
  { nombre: 'EN-03 · Seguridad e identidad', patron: /^en-03\b/ },
  { nombre: 'EN-04 · Monitoreo y registros', patron: /^en-04\b/ },
  { nombre: 'EN-05 · Respaldo y DR', patron: /^en-05\b/ },
  { nombre: 'EN-07 · Gobierno / CCoE', patron: /^en-07\b/ },
  { nombre: 'Construcción de la Landing Zone', patron: /^construir la landing zone/ },
  { nombre: 'Servicio de migración (MGN)', patron: /^preparar el servicio de migracion/ },
  { nombre: 'Oracle → RDS', patron: /^migrar las \d+ bases de datos oracle/ },
  { nombre: 'Insumos y decisiones del banco', patron: /^insumos y decisiones del banco/ },
]

/** Las olas que condiciona una compuerta, leídas de su título: «olas 0 a 3», «(4 a 10)», «olas 5, 7, 8 y 10». */
export function olasDeLaCompuerta(titulo: string): number[] {
  const t = normalizar(titulo)
  const i = t.lastIndexOf('olas')
  if (i < 0) return []
  const cola = t.slice(i + 4)
  const rango = cola.match(/(\d+)\s+a\s+(\d+)/)
  if (rango) {
    const [desde, hasta] = [Number(rango[1]), Number(rango[2])]
    return hasta >= desde ? Array.from({ length: hasta - desde + 1 }, (_, k) => desde + k) : []
  }
  return (cola.match(/\d+/g) ?? []).map(Number)
}

export function calcularOlasYFrentes(entrada: EntradaDeOlasYFrentes): OlasYFrentes {
  const { tasks, base, finProyectado, calendar, hoy } = entrada

  const porId = new Map(tasks.map((t) => [t.id, t]))
  const hijas = new Map<string, string[]>()
  for (const t of tasks) {
    if (!t.parentId) continue
    const lista = hijas.get(t.parentId)
    if (lista) lista.push(t.id)
    else hijas.set(t.parentId, [t.id])
  }
  const hojasDe = (id: string): string[] => {
    const h = hijas.get(id)
    return h && h.length ? h.flatMap(hojasDe) : [id]
  }

  const habiles = (desde: IsoDate, hasta: IsoDate) =>
    calendar.ordinalOf(toDayNumber(hasta)) - calendar.ordinalOf(toDayNumber(desde))

  const terminada = (t: PlanTask) => TERMINALES.has(t.status ?? '') || (t.progress ?? 0) >= 1
  const avanceDe = (t: PlanTask) => (terminada(t) ? 1 : Math.max(0, Math.min(1, t.progress ?? 0)))
  const peso = (t: PlanTask) => Math.max(1, t.duration)

  /** Avance ponderado por duración, como el del Panel. */
  const avanceReal = (ids: readonly string[]) => {
    let hecho = 0
    let total = 0
    for (const id of ids) {
      const t = porId.get(id)!
      hecho += peso(t) * avanceDe(t)
      total += peso(t)
    }
    return total ? hecho / total : 0
  }

  /** Lo que ya debería estar hecho si cada hoja hubiera avanzado parejo en sus fechas comprometidas. */
  const avanceEsperado = (ids: readonly string[]) => {
    let hecho = 0
    let total = 0
    for (const id of ids) {
      const t = porId.get(id)!
      const b = base.byId.get(id)
      if (!b) continue
      const duracion = Math.max(1, habiles(b.start, b.finish) + 1)
      const transcurrido = Math.max(0, Math.min(duracion, habiles(b.start, hoy)))
      hecho += (peso(t) * transcurrido) / duracion
      total += peso(t)
    }
    return total ? hecho / total : 0
  }

  const vencidasDe = (ids: readonly string[]) =>
    ids.filter((id) => {
      const t = porId.get(id)!
      const b = base.byId.get(id)
      return !terminada(t) && b !== undefined && b.finish < hoy
    })

  const maxFecha = (fechas: readonly (IsoDate | undefined)[]): IsoDate | null => {
    let mayor: IsoDate | null = null
    for (const f of fechas) if (f && (mayor === null || f > mayor)) mayor = f
    return mayor
  }

  // ── Compuertas ──────────────────────────────────────────────────────────────────────────────
  const compuertas: CompuertaDelReporte[] = []
  for (const t of tasks) {
    const codigo = t.name.match(/^\s*(HAB-\d+)/i)?.[1]?.toUpperCase()
    if (!codigo) continue
    const hojas = hojasDe(t.id)
    const comprometida = maxFecha(hojas.map((id) => base.byId.get(id)?.finish))
    const proyectada = maxFecha(hojas.map((id) => finProyectado.get(id) ?? base.byId.get(id)?.finish))
    if (!comprometida || !proyectada) continue
    const vencidas = vencidasDe(hojas)
    const listas = hojas.filter((id) => terminada(porId.get(id)!)).length
    const atraso = Math.max(0, habiles(comprometida, proyectada))
    // «HAB-04 · Latencia ≤10 ms hacia el núcleo bancario IBM i — condición de…» → lo del medio.
    const nombre = t.name.replace(/^\s*HAB-\d+\s*[·:-]?\s*/i, '').split(/\s+[—–]\s+/)[0].trim()
    compuertas.push({
      codigo,
      nombre,
      olas: olasDeLaCompuerta(t.name),
      listas,
      total: hojas.length,
      vencidas: vencidas.length,
      vencidaDesde: vencidas.length
        ? vencidas.map((id) => base.byId.get(id)!.finish).sort()[0]
        : null,
      comprometida,
      proyectada,
      atrasoDiasHabiles: atraso,
      semaforo: semaforoDe(atraso),
      terminada: listas === hojas.length,
    })
  }
  compuertas.sort((a, b) => a.codigo.localeCompare(b.codigo))

  // ── Olas ────────────────────────────────────────────────────────────────────────────────────
  const olas: OlaDelReporte[] = []
  for (const t of tasks) {
    const n = normalizar(t.name)
    const coincide = n.match(/^ola\s+(\d+)\b/)
    if (!coincide || !hijas.has(t.id)) continue
    const numero = Number(coincide[1])
    const hojas = hojasDe(t.id)

    const idCorte = hojas.find((id) => /aceptacion del cutover/.test(normalizar(porId.get(id)!.name)))
    const corte = idCorte ? porId.get(idCorte)! : undefined
    const cortada = corte ? terminada(corte) : false
    const avanceDelCorte = corte ? avanceDe(corte) : 0

    // Sin hito de corte reconocible, la ola se mide por su última hoja: sigue siendo la fecha en
    // que la ola deja de consumir calendario, que es lo que el banco quiere saber.
    const corteComprometido = idCorte
      ? (base.byId.get(idCorte)?.finish ?? null)
      : maxFecha(hojas.map((id) => base.byId.get(id)?.finish))
    const proyectadoCrudo = idCorte
      ? (finProyectado.get(idCorte) ?? null)
      : maxFecha(hojas.map((id) => finProyectado.get(id)))
    const corteProyectado = cortada ? null : proyectadoCrudo

    const atraso =
      !cortada && corteComprometido && corteProyectado
        ? Math.max(0, habiles(corteComprometido, corteProyectado))
        : null

    const real = avanceReal(hojas)
    // La primera sub-etapa de cada ola es la preparación; si ya terminó, la ola está replicando.
    const primera = hijas.get(t.id)?.[0]
    const preparada = primera !== undefined && avanceReal(hojasDe(primera)) >= 0.999
    const fase =
      real >= 0.999
        ? 'Cerrada'
        : cortada
          ? 'Cortada, estabilizando'
          : avanceDelCorte > 0
            ? `Corte al ${Math.round(avanceDelCorte * 100)}%`
            : preparada
              ? 'Replicación y ensayo'
              : real > 0
                ? 'Preparación'
                : 'Sin iniciar'

    const ambiente = t.name.match(/^\s*ola\s+\d+\s+([A-Za-z/]+)/i)?.[1]?.toUpperCase() ?? ''
    const servidores = n.match(/(\d+)\s+servidores/)?.[1]

    olas.push({
      numero,
      ambiente,
      servidores: servidores ? Number(servidores) : null,
      fase,
      corteComprometido,
      corteProyectado,
      cortada,
      avanceDelCorte,
      atrasoDiasHabiles: atraso,
      semaforo: atraso === null ? null : semaforoDe(atraso),
      avanceReal: real,
      avanceEsperado: avanceEsperado(hojas),
      vencidas: vencidasDe(hojas).length,
      compuertas: compuertas.filter((c) => c.olas.includes(numero)).map((c) => c.codigo),
    })
  }
  olas.sort((a, b) => a.numero - b.numero)

  // ── Frentes ─────────────────────────────────────────────────────────────────────────────────
  const frentes: FrenteDelReporte[] = []
  for (const f of FRENTES) {
    const raices = tasks.filter((t) => f.patron.test(normalizar(t.name)))
    const hojas = [...new Set(raices.flatMap((t) => hojasDe(t.id)))]
    if (hojas.length === 0) continue
    const comprometido = maxFecha(hojas.map((id) => base.byId.get(id)?.finish))
    const proyectado = maxFecha(hojas.map((id) => finProyectado.get(id) ?? base.byId.get(id)?.finish))
    if (!comprometido || !proyectado) continue
    const terminado = hojas.every((id) => terminada(porId.get(id)!))
    const atraso = terminado ? 0 : Math.max(0, habiles(comprometido, proyectado))
    frentes.push({
      nombre: f.nombre,
      hojas: hojas.length,
      avanceReal: avanceReal(hojas),
      avanceEsperado: avanceEsperado(hojas),
      comprometido,
      proyectado,
      atrasoDiasHabiles: atraso,
      semaforo: semaforoDe(atraso),
      terminado,
      vencidas: vencidasDe(hojas).length,
    })
  }

  // ── Alertas ─────────────────────────────────────────────────────────────────────────────────
  const alertas: AlertaDeOlas[] = []

  // Una ola cortada con una de número menor todavía sin cortar. Puede ser real —el banco movió el
  // orden— o un avance capturado en la ola equivocada. El reporte no decide cuál: avisa.
  for (const o of olas) {
    if (!o.cortada) continue
    const previa = olas.find((p) => p.numero < o.numero && !p.cortada)
    if (previa) {
      alertas.push({ tipo: 'orden', cortada: o.numero, pendiente: previa.numero, avanceDelCortePendiente: previa.avanceDelCorte })
    }
  }

  const pendientes = olas.filter((o) => !o.cortada && o.atrasoDiasHabiles !== null)
  const atrasos = new Set(pendientes.map((o) => o.atrasoDiasHabiles))
  if (pendientes.length >= 3 && atrasos.size === 1 && pendientes[0].atrasoDiasHabiles! > 0) {
    alertas.push({ tipo: 'encadenadas', cuantas: pendientes.length, diasHabiles: pendientes[0].atrasoDiasHabiles! })
  }

  for (const c of compuertas) {
    if (c.total > 0 && c.listas === 0 && c.vencidas === c.total && c.vencidaDesde) {
      alertas.push({ tipo: 'compuertaDetenida', codigo: c.codigo, nombre: c.nombre, total: c.total, desde: c.vencidaDesde, olas: c.olas })
    }
  }

  return { olas, compuertas, frentes, alertas }
}

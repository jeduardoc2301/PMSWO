/**
 * La vista ejecutiva: cuatro preguntas y sus respuestas.
 *
 * Dirección no quiere el plan. Quiere cuatro cosas, en este orden:
 *
 * 1. **¿En qué fecha cierra?**
 * 2. **¿Cuánto margen hay?**
 * 3. **¿Qué lo puede mover?**
 * 4. **¿Qué depende del cliente?**
 *
 * ## El tono, que aquí es parte del trabajo
 *
 * Un plan construido desde una fecha de compromiso hacia atrás sale con casi todo crítico. En el de
 * referencia, nueve de cada diez líneas no tienen holgura. Eso **no es un defecto del plan**: es la
 * consecuencia aritmética de haberlo armado para caber en una fecha. Presentarlo como alarma —«el
 * 90 % del proyecto está en riesgo»— es a la vez alarmista y falso, y quema la credibilidad de todo
 * lo demás que se diga en esa reunión.
 *
 * Lo mismo con el reparto entre cliente y proveedor. La mitad de lo que no se recupera con recursos
 * depende del cliente. Decirlo es indispensable —si no, el proveedor carga con atrasos que no
 * controla— y decirlo como reproche arruina la conversación. Se reparte la responsabilidad entre
 * las dos partes **sin acusar a ninguna**: esto es lo que cada quien tiene en sus manos.
 *
 * Sin jerga. Nada de «holgura total», «pase atrás» ni «FS con desfase». Si una palabra técnica es
 * inevitable, se explica la primera vez.
 */

import { type ClientCommitment, type ClientCommitmentsView } from './client-commitments'
import { type IsoDate } from './date'
import { type PlanSummary } from './plan-summary'

export type MarginState =
  /** Cierra antes del compromiso y sobra tiempo. */
  | 'HOLGADO'
  /** Cierra exactamente en la fecha: cualquier atraso se ve. */
  | 'JUSTO'
  /** Cierra después del compromiso. */
  | 'EN_DEUDA'
  /** No hay fecha de compromiso contra la cual medir. */
  | 'SIN_COMPROMISO'

export interface RiskItem {
  readonly id: string
  readonly name: string
  /** Quién lo tiene en las manos. */
  readonly owner: string | null
  readonly party: 'CLIENTE' | 'PROVEEDOR' | 'AMBOS'
  readonly dueDate: IsoDate
  /** Cuántas líneas del plan se detienen si esto no llega. */
  readonly blocks: number
  /** Por qué no se arregla con más gente, en lenguaje de negocio. */
  readonly why: string
}

export interface ExecutiveBrief {
  // ── 1. ¿En qué fecha cierra? ──────────────────────────────────────────────
  readonly closesOn: IsoDate
  readonly workingDays: number

  // ── 2. ¿Cuánto margen hay? ────────────────────────────────────────────────
  readonly commitment: IsoDate | null
  readonly marginDays: number | null
  readonly marginState: MarginState

  // ── 3. ¿Qué lo puede mover? ───────────────────────────────────────────────
  /** Lo que más arrastra si se atrasa, de mayor a menor. */
  readonly whatCanMoveIt: readonly RiskItem[]
  /** Cuántas líneas no se recuperan metiendo más gente. */
  readonly notRecoverable: number

  // ── 4. ¿Qué depende del cliente? ──────────────────────────────────────────
  readonly clientCommitments: number
  readonly clientOverdue: number
  readonly clientAtRisk: number
  readonly linesBlockedByClient: number
  readonly notRecoverableFromClient: number
  readonly notRecoverableFromProvider: number

  readonly progress: number
  readonly asOf: IsoDate

  /** El informe en prosa, en lenguaje de negocio y sin jerga. */
  readonly paragraphs: readonly string[]
}

export interface BriefOptions {
  /** Cuántos riesgos se nombran. Por omisión, cinco: una lista que cabe en una diapositiva. */
  readonly topRisks?: number
}

/** Traduce la razón técnica a algo que se pueda decir en un comité. */
const WHY: Readonly<Record<string, string>> = {
  DECIDE_UN_TERCERO: 'Depende de una decisión o una firma, no de cuánta gente se ponga.',
  TIEMPO_TRANSCURRIDO: 'Es tiempo que tiene que pasar. Más gente no lo acorta.',
  FECHA_PACTADA: 'La fecha está acordada con terceros y moverla es otra negociación.',
  RECUPERABLE: 'Se puede acelerar con más recursos.',
}

/** Arma el informe para dirección a partir de lo que ya calculó el motor. */
export function executiveBrief(
  summary: PlanSummary,
  commitments: ClientCommitmentsView,
  options: BriefOptions = {},
): ExecutiveBrief {
  const topRisks = options.topRisks ?? 5

  const marginState: MarginState =
    summary.margin === null ? 'SIN_COMPROMISO' : summary.margin > 0 ? 'HOLGADO' : summary.margin === 0 ? 'JUSTO' : 'EN_DEUDA'

  const riesgos: RiskItem[] = commitments.commitments
    .filter((commitment) => commitment.status !== 'CUMPLIDA' && commitment.blocks > 0)
    .sort((a, b) => b.blocks - a.blocks || a.dueDate.localeCompare(b.dueDate))
    .slice(0, topRisks)
    .map(toRisk)

  const brief: Omit<ExecutiveBrief, 'paragraphs'> = {
    closesOn: summary.finish,
    workingDays: summary.workingDays,
    commitment: summary.deadline,
    marginDays: summary.margin,
    marginState,
    whatCanMoveIt: Object.freeze(riesgos),
    notRecoverable: summary.superCriticalCount,
    clientCommitments: commitments.commitments.length,
    clientOverdue: commitments.overdueCount,
    clientAtRisk: commitments.atRiskCount,
    linesBlockedByClient: commitments.blockedTaskCount,
    notRecoverableFromClient: summary.superCriticalByParty.CLIENTE,
    notRecoverableFromProvider: summary.superCriticalByParty.PROVEEDOR,
    progress: summary.progress,
    asOf: summary.computedAt,
  }

  return Object.freeze({ ...brief, paragraphs: Object.freeze(write(brief, summary)) })
}

function toRisk(commitment: ClientCommitment): RiskItem {
  return {
    id: commitment.id,
    name: commitment.name,
    owner: commitment.owner,
    party: commitment.recoverability === 'RECUPERABLE' ? 'PROVEEDOR' : 'CLIENTE',
    dueDate: commitment.dueDate,
    blocks: commitment.blocks,
    why: WHY[commitment.recoverability] ?? WHY.RECUPERABLE,
  }
}

/**
 * Escribe las cuatro respuestas en prosa.
 *
 * Cada cifra sale del resumen. El tono está en la redacción, no en los datos: los mismos números
 * dichos de otra forma producen una reunión completamente distinta.
 */
function write(brief: Omit<ExecutiveBrief, 'paragraphs'>, summary: PlanSummary): string[] {
  const parrafos: string[] = []

  // 1 y 2 · Fecha y margen.
  parrafos.push(cierreYMargen(brief))

  // El 90 % sin holgura, explicado como consecuencia y no como alarma.
  if (summary.zeroFloatPct >= 0.5) {
    parrafos.push(
      `${porcentaje(summary.zeroFloatPct)} del plan no tiene días de sobra. Eso no es una señal de ` +
        'alarma: es lo que ocurre cuando un plan se arma para caber en una fecha comprometida. Al ' +
        'construirlo desde el cierre hacia atrás, casi todo queda encadenado por definición. Lo que ' +
        'importa no es cuántas tareas están apretadas, sino cuáles de ellas no se arreglan poniendo ' +
        'más gente.',
    )
  }

  // 3 · Qué lo puede mover.
  parrafos.push(
    `Hay ${numero(brief.notRecoverable)} ${brief.notRecoverable === 1 ? 'punto' : 'puntos'} donde ` +
      'sumar personas no adelanta nada: decisiones que toma alguien más, tiempo que simplemente ' +
      'tiene que transcurrir, y fechas ya acordadas con terceros. Ahí es donde conviene poner la ' +
      'atención, porque son los únicos que mueven la fecha de cierre.',
  )

  if (brief.whatCanMoveIt.length > 0) {
    const lista = brief.whatCanMoveIt
      .map((riesgo) => `${riesgo.name} (${riesgo.dueDate}, detiene ${numero(riesgo.blocks)} líneas)`)
      .join('; ')
    parrafos.push(`Lo que más arrastra hoy: ${lista}.`)
  }

  // 4 · Qué depende del cliente, sin acusar.
  parrafos.push(repartoDeResponsabilidad(brief))

  if (brief.clientOverdue > 0 || brief.clientAtRisk > 0) {
    const partes: string[] = []
    if (brief.clientOverdue > 0) {
      partes.push(`${numero(brief.clientOverdue)} ya ${brief.clientOverdue === 1 ? 'pasó' : 'pasaron'} su fecha`)
    }
    if (brief.clientAtRisk > 0) partes.push(`${numero(brief.clientAtRisk)} ${brief.clientAtRisk === 1 ? 'vence' : 'vencen'} esta semana`)
    parrafos.push(
      `De los ${numero(brief.clientCommitments)} compromisos del cliente, ${partes.join(' y ')}. ` +
        `Hoy ${brief.linesBlockedByClient === 1 ? 'detiene' : 'detienen'} ${numero(brief.linesBlockedByClient)} ` +
        `${brief.linesBlockedByClient === 1 ? 'línea' : 'líneas'} del plan.`,
    )
  }

  parrafos.push(`El trabajo terminado va en ${porcentaje(brief.progress)}, medido al ${brief.asOf}.`)

  return parrafos
}

function cierreYMargen(brief: Omit<ExecutiveBrief, 'paragraphs'>): string {
  const base = `El proyecto cierra el ${brief.closesOn}, después de ${numero(brief.workingDays)} días de trabajo.`

  switch (brief.marginState) {
    case 'SIN_COMPROMISO':
      return `${base} No hay una fecha comprometida contra la cual medirlo.`
    case 'HOLGADO':
      return (
        `${base} La fecha comprometida es el ${brief.commitment}, así que sobran ` +
        `${numero(brief.marginDays!)} días de margen.`
      )
    case 'JUSTO':
      return (
        `${base} Es exactamente la fecha comprometida: no hay días de sobra, y cualquier atraso se ` +
        'traslada al cierre.'
      )
    case 'EN_DEUDA':
      return (
        `${base} La fecha comprometida es el ${brief.commitment}, así que hoy el plan va ` +
        `${numero(Math.abs(brief.marginDays!))} días tarde.`
      )
  }
}

/**
 * El reparto, dicho sin acusar a nadie.
 *
 * La formulación importa: «esto es lo que cada parte tiene en sus manos», no «el cliente nos está
 * atrasando». La segunda es más corta y arruina la reunión.
 *
 * Por eso el texto tampoco dice «no es un reparto de culpas», aunque suene conciliador: nombrar la
 * culpa —incluso para negarla— planta el marco que se quería evitar. Hay una prueba que prohíbe esa
 * palabra en todo el informe, precisamente para que nadie la reintroduzca sin darse cuenta.
 */
function repartoDeResponsabilidad(brief: Omit<ExecutiveBrief, 'paragraphs'>): string {
  const total = brief.notRecoverableFromClient + brief.notRecoverableFromProvider
  if (total === 0) {
    return 'Hoy no hay puntos irrecuperables asignados a ninguna de las dos partes.'
  }

  return (
    `De esos puntos, ${numero(brief.notRecoverableFromClient)} están en manos del cliente y ` +
    `${numero(brief.notRecoverableFromProvider)} en las nuestras. No es un señalamiento: es el mapa ` +
    'de quién puede desatorar qué. Sostener la fecha depende de las dos partes, y cada una tiene ' +
    'una lista concreta de qué le toca.'
  )
}

function porcentaje(fraction: number): string {
  return `${(fraction * 100).toFixed(0)} %`
}

function numero(value: number): string {
  return value.toLocaleString('es-MX')
}

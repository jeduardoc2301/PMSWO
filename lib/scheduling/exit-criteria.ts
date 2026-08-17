/**
 * Criterios de salida verificables.
 *
 * Toda línea de detalle necesita dos cosas: un **entregable** concreto y un **criterio de salida**
 * que un tercero pueda comprobar sin preguntarle a nadie.
 *
 * «Queda documentado» no es un criterio. No dice qué documento, ni qué tiene que decir, ni cómo se
 * sabe que está bien. Dos personas mirando la misma tarea llegan a conclusiones distintas, y la
 * discusión se resuelve en el comité en vez de en el plan.
 *
 * «El documento lista las 29 subredes con su CIDR y el banco lo firmó» sí lo es. Se puede abrir el
 * documento, contar, y ver la firma.
 *
 * ## Qué se puede revisar automáticamente y qué no
 *
 * Un motor no puede juzgar si un criterio es *bueno*. Lo que sí puede es detectar las tres formas
 * en que un criterio deja de ser comprobable, y las tres son mecánicas:
 *
 * - **Fórmula vacía**: la frase existe pero no dice nada. «Queda documentado», «se completa».
 * - **Sin nada que comprobar**: ninguna cifra, ningún nombre propio, ningún verbo de verificación.
 *   No hay a qué apuntar para decir «está hecho».
 * - **Repetido de más**: el mismo criterio en muchas líneas dejó de hablar de cada una.
 *
 * Lo que queda fuera queda fuera a propósito, y conviene decirlo: un criterio puede pasar los tres
 * filtros y aun así ser malo. Esto baja el piso, no sube el techo.
 */

export type CriterionIssue =
  /** No hay criterio. */
  | 'AUSENTE'
  /** Tan corto que no alcanza a decir nada comprobable. */
  | 'DEMASIADO_CORTO'
  /** Una fórmula hecha: existe pero no dice qué comprobar. */
  | 'GENERICO'
  /** Ni una cifra, ni un nombre propio, ni un verbo de verificación: no hay a qué apuntar. */
  | 'SIN_NADA_QUE_COMPROBAR'
  /** El mismo criterio en demasiadas líneas. */
  | 'REPETIDO_EN_EXCESO'

export interface CriterionFinding {
  readonly taskId: string
  readonly field: 'entregable' | 'criterio de salida'
  readonly issue: CriterionIssue
  /** El texto tal como está, para poder mostrarlo. */
  readonly text: string | null
  readonly message: string
}

export interface ExitCriteriaReport {
  readonly findings: readonly CriterionFinding[]
  /** Cuántas líneas de detalle se revisaron. */
  readonly checked: number
  /** Cuántas tienen entregable y criterio, y los dos comprobables. */
  readonly clean: number
  readonly byIssue: Readonly<Record<CriterionIssue, number>>
}

export interface CriterionRow {
  readonly id: string
  readonly name: string
  /** Solo se revisan las hojas: un resumen no se ejecuta y no tiene criterio propio. */
  readonly isSummary: boolean
  readonly deliverable: string | null
  readonly exitCriteria: string | null
}

export interface ExitCriteriaOptions {
  /**
   * Palabras mínimas de un entregable. Por omisión, dos.
   *
   * Un entregable es un sustantivo —«Acta de aprobación firmada»— y con dos palabras ya nombra algo.
   * Un criterio es una oración y necesita más; por eso las dos barras están separadas.
   */
  readonly minDeliverableWords?: number
  /** Palabras mínimas de un criterio de salida. Por omisión, cinco. */
  readonly minWords?: number
  /** Cuántas veces puede repetirse un criterio antes de dejar de hablar de cada línea. Por omisión, diez. */
  readonly maxRepeats?: number
}

/**
 * Fórmulas hechas: la frase completa no dice qué comprobar.
 *
 * Se comparan contra el texto entero, no como fragmento — «queda documentado» solo es genérico
 * cuando es *todo* lo que dice el criterio. «Queda documentado en el acta que el banco firmó el 12
 * de junio» dice bastante más.
 */
const EMPTY_FORMULAS: readonly RegExp[] = [
  /^(queda|está|esta) (documentad[oa]|list[oa]|hech[oa]|terminad[oa]|complet[oa]|cerrad[oa])\.?$/i,
  /^se (completa|termina|entrega|documenta|realiza|ejecuta|cierra)\.?$/i,
  /^(completad[oa]|terminad[oa]|finalizad[oa]|entregad[oa]|realizad[oa]|ejecutad[oa]|ok|listo)\.?$/i,
  /^(seg[úu]n lo acordado|conforme a lo planeado|de acuerdo al plan|sin novedad)\.?$/i,
  /^(la (tarea|actividad) (se )?(complet|termin|realiz)\w*)\.?$/i,
  /^n\/?a\.?$/i,
  /^-+$/,
]

/**
 * Verbos con los que un tercero puede comprobar algo sin preguntarle a nadie.
 *
 * La lista es amplia a propósito. Este control tiene que ser de alta precisión aunque pierda
 * cobertura: un linter que marca criterios buenos deja de leerse a la semana, y entonces tampoco
 * detecta los malos.
 */
const VERIFICATION_VERBS =
  /\b(firm\w+|aprob\w+|valid\w+|verific\w+|acept\w+|autoriz\w+|registr\w+|public\w+|entreg\w+|recib\w+|list\w+|contien\w+|inclu\w+|integr\w+|defin\w+|coincid\w+|refleja\w*|muestra\w*|responde\w*|resuelv\w+|arranc\w+|conect\w+|replic\w+|migr\w+|apagad\w+|oper\w+|ejecut\w+ sin error\w*|pasa\w* (la|las|los|el) prueba\w*|qued\w+ (registrad|documentad|configurad|habilitad|desplegad)\w+)\b/i

/** Señales de que hay algo concreto a lo que apuntar. */
const CONCRETE_ANCHORS: readonly RegExp[] = [
  /\d/, // una cifra: 29 subredes, 12 de junio, 99.9 %
  // un número escrito con letra: «las siete fichas de cuenta» es tan contable como «las 7»
  /\b(dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|todas?|todos|cada|amb[ao]s)\b/i,
  /\b[A-Z]{2,}\b/, // una sigla: AWS, VPC, CIDR, RDS — señal limpia y sin falsos amigos
  /\b[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ]{3,}/, // un nombre propio: Terraform, Direct Connect
  /«[^»]+»|"[^"]+"/, // algo citado
]

/**
 * A partir de cuántas palabras se confía en la frase sin exigirle ancla ni verbo.
 *
 * Doce: una oración de más de doce palabras que sobrevivió a los filtros anteriores está
 * describiendo algo concreto, aunque no lo diga con el vocabulario que este archivo conoce.
 */
const VERBOSE_ENOUGH = 12

/** Revisa los entregables y criterios de salida de un plan. */
export function reviewExitCriteria(
  rows: readonly CriterionRow[],
  options: ExitCriteriaOptions = {},
): ExitCriteriaReport {
  const minWords = options.minWords ?? 5
  const minDeliverableWords = options.minDeliverableWords ?? 2
  const maxRepeats = options.maxRepeats ?? 10

  const leaves = rows.filter((row) => !row.isSummary)
  const findings: CriterionFinding[] = []

  const repeats = new Map<string, string[]>()
  for (const row of leaves) {
    const key = normalize(row.exitCriteria)
    if (key === '') continue
    repeats.set(key, [...(repeats.get(key) ?? []), row.id])
  }

  for (const row of leaves) {
    findings.push(...reviewField(row, 'entregable', row.deliverable, minDeliverableWords))
    findings.push(...reviewField(row, 'criterio de salida', row.exitCriteria, minWords))

    const key = normalize(row.exitCriteria)
    const veces = repeats.get(key)?.length ?? 0
    if (key !== '' && veces > maxRepeats) {
      findings.push({
        taskId: row.id,
        field: 'criterio de salida',
        issue: 'REPETIDO_EN_EXCESO',
        text: row.exitCriteria,
        message:
          `El criterio de «${row.name}» aparece igual en ${veces} líneas. Un criterio que se repite ` +
          'tanto dejó de decir algo de cada una.',
      })
    }
  }

  const conHallazgo = new Set(findings.map((finding) => finding.taskId))
  const byIssue: Record<CriterionIssue, number> = {
    AUSENTE: 0,
    DEMASIADO_CORTO: 0,
    GENERICO: 0,
    SIN_NADA_QUE_COMPROBAR: 0,
    REPETIDO_EN_EXCESO: 0,
  }
  for (const finding of findings) byIssue[finding.issue] += 1

  return Object.freeze({
    findings: Object.freeze(findings),
    checked: leaves.length,
    clean: leaves.length - conHallazgo.size,
    byIssue: Object.freeze(byIssue),
  })
}

/** Verdadero si el criterio lo puede comprobar un tercero sin preguntarle a nadie. */
export function isVerifiable(text: string | null | undefined, minWords = 5): boolean {
  return judge(text, minWords) === null
}

function reviewField(
  row: CriterionRow,
  field: CriterionFinding['field'],
  text: string | null,
  minWords: number,
): CriterionFinding[] {
  const issue = judge(text, minWords)
  if (issue === null) return []

  return [
    {
      taskId: row.id,
      field,
      issue,
      text,
      message: `${explain(issue, field)} en «${row.name}».`,
    },
  ]
}

function judge(text: string | null | undefined, minWords: number): CriterionIssue | null {
  const limpio = (text ?? '').trim()
  if (limpio === '') return 'AUSENTE'

  for (const formula of EMPTY_FORMULAS) {
    if (formula.test(limpio)) return 'GENERICO'
  }

  const palabras = limpio.split(/\s+/).filter((palabra) => palabra.length > 1)
  if (palabras.length < minWords) return 'DEMASIADO_CORTO'

  // El resto solo se aplica a frases cortas, y la razón importa: una oración larga que describe qué
  // contiene un documento es comprobable por construcción, aunque su verbo no esté en ninguna lista
  // —«el diseño nombra el proveedor de identidad, el atributo que asigna grupos y el flujo de
  // renovación» no lleva un verbo de verificación y aun así se abre el documento y se mira—.
  //
  // Buscar el verbo «correcto» es una carrera perdida: el español tiene cientos y cada proyecto usa
  // los suyos. Marcar esas frases convertiría el control en ruido, y un linter que marca lo bueno
  // deja de leerse a la semana. Así que por encima de este umbral se confía en la frase.
  if (palabras.length > VERBOSE_ENOUGH) return null

  const tieneAncla = CONCRETE_ANCHORS.some((ancla) => ancla.test(limpio))
  const tieneVerbo = VERIFICATION_VERBS.test(limpio)
  if (!tieneAncla && !tieneVerbo) return 'SIN_NADA_QUE_COMPROBAR'

  return null
}

function explain(issue: CriterionIssue, field: CriterionFinding['field']): string {
  switch (issue) {
    case 'AUSENTE':
      return `Falta el ${field}`
    case 'DEMASIADO_CORTO':
      return `El ${field} es demasiado corto para decir algo comprobable`
    case 'GENERICO':
      return `El ${field} es una fórmula hecha: existe pero no dice qué comprobar`
    case 'SIN_NADA_QUE_COMPROBAR':
      return `El ${field} no trae ni una cifra, ni un nombre propio, ni un verbo de verificación: no hay a qué apuntar`
    case 'REPETIDO_EN_EXCESO':
      return `El ${field} se repite de más`
  }
}

function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

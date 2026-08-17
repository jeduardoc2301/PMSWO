/**
 * Trazabilidad por línea: de dónde salió cada tarea.
 *
 * Cuando un plan integra varias fuentes —el plan del proveedor, el del cliente, el de un tercero—
 * la trazabilidad es lo único que permite reconciliar después. Sin ella, seis meses más tarde nadie
 * puede decir de qué documento vino la línea 412 ni qué pasó con las catorce que se agregaron en el
 * camino.
 *
 * ## La regla de redacción, y por qué es del código y no del criterio de nadie
 *
 * **La trazabilidad la ve el cliente.** Aparece en el plan que él revisa, en el reporte que recibe y
 * en el acta que firma. Eso descarta tres cosas que se cuelan solas cuando el campo se escribe sin
 * pensar en quién lo lee:
 *
 * - **Nombres del equipo interno.** «Lo revisó Salomón» le dice al cliente quién trabaja en su
 *   cuenta y no le dice nada útil sobre la línea.
 * - **Versiones internas.** «v2.3-borrador» es vocabulario de trabajo. La versión que el cliente
 *   conoce es la que se le entregó.
 * - **Notas de trabajo.** «Pendiente de revisar», «ojo con esto», «preguntar a Rafa». Son recados
 *   entre nosotros, y en el documento del cliente leen como un plan a medio hacer.
 *
 * Esto se revisa en el código porque el criterio humano falla justo aquí: quien escribe la nota está
 * pensando en su equipo, no en quién la va a leer.
 */

/** De dónde salió una línea del plan. */
export interface TraceabilitySource {
  /** Archivo del que se importó. */
  readonly file: string
  /** Versión del documento **tal como el cliente la conoce**, si la tiene. */
  readonly version: string | null
  /** Hoja dentro del archivo, si aplica. */
  readonly sheet: string | null
  /** Fila del archivo original. */
  readonly row: number | null
  /** Identificador que la línea tenía en su origen. */
  readonly id: string
  /** Nota que acompaña a la trazabilidad. La ve el cliente. */
  readonly note?: string
}

export type RedactionIssue =
  /** Nombra a alguien del equipo interno. */
  | 'NOMBRE_INTERNO'
  /** Menciona una versión de trabajo en vez de una entregada. */
  | 'VERSION_INTERNA'
  /** Es un recado entre nosotros, no información para el cliente. */
  | 'NOTA_DE_TRABAJO'

export interface RedactionFinding {
  readonly issue: RedactionIssue
  /** El fragmento que lo delata. */
  readonly match: string
  readonly message: string
}

export interface RedactionOptions {
  /**
   * Nombres del equipo interno que no deben aparecer.
   *
   * Se comparan sin distinguir mayúsculas ni acentos, y por palabra completa: «Ana» no marca
   * «Analizar». Hay que darla: el motor no puede adivinar quién es del equipo.
   */
  readonly internalNames?: readonly string[]
  /** Palabras adicionales que tampoco deben aparecer. */
  readonly forbiddenWords?: readonly string[]
}

/**
 * Marcas de trabajo interno.
 *
 * No pretende ser exhaustiva: es la lista de lo que aparece una y otra vez en campos que nadie
 * escribió pensando en el cliente.
 */
const WORK_NOTES: readonly RegExp[] = [
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /\bWIP\b/i,
  /\bXXX\b/,
  /\bborrador\b/i,
  /\bdraft\b/i,
  /\bpendiente de (revisar|confirmar|validar|definir)\b/i,
  /\bfalta (confirmar|definir|revisar|preguntar)\b/i,
  /\b(ojo|nota interna|uso interno|no compartir)\b/i,
  /\b(preguntar|consultar|revisar) (a|con) \w+/i,
  /\bpor (revisar|confirmar|definir)\b/i,
  /\bprovisional\b/i,
  /\btentativ[oa]\b/i,
  /\bchecar\b/i,
  /\?{2,}/,
]

/** Marcas de versión de trabajo. Una versión entregada no lleva estas palabras al lado. */
const INTERNAL_VERSIONS: readonly RegExp[] = [
  /\bv?\d+(\.\d+)*[-_ ]?(borrador|draft|wip|rc|beta|alpha|interna?|prelim\w*)\b/i,
  /\b(rev|revisi[óo]n)\.? ?\d+ ?(interna?|de trabajo)\b/i,
  /\bbuild ?\d+\b/i,
  /\bcommit [0-9a-f]{7,}\b/i,
]

/**
 * Revisa un texto que va a ver el cliente.
 *
 * @returns lo que no debería estar ahí. Vacío significa que el texto se puede entregar.
 *
 * Ojo con lo que **no** hace: no detecta un nombre que no esté en `internalNames`, ni una nota
 * interna redactada con palabras que no están en la lista. Reduce el problema, no lo elimina — y
 * por eso conviene que la lista de nombres del equipo se mantenga.
 */
export function reviewForClient(
  text: string | null | undefined,
  options: RedactionOptions = {},
): RedactionFinding[] {
  if (!text || text.trim() === '') return []

  const findings: RedactionFinding[] = []
  const normalized = normalize(text)

  for (const name of options.internalNames ?? []) {
    const needle = normalize(name)
    if (needle === '') continue
    if (wholeWord(needle).test(normalized)) {
      findings.push({
        issue: 'NOMBRE_INTERNO',
        match: name,
        message:
          `Nombra a «${name}», que es del equipo interno. La trazabilidad la ve el cliente: dice ` +
          'de dónde salió la línea, no quién la tocó.',
      })
    }
  }

  for (const word of options.forbiddenWords ?? []) {
    const needle = normalize(word)
    if (needle === '') continue
    if (wholeWord(needle).test(normalized)) {
      findings.push({
        issue: 'NOTA_DE_TRABAJO',
        match: word,
        message: `Contiene «${word}», que no debe aparecer en un campo que ve el cliente.`,
      })
    }
  }

  for (const pattern of INTERNAL_VERSIONS) {
    const found = pattern.exec(text)
    if (found) {
      findings.push({
        issue: 'VERSION_INTERNA',
        match: found[0],
        message:
          `Menciona «${found[0]}», que es una versión de trabajo. La versión que el cliente conoce ` +
          'es la que se le entregó.',
      })
    }
  }

  for (const pattern of WORK_NOTES) {
    const found = pattern.exec(text)
    if (found) {
      findings.push({
        issue: 'NOTA_DE_TRABAJO',
        match: found[0],
        message:
          `Contiene «${found[0].trim()}», que es un recado de trabajo. En el documento del cliente ` +
          'lee como un plan a medio hacer.',
      })
    }
  }

  return findings
}

/** Verdadero si el texto se puede entregar tal cual. */
export function isClientReady(text: string | null | undefined, options: RedactionOptions = {}): boolean {
  return reviewForClient(text, options).length === 0
}

/**
 * Escribe la trazabilidad como la va a leer el cliente.
 *
 * Ejemplo: `PDT BU V7 · hoja Plan · fila 412 · origen 406`
 *
 * Deja fuera lo que no aporta: si no hay hoja, no dice «hoja»; si no hay versión, no inventa una.
 */
export function formatTraceability(source: TraceabilitySource): string {
  const partes: string[] = [source.version ? `${source.file} ${source.version}` : source.file]
  if (source.sheet) partes.push(`hoja ${source.sheet}`)
  if (source.row !== null) partes.push(`fila ${source.row}`)
  partes.push(`origen ${source.id}`)
  if (source.note && source.note.trim() !== '') partes.push(source.note.trim())
  return partes.join(' · ')
}

/**
 * Revisa la trazabilidad completa de una línea: la nota y el nombre del archivo.
 *
 * El nombre del archivo también se revisa porque es donde más se cuela una versión de trabajo —
 * «plan v3 borrador.xlsx» acaba impreso en el plan del cliente sin que nadie lo note.
 */
export function reviewSource(
  source: TraceabilitySource,
  options: RedactionOptions = {},
): RedactionFinding[] {
  return [...reviewForClient(source.file, options), ...reviewForClient(source.note, options)]
}

/** Quita acentos y pasa a minúsculas, para comparar sin depender de cómo se escribió. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

/** Palabra completa: «Ana» no debe marcar «Analizar». */
function wholeWord(needle: string): RegExp {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'u')
}

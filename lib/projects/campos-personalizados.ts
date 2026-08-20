/**
 * Campos personalizados: los nueve tipos del §2 y qué significa filtrar por cada uno (§10.2).
 *
 * El spec los declara en el modelo —`CustomField` con su `type` y sus `options`— y los pide en dos
 * sitios más: entre los criterios del filtro unificado y en el catálogo de columnas del §4.2. Este
 * módulo es lo que hay entre esas tres cosas, y es donde vive lo único que puede estar mal: **qué
 * quiere decir «igual a» cuando el valor es una lista**.
 *
 * ## Tres de los nueve guardan listas, y eso cambia los operadores
 *
 * `MULTISELECT`, `PEOPLE` y `TAGS` no guardan un valor: guardan varios. Y sobre una lista, los
 * operadores de siempre significan otra cosa:
 *
 * - «es igual a» pasa a ser **«contiene»** — una línea etiquetada `[riesgo, banco]` responde que sí
 *   a «etiqueta = riesgo», porque preguntar por igualdad exacta contra una lista no le sirve a nadie.
 * - «está vacío» es la lista vacía, no la ausencia del valor: `[]` y `null` son lo mismo aquí.
 * - los de orden —mayor, menor, entre— **no aplican**: una lista no es mayor que otra.
 *
 * Ofrecer un operador que no significa nada es peor que no ofrecerlo: quien lo elige obtiene un
 * resultado, y el resultado es basura con pinta de dato.
 *
 * ## Por qué el valor se guarda como `Json` y aquí se sanea
 *
 * El modelo guarda `value Json`, que es lo que permite nueve tipos en una sola tabla. El precio es
 * que **lo que sale de la base no está tipado**: un campo declarado `NUMBER` puede tener guardada la
 * cadena `"ocho"` si alguien escribió por la API antes de una validación. Por eso todo lo que entra
 * pasa por `leerValor`, que devuelve `null` en vez de propagar una sorpresa a la pantalla.
 */

import type { Tipo } from '@/lib/projects/filter'

/** Los nueve del spec, en el orden en que los declara. */
export const TIPOS_DE_CAMPO = [
  'TEXT',
  'NUMBER',
  'DATE',
  'LIST',
  'CHECKBOX',
  'COLOR',
  'MULTISELECT',
  'PEOPLE',
  'TAGS',
] as const

export type TipoDeCampo = (typeof TIPOS_DE_CAMPO)[number]

export function esTipoDeCampo(valor: unknown): valor is TipoDeCampo {
  return typeof valor === 'string' && (TIPOS_DE_CAMPO as readonly string[]).includes(valor)
}

/** Los tres que guardan una lista. */
export const GUARDAN_LISTA: ReadonlySet<TipoDeCampo> = new Set<TipoDeCampo>([
  'MULTISELECT',
  'PEOPLE',
  'TAGS',
])

/** Los que necesitan un catálogo de opciones declarado. */
export const NECESITAN_OPCIONES: ReadonlySet<TipoDeCampo> = new Set<TipoDeCampo>([
  'LIST',
  'MULTISELECT',
  'TAGS',
])

/** Cómo se llama cada tipo en pantalla. */
export const NOMBRE_DEL_TIPO: Readonly<Record<TipoDeCampo, string>> = Object.freeze({
  TEXT: 'Texto',
  NUMBER: 'Número',
  DATE: 'Fecha',
  LIST: 'Lista de opciones',
  CHECKBOX: 'Sí o no',
  COLOR: 'Color',
  MULTISELECT: 'Varias opciones',
  PEOPLE: 'Personas',
  TAGS: 'Etiquetas',
})

/**
 * A qué tipo del filtro corresponde cada uno.
 *
 * `COLOR` va como texto y no como un tipo propio: se filtra por su valor —«los rojos»— y ningún
 * operador de color tiene sentido. `LIST` también es texto: guarda **una** opción.
 */
export const TIPO_EN_EL_FILTRO: Readonly<Record<TipoDeCampo, Tipo | 'lista'>> = Object.freeze({
  TEXT: 'texto',
  NUMBER: 'numero',
  DATE: 'fecha',
  LIST: 'texto',
  CHECKBOX: 'booleano',
  COLOR: 'texto',
  MULTISELECT: 'lista',
  PEOPLE: 'lista',
  TAGS: 'lista',
})

/** Una opción de un `LIST`, `MULTISELECT` o `TAGS`, tal como la declara el spec. */
export interface OpcionDeCampo {
  readonly id: string
  readonly label: string
  readonly color?: string
}

export interface CampoPersonalizado {
  readonly id: string
  readonly name: string
  readonly type: TipoDeCampo
  /** Nulo cuando el campo es de la organización entera y no de un proyecto. */
  readonly projectId?: string | null
  readonly options?: readonly OpcionDeCampo[] | null
  /**
   * Cuándo se archivó, si se archivó.
   *
   * Se archiva en vez de borrarse porque un filtro guardado puede apuntar a él: borrarlo dejaría el
   * filtro señalando un campo que nadie conoce, y el filtro **no avisaría** — devolvería cero líneas
   * y parecería que no hay nada que enseñar.
   */
  readonly archivedAt?: string | null
}

/**
 * El identificador del campo dentro del filtro.
 *
 * Lleva prefijo para que no pueda chocar con los campos de siempre: un campo personalizado llamado
 * «status» existiría al lado del estado de verdad, y el filtro elegiría uno de los dos sin decir
 * cuál.
 */
export const PREFIJO = 'cf:'

export function claveDeCampo(campo: Pick<CampoPersonalizado, 'id'>): string {
  return `${PREFIJO}${campo.id}`
}

export function esClaveDeCampo(clave: string): boolean {
  return clave.startsWith(PREFIJO)
}

export function idDesdeClave(clave: string): string | null {
  return esClaveDeCampo(clave) ? clave.slice(PREFIJO.length) : null
}

/**
 * Lo guardado, saneado según el tipo declarado.
 *
 * El valor viaja como `Json` y **lo que sale de la base no está tipado**: un campo declarado
 * `NUMBER` puede tener guardada la cadena `"ocho"`. Devuelve `null` en vez de propagar la sorpresa,
 * y para los de lista devuelve siempre un arreglo —vacío si no hay nada— para que quien compara no
 * tenga que preguntar dos veces.
 */
export function leerValor(tipo: TipoDeCampo, crudo: unknown): string | number | boolean | string[] | null {
  if (GUARDAN_LISTA.has(tipo)) {
    if (!Array.isArray(crudo)) return []
    // Se filtran los que no son cadenas en vez de rechazar la lista entera: un elemento corrupto no
    // tiene por qué esconder los tres que están bien.
    return crudo.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  }

  if (crudo === null || crudo === undefined) return null

  switch (tipo) {
    case 'NUMBER': {
      const n = typeof crudo === 'number' ? crudo : Number(crudo)
      return Number.isFinite(n) ? n : null
    }
    case 'CHECKBOX':
      return typeof crudo === 'boolean' ? crudo : null
    case 'DATE': {
      if (typeof crudo !== 'string') return null
      // Se recorta a fecha civil: el filtro compara `AAAA-MM-DD` como cadenas.
      const dia = crudo.slice(0, 10)
      return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null
    }
    default:
      return typeof crudo === 'string' ? crudo : null
  }
}

/**
 * Qué operadores tienen sentido para este tipo.
 *
 * Los de orden no aparecen en los de lista, y no es una omisión: una lista no es mayor que otra.
 * Ofrecer un operador que no significa nada es peor que no ofrecerlo — quien lo elige obtiene un
 * resultado, y el resultado es basura con pinta de dato.
 */
export function operadoresDe(tipo: TipoDeCampo): readonly string[] {
  if (GUARDAN_LISTA.has(tipo)) return ['contains', 'in', 'not_in', 'is_empty', 'is_not_empty']
  switch (TIPO_EN_EL_FILTRO[tipo]) {
    case 'numero':
      return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_not_empty']
    case 'fecha':
      return ['eq', 'neq', 'between', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty']
    case 'booleano':
      return ['eq', 'is_empty', 'is_not_empty']
    default:
      return ['eq', 'neq', 'contains', 'in', 'not_in', 'is_empty', 'is_not_empty']
  }
}

/**
 * Por qué no se admite este campo, o `null` si se admite.
 *
 * Vive aquí y no en la ruta para que la pantalla y el servidor rechacen por lo mismo: dos fronteras
 * escritas por separado acaban siendo dos fronteras distintas, y la de la pantalla siempre es la más
 * blanda.
 */
export function porQueNoSeAdmiteElCampo(campo: {
  readonly name?: unknown
  readonly type?: unknown
  readonly options?: unknown
}): string | null {
  const nombre = typeof campo.name === 'string' ? campo.name.trim() : ''
  if (nombre === '') return 'El campo necesita un nombre.'
  if (nombre.length > 60) return 'El nombre no puede pasar de 60 caracteres.'

  if (!esTipoDeCampo(campo.type)) {
    return `Tipo de campo desconocido. Los válidos son: ${TIPOS_DE_CAMPO.join(', ')}.`
  }

  if (NECESITAN_OPCIONES.has(campo.type)) {
    const opciones = campo.options
    if (!Array.isArray(opciones) || opciones.length === 0) {
      return `Un campo de tipo «${NOMBRE_DEL_TIPO[campo.type]}» necesita al menos una opción.`
    }
    const ids = new Set<string>()
    for (const o of opciones) {
      const op = o as Partial<OpcionDeCampo>
      if (typeof op?.id !== 'string' || op.id.trim() === '') return 'Cada opción necesita un identificador.'
      if (typeof op?.label !== 'string' || op.label.trim() === '') return 'Cada opción necesita un nombre.'
      if (ids.has(op.id)) return `La opción «${op.id}» está repetida. Dos opciones con el mismo identificador no se pueden distinguir.`
      ids.add(op.id)
    }
  } else if (campo.options !== undefined && campo.options !== null) {
    // Guardar opciones en un campo que no las usa es dejar un dato que nadie lee y que la próxima
    // persona interpretará como que sí se usan.
    return `Un campo de tipo «${NOMBRE_DEL_TIPO[campo.type]}» no lleva opciones.`
  }

  return null
}

/**
 * Por qué no se admite este valor para ese campo, o `null`.
 *
 * Lo que se comprueba de verdad es la pertenencia al catálogo: en los tipos con opciones, un valor
 * fuera de la lista es un dato que la pantalla no sabe dibujar y que el filtro no puede ofrecer.
 */
export function porQueNoSeAdmiteElValor(campo: CampoPersonalizado, crudo: unknown): string | null {
  if (crudo === null || crudo === undefined) return null

  if (GUARDAN_LISTA.has(campo.type)) {
    if (!Array.isArray(crudo)) return 'Este campo guarda una lista de valores.'
    if (campo.type === 'PEOPLE') return null
    const catalogo = new Set((campo.options ?? []).map((o) => o.id))
    const fuera = crudo.find((v) => !catalogo.has(String(v)))
    return fuera === undefined ? null : `«${String(fuera)}» no es una de las opciones de «${campo.name}».`
  }

  if (campo.type === 'NUMBER' && !Number.isFinite(Number(crudo))) {
    return `«${campo.name}» guarda un número.`
  }
  if (campo.type === 'CHECKBOX' && typeof crudo !== 'boolean') {
    return `«${campo.name}» sólo puede ser sí o no.`
  }
  if (campo.type === 'DATE' && leerValor('DATE', crudo) === null) {
    return `«${campo.name}» guarda una fecha con el formato AAAA-MM-DD.`
  }
  if (campo.type === 'LIST') {
    const catalogo = new Set((campo.options ?? []).map((o) => o.id))
    if (!catalogo.has(String(crudo))) return `«${String(crudo)}» no es una de las opciones de «${campo.name}».`
  }

  return null
}

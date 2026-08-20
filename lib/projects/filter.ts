/**
 * El sistema de filtros unificado (§10.2).
 *
 * Un solo filtro para las seis vistas: si alguien filtra en el Gantt y cambia al Tablero, el filtro
 * sigue puesto. Eso obliga a que el filtro sea un **dato** —una expresión serializable— y no un
 * puñado de estados sueltos dentro de cada pantalla. Con estados sueltos, «el mismo filtro en otra
 * vista» no significa nada.
 *
 * ## Por qué se evalúa aquí y no en SQL
 *
 * Las seis vistas ya tienen el plan entero en el navegador —el motor lo programa en 17 ms— y
 * filtrar en memoria cuesta menos de un milisegundo con 1 368 líneas. Bajar a la base cada cambio
 * de filtro añadiría un viaje de red por cada tecla del buscador. La misma expresión se puede
 * traducir a SQL el día que un proyecto no quepa en el navegador; el formato ya está pensado para
 * eso.
 *
 * ## Los campos son un registro, no un `switch`
 *
 * Cada campo declara de dónde sale su valor y de qué tipo es. Un `switch` gigante haría que añadir
 * un campo tocara el evaluador, y que un campo mal escrito pasara desapercibido. Aquí un campo que
 * no existe **rompe al validar**, que es cuando alguien puede arreglarlo: si pasara desapercibido,
 * la condición se ignoraría y la pantalla enseñaría datos que quien filtró creía haber excluido.
 */

import { type IsoDate } from '@/lib/scheduling/date'
import { isOverdue } from '@/lib/urgency'

export type Operador =
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'between'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_empty'
  | 'is_not_empty'

export interface Condicion {
  readonly field: string
  readonly operator: Operador
  readonly value?: unknown
}

export interface Grupo {
  readonly op: 'AND' | 'OR'
  readonly conditions: readonly (Condicion | Grupo)[]
}

export type Filtro = Grupo

export function esGrupo(nodo: Condicion | Grupo): nodo is Grupo {
  return (nodo as Grupo).op !== undefined
}

/** La línea sobre la que se evalúa. Es el vocabulario común de las seis vistas. */
export interface LineaFiltrable {
  readonly id: string
  readonly title: string
  readonly status: string
  readonly priority: string
  readonly kind: string
  readonly party: string
  readonly startDate: IsoDate
  readonly estimatedEndDate: IsoDate
  readonly createdAt?: string
  readonly progressPct: number
  readonly ownerId?: string | null
  readonly ownerName?: string | null
  readonly clientOwner?: string | null
  readonly parentId?: string | null
}

export interface ContextoDelFiltro {
  /** Fecha civil de corte, para «atrasadas». Entra por parámetro: un filtro que lee el reloj no se puede probar. */
  readonly hoy: IsoDate
  /**
   * Los identificadores de las líneas que son resumen: las que tienen al menos una hija.
   *
   * No se puede saber mirando una línea sola —«ser resumen» es una propiedad del conjunto— así que
   * lo calcula `filtrar`, que sí tiene el plan entero delante, y lo pasa aquí. Quien evalúe con
   * `cumple` línea a línea tiene que darlo; si no lo da, «es resumen» dice que no de todas, que es
   * exactamente el defecto que este campo tenía.
   */
  readonly resumenes?: ReadonlySet<string>
}

type Tipo = 'texto' | 'fecha' | 'numero' | 'booleano'

interface CampoDeclarado {
  readonly tipo: Tipo
  readonly leer: (linea: LineaFiltrable, contexto: ContextoDelFiltro) => unknown
  /** Cómo se llama en pantalla. */
  readonly etiqueta: string
}

/**
 * Los campos por los que se puede filtrar.
 *
 * `color` y los campos personalizados del spec no están: este modelo todavía no los tiene, y
 * declararlos aquí haría que un filtro guardado con ellos pareciera válido y no filtrara nada.
 */
export const CAMPOS: Readonly<Record<string, CampoDeclarado>> = {
  title: { tipo: 'texto', etiqueta: 'Nombre', leer: (l) => l.title },
  status: { tipo: 'texto', etiqueta: 'Estado', leer: (l) => l.status },
  priority: { tipo: 'texto', etiqueta: 'Prioridad', leer: (l) => l.priority },
  kind: { tipo: 'texto', etiqueta: 'Clase', leer: (l) => l.kind },
  party: { tipo: 'texto', etiqueta: 'Responde', leer: (l) => l.party },
  owner: { tipo: 'texto', etiqueta: 'Responsable', leer: (l) => l.ownerName ?? l.ownerId ?? null },
  clientOwner: { tipo: 'texto', etiqueta: 'Responsable del cliente', leer: (l) => l.clientOwner },
  startDate: { tipo: 'fecha', etiqueta: 'Fecha de inicio', leer: (l) => l.startDate },
  endDate: { tipo: 'fecha', etiqueta: 'Fecha final', leer: (l) => l.estimatedEndDate },
  createdAt: { tipo: 'fecha', etiqueta: 'Fecha de creación', leer: (l) => l.createdAt?.slice(0, 10) ?? null },
  progress: { tipo: 'numero', etiqueta: 'Avance', leer: (l) => l.progressPct },
  isOverdue: {
    tipo: 'booleano',
    etiqueta: 'Atrasada',
    // Del mismo predicado que resalta la lista y cuenta el panel: tres definiciones de «atrasada»
    // serían tres respuestas distintas a la misma pregunta en la misma pantalla.
    leer: (l, contexto) =>
      isOverdue(
        { estimatedEndDate: l.estimatedEndDate, status: l.status, progressPct: l.progressPct },
        new Date(`${contexto.hoy}T00:00:00`),
      ),
  },
  isSummary: {
    tipo: 'booleano',
    etiqueta: 'Es resumen',
    // Sale del conjunto que arma `filtrar`, no de la línea: una línea no sabe si tiene hijas.
    leer: (linea, contexto) => contexto.resumenes?.has(linea.id) ?? false,
  },
}

/** Qué operadores admite cada tipo. Lo usa el validador y también el constructor de filtros. */
export const OPERADORES_POR_TIPO: Readonly<Record<Tipo, readonly Operador[]>> = {
  texto: ['eq', 'neq', 'in', 'not_in', 'contains', 'is_empty', 'is_not_empty'],
  fecha: ['eq', 'neq', 'between', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'],
  numero: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between'],
  booleano: ['eq'],
}

export class FiltroInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'FiltroInvalido'
  }
}

/**
 * Comprueba que el filtro tiene sentido antes de guardarlo o de aplicarlo.
 *
 * @throws FiltroInvalido con un mensaje que nombra el campo o el operador que falla.
 */
export function validarFiltro(nodo: unknown, ruta = 'filtro'): asserts nodo is Filtro {
  if (typeof nodo !== 'object' || nodo === null) {
    throw new FiltroInvalido(`${ruta}: se esperaba un objeto`)
  }

  const candidato = nodo as Partial<Grupo> & Partial<Condicion>

  if (candidato.op !== undefined) {
    if (candidato.op !== 'AND' && candidato.op !== 'OR') {
      throw new FiltroInvalido(`${ruta}: el operador de grupo debe ser AND u OR`)
    }
    if (!Array.isArray(candidato.conditions)) {
      throw new FiltroInvalido(`${ruta}: un grupo necesita una lista de condiciones`)
    }
    candidato.conditions.forEach((hija, i) => validarNodo(hija, `${ruta}.conditions[${i}]`))
    return
  }

  throw new FiltroInvalido(`${ruta}: la raíz del filtro tiene que ser un grupo con op AND u OR`)
}

function validarNodo(nodo: unknown, ruta: string): void {
  if (typeof nodo !== 'object' || nodo === null) {
    throw new FiltroInvalido(`${ruta}: se esperaba un objeto`)
  }
  const candidato = nodo as Partial<Grupo> & Partial<Condicion>

  if (candidato.op !== undefined) {
    validarFiltro(nodo, ruta)
    return
  }

  if (typeof candidato.field !== 'string') {
    throw new FiltroInvalido(`${ruta}: una condición necesita un campo`)
  }
  const campo = CAMPOS[candidato.field]
  if (!campo) {
    throw new FiltroInvalido(`${ruta}: no existe el campo «${candidato.field}»`)
  }
  if (typeof candidato.operator !== 'string') {
    throw new FiltroInvalido(`${ruta}: una condición necesita un operador`)
  }
  if (!OPERADORES_POR_TIPO[campo.tipo].includes(candidato.operator as Operador)) {
    throw new FiltroInvalido(
      `${ruta}: el operador «${candidato.operator}» no vale para ${campo.etiqueta}`,
    )
  }

  const operador = candidato.operator as Operador
  if (operador === 'in' || operador === 'not_in') {
    if (!Array.isArray(candidato.value)) {
      throw new FiltroInvalido(`${ruta}: «${operador}» necesita una lista de valores`)
    }
  }
  if (operador === 'between') {
    if (!Array.isArray(candidato.value) || candidato.value.length !== 2) {
      throw new FiltroInvalido(`${ruta}: «between» necesita exactamente dos valores`)
    }
  }
}

/** Normaliza a texto comparable: sin acentos, sin mayúsculas y sin espacios de sobra. */
function aTextoComparable(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function estaVacio(valor: unknown): boolean {
  return valor === null || valor === undefined || String(valor).trim() === ''
}

function evaluarCondicion(
  condicion: Condicion,
  linea: LineaFiltrable,
  contexto: ContextoDelFiltro,
): boolean {
  const campo = CAMPOS[condicion.field]
  // No debería llegar aquí sin validar; si llega, no coincide con nada en vez de coincidir con
  // todo. Un filtro roto que no esconde nada es peor que uno que no enseña nada: el segundo se ve.
  if (!campo) return false

  const valor = campo.leer(linea, contexto)
  const { operator: operador, value: esperado } = condicion

  /**
   * Un valor vacío no compara: sólo responde a «está vacío».
   *
   * Sin esto, comparar contra `null` se hacía **como cadena** y `'null'` empieza por `n`: mayor que
   * cualquier `'2026-...'`. O sea que «creada después del 1 de enero» dejaba pasar todas las líneas
   * cuya fecha de creación no llegaba — las 1 368 — y «creada antes de» no dejaba pasar ninguna.
   * Un dato que falta no es ni anterior ni posterior a nada.
   *
   * `neq` es la excepción razonable: «no es X» es cierto de una línea que no tiene valor.
   */
  const vacio = estaVacio(valor)

  switch (operador) {
    case 'is_empty':
      return vacio
    case 'is_not_empty':
      return !vacio
    case 'neq':
      if (vacio) return true
      break
    default:
      if (vacio) return false
      break
  }

  switch (operador) {
    case 'eq':
      return campo.tipo === 'booleano'
        ? Boolean(valor) === Boolean(esperado)
        : aTextoComparable(valor) === aTextoComparable(esperado)
    case 'neq':
      return aTextoComparable(valor) !== aTextoComparable(esperado)
    case 'contains':
      return aTextoComparable(valor).includes(aTextoComparable(esperado))
    case 'in':
      return (esperado as unknown[]).some((v) => aTextoComparable(v) === aTextoComparable(valor))
    case 'not_in':
      return !(esperado as unknown[]).some((v) => aTextoComparable(v) === aTextoComparable(valor))
    case 'between': {
      const [desde, hasta] = esperado as [unknown, unknown]
      if (campo.tipo === 'numero') {
        return Number(valor) >= Number(desde) && Number(valor) <= Number(hasta)
      }
      // Las fechas se comparan como cadenas `AAAA-MM-DD`: en ese formato el orden alfabético y el
      // cronológico son el mismo, y no hay que construir un `Date` por celda.
      return String(valor) >= String(desde) && String(valor) <= String(hasta)
    }
    case 'gt':
      return campo.tipo === 'numero' ? Number(valor) > Number(esperado) : String(valor) > String(esperado)
    case 'gte':
      return campo.tipo === 'numero' ? Number(valor) >= Number(esperado) : String(valor) >= String(esperado)
    case 'lt':
      return campo.tipo === 'numero' ? Number(valor) < Number(esperado) : String(valor) < String(esperado)
    case 'lte':
      return campo.tipo === 'numero' ? Number(valor) <= Number(esperado) : String(valor) <= String(esperado)
    default:
      return false
  }
}

/**
 * ¿Esta línea pasa el filtro?
 *
 * Un grupo **sin condiciones no filtra**, sea AND u OR. Por álgebra, un OR vacío debería no dejar
 * pasar nada; pero quien acaba de añadir un grupo y todavía no ha escrito la condición vería la
 * pantalla en blanco sin entender por qué. Un filtro a medio construir no esconde datos.
 */
export function cumple(
  linea: LineaFiltrable,
  nodo: Filtro | Condicion,
  contexto: ContextoDelFiltro,
): boolean {
  if (!esGrupo(nodo)) return evaluarCondicion(nodo, linea, contexto)

  if (nodo.conditions.length === 0) return true

  return nodo.op === 'AND'
    ? nodo.conditions.every((hija) => cumple(linea, hija, contexto))
    : nodo.conditions.some((hija) => cumple(linea, hija, contexto))
}

/**
 * Aplica el filtro a un plan entero.
 *
 * Arma aquí el conjunto de resúmenes —quién es madre de alguien— porque es lo único que hace falta
 * el plan entero para saberlo, y porque hacerlo aquí lo arregla para todos los que llaman a la vez.
 * Se respeta el que venga dado: quien ya lo calculó para otra cosa no tiene que pagarlo dos veces.
 */
export function filtrar<T extends LineaFiltrable>(
  lineas: readonly T[],
  filtro: Filtro | null,
  contexto: ContextoDelFiltro,
): T[] {
  if (filtro === null) return [...lineas]
  const conElConjunto: ContextoDelFiltro =
    contexto.resumenes !== undefined ? contexto : { ...contexto, resumenes: resumenesDe(lineas) }
  return lineas.filter((linea) => cumple(linea, filtro, conElConjunto))
}

/** Quién es madre de alguien. Una línea es resumen si otra la nombra como padre. */
export function resumenesDe(lineas: readonly LineaFiltrable[]): ReadonlySet<string> {
  const padres = new Set<string>()
  for (const linea of lineas) if (linea.parentId) padres.add(linea.parentId)
  return padres
}

/** El filtro vacío: un AND sin condiciones, que no esconde nada. */
export const FILTRO_VACIO: Filtro = { op: 'AND', conditions: [] }

/** ¿Este filtro esconde algo? Sirve para saber si hay que enseñar el aviso de «filtro puesto». */
export function tieneCondiciones(nodo: Filtro | Condicion): boolean {
  if (!esGrupo(nodo)) return true
  return nodo.conditions.some((hija) => tieneCondiciones(hija))
}

/** Cuántas condiciones tiene, contando las de los grupos anidados. */
export function contarCondiciones(nodo: Filtro | Condicion): number {
  if (!esGrupo(nodo)) return 1
  return nodo.conditions.reduce((total, hija) => total + contarCondiciones(hija), 0)
}

/**
 * Un resumen legible del filtro, para el botón de la barra.
 *
 * Enseñar «Filtro (3)» y nada más obliga a abrir el panel para saber qué se está escondiendo. Con
 * el resumen, quien llega a una pantalla ya filtrada sabe de un vistazo por qué faltan líneas.
 */
export function describirFiltro(nodo: Filtro | Condicion): string {
  if (!esGrupo(nodo)) {
    const campo = CAMPOS[nodo.field]
    const etiqueta = campo?.etiqueta ?? nodo.field
    if (nodo.operator === 'is_empty') return `${etiqueta} vacío`
    if (nodo.operator === 'is_not_empty') return `${etiqueta} con valor`
    if (Array.isArray(nodo.value)) {
      return nodo.operator === 'between'
        ? `${etiqueta} entre ${nodo.value[0]} y ${nodo.value[1]}`
        : `${etiqueta}: ${nodo.value.join(', ')}`
    }
    return `${etiqueta}: ${String(nodo.value)}`
  }

  const partes = nodo.conditions.map((hija) =>
    esGrupo(hija) && hija.conditions.length > 1 ? `(${describirFiltro(hija)})` : describirFiltro(hija),
  )
  return partes.join(nodo.op === 'AND' ? ' y ' : ' o ')
}

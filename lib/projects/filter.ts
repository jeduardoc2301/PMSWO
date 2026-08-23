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
  /*
    Opcionales, como `createdAt`.

    Eran obligatorias y el llamador tenía que meter un `as LineaFiltrable[]` para que cuadrara,
    porque el resumen del Tablero puede traerlas sin fecha. Ese molde apagaba la comprobación de
    tipos de TODO el objeto — y con ella escondió que «Responsable del cliente» leía la columna
    equivocada, que es la cuarta vez que esta junta falla en silencio.

    Una línea sin fecha no es un error: es una línea sin fecha, y el filtro ya sabe decir «está
    vacío».
  */
  readonly startDate?: IsoDate
  readonly estimatedEndDate?: IsoDate
  readonly createdAt?: string
  readonly progressPct: number
  readonly ownerId?: string | null
  readonly ownerName?: string | null
  readonly clientOwner?: string | null
  readonly parentId?: string | null
  /**
   * Los valores de los campos personalizados de esta línea, por identificador de campo (§2).
   *
   * El filtro no los interpreta: los lee quien los declara —ver `campos-en-el-filtro.ts`—, que es
   * lo que permite que este módulo no sepa nada de los nueve tipos del modelo.
   */
  readonly customFields?: Readonly<Record<string, unknown>>
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
  /**
   * Los campos personalizados que este proyecto declara (§2, §10.2).
   *
   * Entran por el contexto y no por un registro global porque **cada proyecto declara los suyos**:
   * un catálogo compilado no puede saberlos, y uno global haría que un filtro guardado en un
   * proyecto pareciera válido en otro donde ese campo no existe.
   *
   * Se pasan **archivados incluidos**. Un filtro guardado puede apuntar a un campo que alguien
   * archivó después, y quitarlo del catálogo haría que el filtro dejara de ser válido en silencio:
   * devolvería cero líneas y parecería que no hay nada que enseñar.
   */
  readonly camposPropios?: Readonly<Record<string, CampoDeclarado>>
}

/**
 * De qué clase es un campo, para saber qué operadores admite.
 *
 * `lista` es el que llega con los campos personalizados (§2): `MULTISELECT`, `PEOPLE` y `TAGS` no
 * guardan un valor, guardan **varios**, y sobre una lista los operadores significan otra cosa — ver
 * `lib/projects/campos-personalizados.ts`.
 */
export type Tipo = 'texto' | 'fecha' | 'numero' | 'booleano' | 'lista'

export interface CampoDeclarado {
  readonly tipo: Tipo
  readonly leer: (linea: LineaFiltrable, contexto: ContextoDelFiltro) => unknown
  /** Cómo se llama en pantalla. */
  readonly etiqueta: string
}

/**
 * Los campos **de siempre**, los que trae toda línea.
 *
 * Los personalizados no están aquí porque no se saben al compilar: los declara cada proyecto. Entran
 * por `camposDe()`, que mezcla éstos con los que le pasen — ver `ContextoDelFiltro.camposPropios`.
 *
 * `color` sigue sin estar: el modelo no lo tiene, y declararlo haría que un filtro guardado con él
 * pareciera válido y no filtrara nada.
 */
export const CAMPOS_BASE: Readonly<Record<string, CampoDeclarado>> = {
  title: { tipo: 'texto', etiqueta: 'Nombre', leer: (l) => l.title },
  status: { tipo: 'texto', etiqueta: 'Estado', leer: (l) => l.status },
  priority: { tipo: 'texto', etiqueta: 'Prioridad', leer: (l) => l.priority },
  kind: { tipo: 'texto', etiqueta: 'Clase', leer: (l) => l.kind },
  party: { tipo: 'texto', etiqueta: 'Responde', leer: (l) => l.party },
  owner: { tipo: 'texto', etiqueta: 'Responsable', leer: (l) => l.ownerName ?? l.ownerId ?? null },
  clientOwner: { tipo: 'texto', etiqueta: 'Responsable del cliente', leer: (l) => l.clientOwner },
  startDate: { tipo: 'fecha', etiqueta: 'Fecha de inicio', leer: (l) => l.startDate ?? null },
  endDate: { tipo: 'fecha', etiqueta: 'Fecha final', leer: (l) => l.estimatedEndDate ?? null },
  createdAt: { tipo: 'fecha', etiqueta: 'Fecha de creación', leer: (l) => l.createdAt?.slice(0, 10) ?? null },
  /**
   * El avance **en porcentaje**, que es la unidad en la que lo dice todo lo demás.
   *
   * Se guarda como fracción y antes el filtro comparaba contra ella: «Avance mayor que 50» no
   * encontraba ni una línea de las 1 368 —porque ninguna fracción es mayor que 50— y quien lo
   * escribía no tenía forma de saber por qué. Medido: con `> 50` salían cero líneas y con `> 0,4`
   * salían las que van por la mitad.
   *
   * Nadie escribe «0,4» al preguntar por el avance: la rejilla dice «40 %», la tarjeta dice «40 %» y
   * el panel también. El filtro tenía que hablar el mismo idioma.
   */
  progress: {
    tipo: 'numero',
    etiqueta: 'Avance (%)',
    leer: (l) => (l.progressPct == null ? null : l.progressPct * 100),
  },
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
  /**
   * Los de orden no están, y no es una omisión: **una lista no es mayor que otra**.
   *
   * Y `eq` tampoco: sobre una lista, «es igual a» no le sirve a nadie — lo que se quiere preguntar
   * es si la contiene. Por eso `contains` hace ese papel aquí.
   */
  lista: ['contains', 'in', 'not_in', 'is_empty', 'is_not_empty'],
}

/**
 * El catálogo de campos que aplica en este contexto: los de siempre más los del proyecto.
 *
 * Los propios van **después** para que no puedan tapar a los de siempre. No debería hacer falta
 * —sus claves llevan el prefijo `cf:`— pero el orden lo garantiza sin depender de esa convención:
 * un campo personalizado que se llamara `status` existiría al lado del estado de verdad y el filtro
 * elegiría uno de los dos sin decir cuál.
 */
export function camposDe(contexto?: Pick<ContextoDelFiltro, 'camposPropios'>): Readonly<Record<string, CampoDeclarado>> {
  if (!contexto?.camposPropios) return CAMPOS_BASE
  return { ...contexto.camposPropios, ...CAMPOS_BASE }
}

/** Compatibilidad: el catálogo sin campos de proyecto. */
export const CAMPOS = CAMPOS_BASE

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
  const campo = camposDe(contexto)[condicion.field]
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
   * `neq` y `not_in` son la excepción razonable: «no es X» y «no es ninguno de» son ciertos de una
   * línea que no tiene valor. Una línea sin etiquetas **no está** etiquetada como riesgo.
   */
  const vacio = estaVacio(valor)

  switch (operador) {
    case 'is_empty':
      return vacio
    case 'is_not_empty':
      return !vacio
    case 'neq':
    case 'not_in':
      if (vacio) return true
      break
    default:
      if (vacio) return false
      break
  }

  /**
   * Los campos que guardan una **lista** comparan por pertenencia, no por igualdad.
   *
   * Va antes del `switch` general porque ahí dentro `valor` se convierte a texto, y `['riesgo',
   * 'banco']` convertido a texto es `'riesgo,banco'`: entonces «contiene banco» acertaría por
   * casualidad y «contiene esgo,ban» también — que es exactamente la clase de acierto que hace que
   * un filtro parezca funcionar hasta el día que no.
   */
  if (campo.tipo === 'lista') {
    const suyos = new Set(Array.isArray(valor) ? valor.map((v) => aTextoComparable(v)) : [])
    const buscados = (Array.isArray(esperado) ? esperado : [esperado]).map((v) => aTextoComparable(v))
    switch (operador) {
      case 'contains':
      case 'in':
        return buscados.some((b) => suyos.has(b))
      case 'not_in':
        return !buscados.some((b) => suyos.has(b))
      default:
        // Los de orden no aplican y el validador no los ofrece; si llega uno, no coincide con nada
        // en vez de coincidir con todo. Un filtro roto que no esconde nada es peor que uno que no
        // enseña nada: el segundo se ve.
        return false
    }
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

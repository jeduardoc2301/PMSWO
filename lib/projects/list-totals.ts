/**
 * La fila de totales y el formato agrupado de la vista Lista (§6.2, §6.3).
 *
 * Vive aparte del componente porque es aritmética y agrupación, y las dos se prueban sin navegador.
 * El §6.3 pide dos cosas que sólo se pueden garantizar aquí: que el total respete el filtro activo,
 * y que los subtotales de los grupos **cuadren** con el total. Lo segundo no es una consecuencia
 * automática de lo primero: cuadran únicamente si cada línea cae en exactamente un grupo, y eso hay
 * que sostenerlo a propósito cuando el campo por el que se agrupa está vacío.
 *
 * ## Qué se suma y qué no
 *
 * Se suman las horas estimadas y se cuenta el avance ponderado por ellas. El §6.2 nombra además
 * presupuesto, costo real y tiempo registrado: ninguno de los tres existe como campo en el modelo,
 * y una columna de totales que sume siempre cero es peor que no tenerla — parece un dato y es un
 * hueco.
 */

/** Lo mínimo que una línea necesita tener para entrar en un total. */
export interface LineaSumable {
  readonly id: string
  readonly status?: string | null
  readonly priority?: string | null
  readonly ownerName?: string | null
  readonly phase?: string | null
  /** Horas estimadas. Nulo cuando nadie las capturó. */
  readonly estimatedHours?: number | null
  /** Avance de 0 a 1. */
  readonly progressPct?: number | null
  /** Verdadero en las líneas que son resumen de otras. */
  readonly esResumen?: boolean
}

export interface Totales {
  /** Cuántas líneas entran en el total. */
  readonly lineas: number
  /** Suma de horas estimadas. */
  readonly horas: number
  /**
   * Avance ponderado por horas, de 0 a 1.
   *
   * Ponderado y no promedio simple: una tarea de ochenta horas al 10 % y una de una hora al 100 %
   * no son «55 % de avance». Cuando nadie capturó horas se cae al promedio simple, que es lo único
   * que queda, y se dice en `ponderado`.
   */
  readonly avance: number
  /** Falso cuando no había horas y hubo que promediar a secas. */
  readonly ponderado: boolean
}

export const TOTALES_VACIOS: Totales = Object.freeze({ lineas: 0, horas: 0, avance: 0, ponderado: true })

/**
 * Suma un conjunto de líneas.
 *
 * Los resúmenes se excluyen: sus horas son las de sus hijos, y contarlos duplicaría cada rama. Es el
 * mismo motivo por el que el informe ejecutivo los excluye de sus cifras.
 */
export function totalizar(lineas: readonly LineaSumable[]): Totales {
  const hojas = lineas.filter((l) => l.esResumen !== true)
  if (hojas.length === 0) return { ...TOTALES_VACIOS, lineas: 0 }

  let horas = 0
  let horasPorAvance = 0
  let sumaSimple = 0
  for (const linea of hojas) {
    const h = Math.max(0, linea.estimatedHours ?? 0)
    const p = Math.min(1, Math.max(0, linea.progressPct ?? 0))
    horas += h
    horasPorAvance += h * p
    sumaSimple += p
  }

  return {
    lineas: hojas.length,
    horas,
    avance: horas > 0 ? horasPorAvance / horas : sumaSimple / hojas.length,
    ponderado: horas > 0,
  }
}

/** Por qué campo se agrupa la lista en el formato agrupado. */
export const CAMPOS_DE_GRUPO = ['status', 'priority', 'owner', 'phase'] as const
export type CampoDeGrupo = (typeof CAMPOS_DE_GRUPO)[number]

export const NOMBRES_DE_GRUPO: Readonly<Record<CampoDeGrupo, string>> = Object.freeze({
  status: 'Estado',
  priority: 'Prioridad',
  owner: 'Responsable',
  phase: 'Fase',
})

/** Lo que se enseña cuando el campo por el que se agrupa está vacío. */
export const SIN_VALOR = 'Sin asignar'

export interface Grupo {
  readonly clave: string
  readonly lineas: readonly LineaSumable[]
  readonly subtotal: Totales
}

function valorDe(linea: LineaSumable, campo: CampoDeGrupo): string {
  const crudo =
    campo === 'status' ? linea.status
    : campo === 'priority' ? linea.priority
    : campo === 'owner' ? linea.ownerName
    : linea.phase
  const limpio = (crudo ?? '').trim()
  return limpio === '' ? SIN_VALOR : limpio
}

/**
 * Reparte las líneas en grupos, con su subtotal cada uno.
 *
 * Cada línea cae en **exactamente un** grupo, incluidas las que tienen el campo vacío: van a «Sin
 * asignar». Dejarlas fuera es cómo los subtotales dejan de cuadrar con el total sin que nadie lo
 * note — el total sigue estando bien y la suma de los grupos no llega, que es el error más difícil
 * de ver porque las dos cifras son ciertas por separado.
 *
 * Los grupos salen ordenados por nombre, con «Sin asignar» al final: es un cajón, no una categoría.
 */
export function agrupar(lineas: readonly LineaSumable[], campo: CampoDeGrupo): readonly Grupo[] {
  const cajones = new Map<string, LineaSumable[]>()
  for (const linea of lineas) {
    const clave = valorDe(linea, campo)
    const cajon = cajones.get(clave)
    if (cajon) cajon.push(linea)
    else cajones.set(clave, [linea])
  }

  return [...cajones.entries()]
    .sort(([a], [b]) => {
      if (a === SIN_VALOR) return 1
      if (b === SIN_VALOR) return -1
      return a.localeCompare(b, 'es')
    })
    .map(([clave, suyas]) => ({ clave, lineas: suyas, subtotal: totalizar(suyas) }))
}

/**
 * ¿Cuadran los subtotales con el total?
 *
 * Se expone para poder comprobarlo, no para decidir nada: el §6.3 lo pide como criterio y una
 * comprobación que sólo vive dentro de una prueba no protege del día que alguien cambie el reparto.
 */
export function subtotalesCuadran(grupos: readonly Grupo[], total: Totales): boolean {
  const lineas = grupos.reduce((suma, g) => suma + g.subtotal.lineas, 0)
  const horas = grupos.reduce((suma, g) => suma + g.subtotal.horas, 0)
  // Las horas se comparan con holgura de un céntimo de hora: son sumas de coma flotante.
  return lineas === total.lineas && Math.abs(horas - total.horas) < 0.01
}

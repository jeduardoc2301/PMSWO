/**
 * Arma el libro de Excel de un plan.
 *
 * Lo que distingue esto de un volcado a CSV no es el formato del archivo: es que **la hoja
 * calcula**. El estado, el atraso y el avance de los contenedores van como fórmulas vivas, no
 * como números congelados en el momento de exportar. Quien recibe el archivo mueve la fecha de
 * corte o captura el avance de una hoja y el plan entero responde, sin volver a pedir nada.
 *
 * De ahí salen las tres decisiones que mandan sobre el resto:
 *
 * 1. **Las letras de columna se resuelven al generar.** Nunca se escribe `H7` a mano: el bloque
 *    dinámico cambia de ancho con cada proyecto, y una letra fija sería un `#REF!` en cuanto un
 *    plan tuviera un campo personalizado más que otro.
 * 2. **El avance de un contenedor se pondera por Peso, no por Duración.** La duración de una
 *    madre es su *tramo*, y los tramos de las hijas se solapan; sumarlos cuenta dos veces los
 *    días compartidos y le da más voz a la rama más larga por el mero hecho de solaparse. El Peso
 *    es trabajo real y no se solapa. Por eso existe la columna, y por eso va oculta: es
 *    maquinaria, no información.
 * 3. **Nada de aquí pregunta por un tipo concreto.** El papel decide, y el papel sale de
 *    `roles.ts`. Un plan sin configuración ninguna sale bien igual.
 */

import {
  Estilos,
  escribirLibro,
  letraDeColumna,
  serialDeExcel,
  type Celda,
  type Columna,
  type Fila,
  type ReglaCondicional,
} from '../xlsx/writer'
import { ASPECTO, esContenedor, papelDe, type MapaDePapeles, type Papel } from './roles'

// ── Entrada ──────────────────────────────────────────────────────────────────

export interface LineaDePlan {
  readonly id: string
  readonly nombre: string
  /** Cómo llama el plan a esta línea. Se enseña tal cual y se usa para buscar su papel. */
  readonly tipo: string | null
  readonly parentId: string | null
  /** Número de día del motor, o `null` si la línea no tiene fecha. */
  readonly inicio: number | null
  readonly fin: number | null
  /** Días laborables. En una madre es su tramo; en una hoja, su trabajo. */
  readonly duracion: number | null
  /** De 0 a 1. En una madre da igual lo que traiga: lo calcula la hoja. */
  readonly avance: number
  /** Esfuerzo, si el plan lo tiene. Cuando falta se usan los días laborables. */
  readonly peso: number | null
  readonly predecesoras: readonly string[]
  /** Valores por id de campo personalizado. */
  readonly personalizados: Readonly<Record<string, string | number | boolean | null>>
}

export interface CampoDinamico {
  readonly id: string
  readonly etiqueta: string
}

export interface ConfiguracionDeExportacion {
  /** Tipo del plan → papel semántico. Vacío o ausente es válido y frecuente. */
  readonly papeles?: MapaDePapeles | null
  readonly descripcion?: string | null
  /** Advertencias de lectura, una por renglón. */
  readonly advertencias?: readonly string[] | null
}

export interface PlanParaExportar {
  readonly nombre: string
  /** En orden de plan: cada madre antes que sus hijas. */
  readonly lineas: readonly LineaDePlan[]
  /** En el orden configurado del proyecto. */
  readonly campos: readonly CampoDinamico[]
  readonly configuracion: ConfiguracionDeExportacion
}

// ── Constantes compartidas ───────────────────────────────────────────────────

/**
 * Los tres estados, en un solo sitio.
 *
 * La fórmula los escribe y el formato condicional los busca. Si vivieran en dos listas, bastaría
 * cambiar una tilde en una para que el color dejara de aplicarse en silencio — la hoja seguiría
 * diciendo «En curso» y ninguna celda se pintaría, sin ningún error a la vista.
 */
export const ESTADOS = Object.freeze({
  cerrado: 'Cerrado',
  enCurso: 'En curso',
  noIniciado: 'No iniciado',
})

const COLOR_ESTADO: Readonly<Record<string, { fondo: string; texto: string }>> = Object.freeze({
  [ESTADOS.cerrado]: { fondo: 'D1FAE5', texto: '065F46' },
  [ESTADOS.enCurso]: { fondo: 'FEF3C7', texto: '92400E' },
  [ESTADOS.noIniciado]: { fondo: 'F3F4F6', texto: '6B7280' },
})

const ROJO_ATRASO = 'B3141C'

/** El nombre definido que amarra la fecha de corte. Las fórmulas lo usan por nombre, no por celda. */
export const NOMBRE_FECHA_CORTE = 'FechaCorte'

/**
 * La hoja se llama siempre igual.
 *
 * No lleva el nombre del plan porque Excel prohíbe siete caracteres en el nombre de una hoja, la
 * corta a 31 y el nombre definido tiene que apuntar a ella: un plan llamado «Migración BU
 * 2026/2027» rompería la referencia y con ella todas las fórmulas de atraso. El nombre del plan
 * está en la primera fila, que es donde se lee.
 */
const NOMBRE_DE_HOJA = 'Plan'

/** El bloque núcleo: orden y ancho fijos, esté o no el dato. */
const NUCLEO = [
  { titulo: 'ID', ancho: 6 },
  { titulo: 'Nivel', ancho: 6 },
  { titulo: 'Nombre de la tarea', ancho: 92 },
  { titulo: 'Tipo', ancho: 20 },
  { titulo: 'Inicio', ancho: 12 },
  { titulo: 'Fin', ancho: 12 },
  { titulo: 'Duración', ancho: 12 },
  { titulo: '% avance', ancho: 10 },
  { titulo: 'Estado', ancho: 13 },
  { titulo: 'Atraso / Ventaja', ancho: 15 },
  { titulo: 'Predecesoras', ancho: 18 },
] as const

const COL = {
  id: 1,
  nivel: 2,
  nombre: 3,
  tipo: 4,
  inicio: 5,
  fin: 6,
  duracion: 7,
  avance: 8,
  estado: 9,
  atraso: 10,
  predecesoras: 11,
} as const

const FORMATO_FECHA = 'dd-mmm-yy'
const FORMATO_PORCENTAJE = '0%'
const FORMATO_ATRASO = '0.0;[Red]-0.0;0'
const FUENTE = 'Calibri'
const TAMANO_CUERPO = 9.5

const ANCHO_DINAMICO_MIN = 18
const ANCHO_DINAMICO_MAX = 66

// ── Construcción ─────────────────────────────────────────────────────────────

interface FilaResuelta {
  readonly linea: LineaDePlan
  readonly profundidad: number
  readonly papel: Papel
  readonly hijas: readonly string[]
  /** Fila de Excel en base 1, ya contando la cabecera del documento. */
  readonly numero: number
  readonly consecutivo: number
}

function textoDe(valor: string | number | boolean | null | undefined): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  return String(valor)
}

/**
 * Ordena el plan de forma que cada madre vaya antes que sus hijas, y calcula la profundidad.
 *
 * Se recorre desde las raíces en vez de confiar en el orden que llega. Una línea cuya madre no
 * está en el conjunto —porque el filtro la dejó fuera, o porque el dato está roto— se trata como
 * raíz: perderla en silencio sería peor, porque el archivo diría que el plan tiene menos trabajo
 * del que tiene.
 */
function ordenarPorJerarquia(lineas: readonly LineaDePlan[]): {
  orden: readonly { linea: LineaDePlan; profundidad: number }[]
  hijas: ReadonlyMap<string, readonly string[]>
} {
  const porId = new Map(lineas.map((l) => [l.id, l]))
  const hijas = new Map<string, string[]>()
  const raices: LineaDePlan[] = []

  for (const linea of lineas) {
    const madre = linea.parentId
    if (madre && porId.has(madre)) {
      const lista = hijas.get(madre)
      if (lista) lista.push(linea.id)
      else hijas.set(madre, [linea.id])
    } else {
      raices.push(linea)
    }
  }

  const orden: { linea: LineaDePlan; profundidad: number }[] = []
  const visitadas = new Set<string>()

  const bajar = (linea: LineaDePlan, profundidad: number): void => {
    // Un ciclo en la jerarquía colgaría el recorrido. No debería existir, pero el exportador no es
    // el sitio para descubrirlo a base de agotar la pila.
    if (visitadas.has(linea.id)) return
    visitadas.add(linea.id)
    orden.push({ linea, profundidad })
    for (const idHija of hijas.get(linea.id) ?? []) {
      const hija = porId.get(idHija)
      if (hija) bajar(hija, profundidad + 1)
    }
  }

  for (const raiz of raices) bajar(raiz, 0)

  // Lo que quedara fuera por un ciclo se añade al final antes que perderlo.
  for (const linea of lineas) {
    if (!visitadas.has(linea.id)) {
      visitadas.add(linea.id)
      orden.push({ linea, profundidad: 0 })
    }
  }

  return { orden, hijas }
}

/** Las filas de cabecera del documento, antes de los títulos de columna. */
function filasDeCabecera(plan: PlanParaExportar): { texto: string; grande: boolean }[] {
  const filas: { texto: string; grande: boolean }[] = [{ texto: plan.nombre, grande: true }]

  const descripcion = plan.configuracion.descripcion?.trim()
  if (descripcion) filas.push({ texto: descripcion, grande: false })

  const advertencias = (plan.configuracion.advertencias ?? []).map((a) => a.trim()).filter(Boolean)
  if (advertencias.length > 0) filas.push({ texto: advertencias.join('  ·  '), grande: false })

  return filas
}

export interface LibroDePlan {
  readonly contenido: Buffer
  /** Para la prueba y para el registro: cuántas filas de datos salieron. */
  readonly lineas: number
  readonly columnas: number
}

export function construirLibroDePlan(plan: PlanParaExportar): LibroDePlan {
  const estilos = new Estilos()
  const { orden, hijas } = ordenarPorJerarquia(plan.lineas)

  // ── Geometría de columnas ──────────────────────────────────────────────────
  const primeraDinamica = NUCLEO.length + 1
  const columnaPeso = NUCLEO.length + plan.campos.length + 1
  const letraPeso = letraDeColumna(columnaPeso)
  const totalColumnas = columnaPeso

  // ── Geometría de filas ─────────────────────────────────────────────────────
  const cabecera = filasDeCabecera(plan)
  // La fecha de corte va después del bloque de texto, y la fila en blanco la separa de la tabla.
  const filaCorte = cabecera.length + 1
  const filaTitulos = filaCorte + 2
  const primeraFilaDatos = filaTitulos + 1

  const resueltas: FilaResuelta[] = orden.map(({ linea, profundidad }, i) => {
    const suyas = hijas.get(linea.id) ?? []
    return {
      linea,
      profundidad,
      hijas: suyas,
      papel: papelDe(
        {
          tipo: linea.tipo,
          profundidad,
          tieneHijas: suyas.length > 0,
          duracion: linea.duracion ?? 0,
        },
        plan.configuracion.papeles,
      ),
      numero: primeraFilaDatos + i,
      consecutivo: i + 1,
    }
  })

  const filaDe = new Map(resueltas.map((r) => [r.linea.id, r]))
  const ultimaFila = resueltas.length > 0 ? resueltas[resueltas.length - 1].numero : filaTitulos

  // ── Estilos ────────────────────────────────────────────────────────────────
  const estiloTitulo = estilos.registrar({
    fuente: { negrita: true, color: '1F2937', tamano: 16, nombre: FUENTE },
  })
  const estiloNota = estilos.registrar({
    fuente: { color: '6B7280', tamano: 9.5, nombre: FUENTE },
  })
  const estiloEtiquetaCorte = estilos.registrar({
    fuente: { negrita: true, color: '1F2937', tamano: 10, nombre: FUENTE },
    alineacion: { horizontal: 'left' },
  })
  const estiloCorte = estilos.registrar({
    fuente: { negrita: true, color: '1F2937', tamano: 10, nombre: FUENTE },
    relleno: 'FEF3C7',
    formato: FORMATO_FECHA,
    alineacion: { horizontal: 'center' },
  })
  const estiloEncabezado = estilos.registrar({
    fuente: { negrita: true, color: 'FFFFFF', tamano: 10, nombre: FUENTE },
    relleno: '1F2937',
    alineacion: { vertical: 'center', ajustar: true },
  })

  /**
   * El estilo de una celda del cuerpo.
   *
   * El color lo pone el papel y se aplica a la fila entera; el formato numérico y la sangría son
   * de la columna. Se combinan aquí en vez de en dos capas porque un `xf` de Excel es una unidad:
   * no hay forma de decir «este relleno y el formato de al lado».
   */
  const estiloCuerpo = (papel: Papel, extra?: { formato?: string; sangria?: number; centrado?: boolean }) => {
    const aspecto = ASPECTO[papel]
    return estilos.registrar({
      fuente: {
        negrita: aspecto.negrita,
        color: aspecto.texto,
        tamano: TAMANO_CUERPO,
        nombre: FUENTE,
      },
      relleno: aspecto.fondo ?? undefined,
      formato: extra?.formato,
      alineacion: {
        vertical: 'center',
        horizontal: extra?.centrado ? 'center' : undefined,
        sangria: extra?.sangria,
      },
    })
  }

  // ── Filas de cabecera ──────────────────────────────────────────────────────
  const filas: Fila[] = []

  for (const linea of cabecera) {
    filas.push({
      celdas: [{ tipo: 'texto', valor: linea.texto, estilo: linea.grande ? estiloTitulo : estiloNota }],
      altura: linea.grande ? 24 : undefined,
    })
  }

  const celdasCorte: Celda[] = new Array(totalColumnas).fill(null).map(() => ({ tipo: 'vacia' }) as Celda)
  celdasCorte[0] = { tipo: 'texto', valor: 'Fecha de corte del avance  →', estilo: estiloEtiquetaCorte }
  // `TODAY()` y no la fecha de hoy congelada: el archivo se abre semanas después de generarse, y
  // el atraso que enseñe entonces tiene que ser el de entonces. Quien quiera mirar otro corte
  // escribe una fecha encima y toda la hoja se recalcula — eso es el encargo.
  celdasCorte[COL.inicio - 1] = { tipo: 'formula', formula: 'TODAY()', estilo: estiloCorte }
  filas.push({ celdas: celdasCorte })

  filas.push({ celdas: [] })

  // ── Títulos de columna ─────────────────────────────────────────────────────
  const titulos: Celda[] = [
    ...NUCLEO.map((c) => ({ tipo: 'texto', valor: c.titulo, estilo: estiloEncabezado }) as Celda),
    ...plan.campos.map((c) => ({ tipo: 'texto', valor: c.etiqueta, estilo: estiloEncabezado }) as Celda),
    { tipo: 'texto', valor: 'Peso', estilo: estiloEncabezado },
  ]
  filas.push({ celdas: titulos, altura: 28 })

  // ── Cuerpo ─────────────────────────────────────────────────────────────────
  const refCorte = NOMBRE_FECHA_CORTE

  for (const fila of resueltas) {
    const { linea, papel, profundidad, numero } = fila
    const n = numero
    const L = {
      inicio: `${letraDeColumna(COL.inicio)}${n}`,
      fin: `${letraDeColumna(COL.fin)}${n}`,
      duracion: `${letraDeColumna(COL.duracion)}${n}`,
      avance: `${letraDeColumna(COL.avance)}${n}`,
    }

    const celdas: Celda[] = []

    celdas[COL.id - 1] = { tipo: 'numero', valor: fila.consecutivo, estilo: estiloCuerpo(papel, { centrado: true }) }
    celdas[COL.nivel - 1] = {
      tipo: 'numero',
      valor: profundidad + 1,
      estilo: estiloCuerpo(papel, { centrado: true }),
    }
    celdas[COL.nombre - 1] = {
      tipo: 'texto',
      valor: linea.nombre,
      // La sangría dibuja la jerarquía en la propia celda. El agrupado de Excel la pliega, pero
      // en cuanto alguien copia la columna a otro sitio la sangría es lo único que sobrevive.
      estilo: estiloCuerpo(papel, { sangria: profundidad * 2 }),
    }
    celdas[COL.tipo - 1] = { tipo: 'texto', valor: linea.tipo ?? '', estilo: estiloCuerpo(papel) }

    celdas[COL.inicio - 1] =
      linea.inicio !== null
        ? { tipo: 'fecha', serial: serialDeExcel(linea.inicio), estilo: estiloCuerpo(papel, { formato: FORMATO_FECHA, centrado: true }) }
        : { tipo: 'vacia', estilo: estiloCuerpo(papel) }

    celdas[COL.fin - 1] =
      linea.fin !== null
        ? { tipo: 'fecha', serial: serialDeExcel(linea.fin), estilo: estiloCuerpo(papel, { formato: FORMATO_FECHA, centrado: true }) }
        : { tipo: 'vacia', estilo: estiloCuerpo(papel) }

    celdas[COL.duracion - 1] =
      linea.duracion !== null
        ? { tipo: 'numero', valor: linea.duracion, estilo: estiloCuerpo(papel, { centrado: true }) }
        : { tipo: 'vacia', estilo: estiloCuerpo(papel) }

    // ── Avance ───────────────────────────────────────────────────────────────
    const estiloAvance = estiloCuerpo(papel, { formato: FORMATO_PORCENTAJE, centrado: true })
    const hijasConFila = fila.hijas.map((id) => filaDe.get(id)).filter((h): h is FilaResuelta => Boolean(h))

    if (hijasConFila.length > 0) {
      // Media ponderada por el Peso de las hijas DIRECTAS. Sólo las directas: cada nivel ya lleva
      // dentro el de los suyos, y volver a sumar las nietas las contaría dos veces.
      const numerador = hijasConFila
        .map((h) => `${letraPeso}${h.numero}*${letraDeColumna(COL.avance)}${h.numero}`)
        .join('+')
      const denominador = hijasConFila.map((h) => `${letraPeso}${h.numero}`).join('+')
      celdas[COL.avance - 1] = {
        tipo: 'formula',
        formula: `IFERROR((${numerador})/(${denominador}),0)`,
        estilo: estiloAvance,
      }
    } else {
      // En una hoja el avance es un dato que se captura. Va como valor, no como fórmula, porque
      // el archivo se manda para que lo actualicen.
      celdas[COL.avance - 1] = {
        tipo: 'numero',
        valor: Math.min(1, Math.max(0, linea.avance)),
        estilo: estiloAvance,
      }
    }

    // ── Estado ───────────────────────────────────────────────────────────────
    // `N()` convierte una celda vacía en 0 sin romperse: sin él, una hoja sin avance capturado
    // daría `#¡VALOR!` en vez de «No iniciado».
    celdas[COL.estado - 1] = {
      tipo: 'formula',
      formula: `IF(N(${L.avance})=1,"${ESTADOS.cerrado}",IF(N(${L.avance})=0,"${ESTADOS.noIniciado}","${ESTADOS.enCurso}"))`,
      estilo: estiloCuerpo(papel, { centrado: true }),
    }

    // ── Atraso / Ventaja ─────────────────────────────────────────────────────
    const estiloAtraso = estiloCuerpo(papel, { formato: FORMATO_ATRASO, centrado: true })
    if (linea.inicio === null || linea.fin === null || linea.duracion === null) {
      // Sin fechas no hay atraso que medir. Una fórmula aquí daría `#¡VALOR!` sobre celdas vacías,
      // y una columna de errores hace que se deje de mirar la columna entera.
      celdas[COL.atraso - 1] = { tipo: 'vacia', estilo: estiloAtraso }
    } else {
      // Un hito no se mide en avance parcial: o llegó o no llegó, y si no llegó el atraso son los
      // días laborables que van desde su fecha hasta el corte.
      const deHito = `IF(${L.avance}=1,0,IF(${refCorte}<=${L.fin},0,-(NETWORKDAYS(${L.fin},${refCorte})-1)))`
      // Para lo demás: lo que debería llevar avanzado a día de corte contra lo que lleva, en días.
      const esperado = `MIN(1,MAX(0,NETWORKDAYS(${L.inicio},MIN(${refCorte},${L.fin}))/${L.duracion}))`
      const deTarea = `ROUND((${L.avance}-${esperado})*${L.duracion},1)`
      celdas[COL.atraso - 1] = {
        tipo: 'formula',
        formula: `IF(${L.duracion}=0,${deHito},${deTarea})`,
        estilo: estiloAtraso,
      }
    }

    // ── Predecesoras ─────────────────────────────────────────────────────────
    // Por el consecutivo de la fila, no por el identificador interno: quien lee la hoja busca el
    // número que ve en la columna ID, y un uuid no le sirve de nada.
    const predecesoras = linea.predecesoras
      .map((id) => filaDe.get(id)?.consecutivo)
      .filter((c): c is number => c !== undefined)
      .sort((a, b) => a - b)
    celdas[COL.predecesoras - 1] = {
      tipo: 'texto',
      valor: predecesoras.join(', '),
      estilo: estiloCuerpo(papel, { centrado: true }),
    }

    // ── Bloque dinámico ──────────────────────────────────────────────────────
    plan.campos.forEach((campo, i) => {
      celdas[primeraDinamica - 1 + i] = {
        tipo: 'texto',
        valor: textoDe(linea.personalizados[campo.id]),
        estilo: estiloCuerpo(papel),
      }
    })

    // ── Peso ─────────────────────────────────────────────────────────────────
    const estiloPeso = estiloCuerpo(papel, { centrado: true })
    if (hijasConFila.length > 0) {
      celdas[columnaPeso - 1] = {
        tipo: 'formula',
        formula: hijasConFila.map((h) => `${letraPeso}${h.numero}`).join('+'),
        estilo: estiloPeso,
      }
    } else {
      celdas[columnaPeso - 1] = {
        tipo: 'numero',
        valor: linea.peso ?? linea.duracion ?? 0,
        estilo: estiloPeso,
      }
    }

    filas.push({ celdas, nivel: profundidad })
  }

  // ── Anchos ─────────────────────────────────────────────────────────────────
  const columnas: Columna[] = [
    ...NUCLEO.map((c) => ({ ancho: c.ancho })),
    ...plan.campos.map((campo) => {
      const largos = plan.lineas
        .map((l) => textoDe(l.personalizados[campo.id]).length)
        .filter((n) => n > 0)
      const media = largos.length > 0 ? largos.reduce((a, b) => a + b, 0) / largos.length : 0
      return { ancho: Math.round(Math.min(ANCHO_DINAMICO_MAX, Math.max(ANCHO_DINAMICO_MIN, media))) }
    }),
    // Es maquinaria de las fórmulas, no información del plan. Oculta, no ausente: si no existiera,
    // el avance ponderado no tendría de dónde salir.
    { ancho: 10, oculta: true },
  ]

  // ── Formato condicional y validación ───────────────────────────────────────
  const condicionales: ReglaCondicional[] = []
  if (resueltas.length > 0) {
    const rangoEstado = `${letraDeColumna(COL.estado)}${primeraFilaDatos}:${letraDeColumna(COL.estado)}${ultimaFila}`
    for (const [texto, color] of Object.entries(COLOR_ESTADO)) {
      condicionales.push({
        rango: rangoEstado,
        operador: 'equal',
        valor: `"${texto}"`,
        estilo: { relleno: color.fondo, fuente: { color: color.texto } },
      })
    }
    condicionales.push({
      rango: `${letraDeColumna(COL.atraso)}${primeraFilaDatos}:${letraDeColumna(COL.atraso)}${ultimaFila}`,
      operador: 'lessThan',
      valor: '0',
      estilo: { fuente: { color: ROJO_ATRASO } },
    })
  }

  const validaciones =
    resueltas.length > 0
      ? [
          {
            rango: `${letraDeColumna(COL.avance)}${primeraFilaDatos}:${letraDeColumna(COL.avance)}${ultimaFila}`,
            minimo: 0,
            maximo: 1,
            mensaje: 'El avance va de 0 a 1. Un 40 % se escribe 0.4, o 40% con el signo.',
          },
        ]
      : []

  const contenido = escribirLibro(
    {
      hojas: [
        {
          nombre: NOMBRE_DE_HOJA,
          columnas,
          filas,
          // Congelado bajo los títulos y a la derecha del nombre: al desplazarse a la
          // derecha —donde están los campos del proyecto— se sigue viendo de qué línea se habla.
          panelFijo: { fila: filaTitulos, columna: COL.nombre },
          autofiltro:
            resueltas.length > 0
              ? `A${filaTitulos}:${letraDeColumna(totalColumnas)}${ultimaFila}`
              : undefined,
          condicionales,
          validaciones,
        },
      ],
      nombresDefinidos: [
        {
          nombre: NOMBRE_FECHA_CORTE,
          refiereA: `${NOMBRE_DE_HOJA}!$${letraDeColumna(COL.inicio)}$${filaCorte}`,
        },
      ],
    },
    estilos,
  )

  return { contenido, lineas: resueltas.length, columnas: totalColumnas }
}

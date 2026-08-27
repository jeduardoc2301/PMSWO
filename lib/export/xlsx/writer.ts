/**
 * Escritor de libros de Excel, sin dependencias externas.
 *
 * Este archivo **no sabe nada de planes de proyecto**. Habla de filas, columnas, estilos y
 * fórmulas; qué signifiquen es asunto de quien lo llame. Esa frontera es lo que permite que el
 * exportador de al lado sea genérico: si una regla de un proyecto concreto se colara aquí, se
 * colaría en todos los libros que este sistema genere.
 *
 * Un xlsx es un ZIP de documentos XML. Lo que casi nunca se documenta y aquí importa:
 *
 * - **El orden de los elementos de la hoja es obligatorio.** El esquema es una secuencia, no un
 *   conjunto: `cols` antes de `sheetData`, `autoFilter` después, y el formato condicional después
 *   de aquél. Excel no avisa de que están mal puestos; se niega a abrir el archivo.
 * - **Los rellenos 0 y 1 están reservados.** El índice 0 tiene que ser `none` y el 1 `gray125`,
 *   los use alguien o no. Si se aprovechan para el primer color de verdad, todos los rellenos del
 *   libro salen corridos una posición.
 * - **Las fechas son números** con un formato encima, y su día cero es el 30 de diciembre de 1899.
 * - **El resumen de un grupo puede ir arriba o abajo**, y el valor por omisión es abajo. Cuando la
 *   fila madre va antes que sus hijas —como en cualquier plan— hay que decirlo con
 *   `summaryBelow="0"`, o los controles de agrupar aparecen junto a la fila equivocada.
 * - **Las fórmulas se guardan sin el `=`** y con el XML escapado: un `<` sin escapar rompe la hoja.
 */

import { escribirZip, type ZipEntry } from './zip'

// ── Modelo ───────────────────────────────────────────────────────────────────

export interface Fuente {
  readonly negrita?: boolean
  /** Hex de 6 dígitos, sin `#`. */
  readonly color?: string
  readonly tamano?: number
  readonly nombre?: string
}

export interface Alineacion {
  readonly horizontal?: 'left' | 'center' | 'right'
  readonly vertical?: 'top' | 'center' | 'bottom'
  readonly ajustar?: boolean
  /** Sangría en pasos de Excel. Es lo que dibuja la jerarquía en la columna del nombre. */
  readonly sangria?: number
}

export interface Estilo {
  readonly fuente?: Fuente
  /** Relleno sólido, hex de 6 dígitos sin `#`. */
  readonly relleno?: string
  /** Código de formato de Excel: `0%`, `dd-mmm-yy`, `0.0;[Red]-0.0;0`. */
  readonly formato?: string
  readonly alineacion?: Alineacion
  /** Línea inferior tenue, para separar bloques sin recuadrar todo. */
  readonly bordeInferior?: string
}

export type Celda =
  | { readonly tipo: 'texto'; readonly valor: string; readonly estilo?: number }
  | { readonly tipo: 'numero'; readonly valor: number; readonly estilo?: number }
  | { readonly tipo: 'fecha'; readonly serial: number; readonly estilo?: number }
  | { readonly tipo: 'formula'; readonly formula: string; readonly estilo?: number }
  | { readonly tipo: 'vacia'; readonly estilo?: number }

export interface Fila {
  readonly celdas: readonly Celda[]
  /** Profundidad de agrupación, empezando en 0. */
  readonly nivel?: number
  readonly altura?: number
}

export interface Columna {
  /** Ancho en caracteres, el que Excel enseña en la interfaz. */
  readonly ancho: number
  readonly oculta?: boolean
}

export interface ReglaCondicional {
  /** Rango en A1: `I7:I120`. */
  readonly rango: string
  readonly operador: 'equal' | 'lessThan' | 'greaterThan'
  /** Ya formada para Excel: un texto va entre comillas dobles. */
  readonly valor: string
  readonly estilo: Estilo
}

export interface ValidacionDecimal {
  readonly rango: string
  readonly minimo: number
  readonly maximo: number
  readonly mensaje: string
}

export interface Hoja {
  readonly nombre: string
  readonly columnas: readonly Columna[]
  readonly filas: readonly Fila[]
  /** Congela lo que quede arriba y a la izquierda de esta celda, en base 1. */
  readonly panelFijo?: { readonly fila: number; readonly columna: number }
  readonly autofiltro?: string
  readonly condicionales?: readonly ReglaCondicional[]
  readonly validaciones?: readonly ValidacionDecimal[]
}

export interface NombreDefinido {
  readonly nombre: string
  /** Referencia absoluta con hoja: `Plan!$D$4`. */
  readonly refiereA: string
}

export interface Libro {
  readonly hojas: readonly Hoja[]
  readonly nombresDefinidos?: readonly NombreDefinido[]
}

// ── Utilidades públicas ──────────────────────────────────────────────────────

/** El día cero de Excel es el 30 de diciembre de 1899; el inverso de `excelSerialToDayNumber`. */
const EPOCA_EXCEL = 25_569

export function serialDeExcel(dayNumber: number): number {
  return dayNumber + EPOCA_EXCEL
}

/**
 * El relleno que Excel lleva incorporado en el ancho de columna.
 *
 * El atributo `width` del archivo NO es el número de caracteres que la interfaz enseña: la fórmula
 * del formato es `(caracteres × anchoDeDígito + 5 píxeles) / anchoDeDígito`, y para la fuente por
 * omisión —Calibri 11, dígito de 7 píxeles— eso son 5/7 de carácter de más.
 *
 * Escribir el número pedido en crudo encoge cada columna esa fracción: pedir 6 para la columna de
 * ID daba 5,29 en pantalla, y pedir 92 para el nombre daba 91,29. Sólo se ve abriendo el archivo,
 * que es exactamente donde apareció.
 */
const RELLENO_DE_ANCHO = 5 / 7

/** `1` → `A`, `27` → `AA`. En base 1, como las referencias de Excel. */
export function letraDeColumna(indice: number): string {
  let n = indice
  let letra = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    letra = String.fromCharCode(65 + resto) + letra
    n = Math.floor((n - 1) / 26)
  }
  return letra
}

// ── Registro de estilos ──────────────────────────────────────────────────────

/**
 * Junta los estilos que se piden y los numera sin repetir.
 *
 * Se deduplica por la forma serializada y no por identidad porque quien llama construye el estilo
 * de cada fila al vuelo: sin esto, un plan de mil líneas declararía mil estilos idénticos y Excel
 * tarda de forma perceptible en abrirlo.
 */
export class Estilos {
  private readonly indices = new Map<string, number>()
  private readonly lista: Estilo[] = []

  constructor() {
    // El 0 es el estilo por omisión y tiene que existir aunque nadie lo pida.
    this.registrar({})
  }

  registrar(estilo: Estilo): number {
    const clave = JSON.stringify([
      estilo.fuente?.negrita ?? false,
      estilo.fuente?.color ?? '',
      estilo.fuente?.tamano ?? 0,
      estilo.fuente?.nombre ?? '',
      estilo.relleno ?? '',
      estilo.formato ?? '',
      estilo.alineacion?.horizontal ?? '',
      estilo.alineacion?.vertical ?? '',
      estilo.alineacion?.ajustar ?? false,
      estilo.alineacion?.sangria ?? 0,
      estilo.bordeInferior ?? '',
    ])
    const visto = this.indices.get(clave)
    if (visto !== undefined) return visto
    const indice = this.lista.length
    this.indices.set(clave, indice)
    this.lista.push(estilo)
    return indice
  }

  todos(): readonly Estilo[] {
    return this.lista
  }
}

// ── Serialización ────────────────────────────────────────────────────────────

export function escaparXml(texto: string): string {
  let salida = ''
  for (const caracter of texto) {
    const codigo = caracter.codePointAt(0) ?? 0
    // XML 1.0 no admite estos códigos ni escapados. Se caen en silencio: dejarlos pasar produce
    // un archivo que Excel declara dañado, y el dato que los traía casi nunca los necesitaba.
    if (codigo < 0x20 && caracter !== '\t' && caracter !== '\n') continue
    if (caracter === '&') salida += '&amp;'
    else if (caracter === '<') salida += '&lt;'
    else if (caracter === '>') salida += '&gt;'
    else if (caracter === '"') salida += '&quot;'
    else salida += caracter
  }
  return salida
}

function atributoDeColor(hex: string): string {
  return `FF${hex.replace('#', '').toUpperCase()}`
}

function xmlDeFuente(fuente: Fuente | undefined): string {
  const partes: string[] = []
  if (fuente?.negrita) partes.push('<b/>')
  partes.push(`<sz val="${fuente?.tamano ?? 11}"/>`)
  if (fuente?.color) partes.push(`<color rgb="${atributoDeColor(fuente.color)}"/>`)
  partes.push(`<name val="${escaparXml(fuente?.nombre ?? 'Calibri')}"/>`)
  return `<font>${partes.join('')}</font>`
}

function xmlDeRelleno(hex: string): string {
  return `<fill><patternFill patternType="solid"><fgColor rgb="${atributoDeColor(hex)}"/><bgColor indexed="64"/></patternFill></fill>`
}

function xmlDeAlineacion(alineacion: Alineacion | undefined): string {
  if (!alineacion) return ''
  const attrs: string[] = []
  if (alineacion.horizontal) attrs.push(`horizontal="${alineacion.horizontal}"`)
  if (alineacion.vertical) attrs.push(`vertical="${alineacion.vertical}"`)
  if (alineacion.ajustar) attrs.push('wrapText="1"')
  if (alineacion.sangria) attrs.push(`indent="${alineacion.sangria}"`)
  return attrs.length > 0 ? `<alignment ${attrs.join(' ')}/>` : ''
}

function hojaDeEstilos(estilos: readonly Estilo[], condicionales: readonly ReglaCondicional[]): string {
  // Formatos numéricos. Los personalizados empiezan en 164 por convención del formato.
  const formatos = new Map<string, number>()
  for (const estilo of estilos) {
    if (estilo.formato && !formatos.has(estilo.formato)) formatos.set(estilo.formato, 164 + formatos.size)
  }

  const fuentes: string[] = []
  const clavesDeFuente = new Map<string, number>()
  const indiceDeFuente = (fuente: Fuente | undefined): number => {
    const xml = xmlDeFuente(fuente)
    const visto = clavesDeFuente.get(xml)
    if (visto !== undefined) return visto
    const indice = fuentes.length
    fuentes.push(xml)
    clavesDeFuente.set(xml, indice)
    return indice
  }

  // Los dos primeros rellenos están reservados por el formato, se usen o no.
  const rellenos: string[] = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
  ]
  const clavesDeRelleno = new Map<string, number>()
  const indiceDeRelleno = (hex: string | undefined): number => {
    if (!hex) return 0
    const visto = clavesDeRelleno.get(hex)
    if (visto !== undefined) return visto
    const indice = rellenos.length
    rellenos.push(xmlDeRelleno(hex))
    clavesDeRelleno.set(hex, indice)
    return indice
  }

  const bordes: string[] = ['<border><left/><right/><top/><bottom/><diagonal/></border>']
  const clavesDeBorde = new Map<string, number>()
  const indiceDeBorde = (hex: string | undefined): number => {
    if (!hex) return 0
    const visto = clavesDeBorde.get(hex)
    if (visto !== undefined) return visto
    const indice = bordes.length
    bordes.push(
      `<border><left/><right/><top/><bottom style="thin"><color rgb="${atributoDeColor(hex)}"/></bottom><diagonal/></border>`,
    )
    clavesDeBorde.set(hex, indice)
    return indice
  }

  const xfs = estilos.map((estilo) => {
    const numFmtId = estilo.formato ? formatos.get(estilo.formato)! : 0
    const fontId = indiceDeFuente(estilo.fuente)
    const fillId = indiceDeRelleno(estilo.relleno)
    const borderId = indiceDeBorde(estilo.bordeInferior)
    const alineacion = xmlDeAlineacion(estilo.alineacion)
    const attrs = [
      `numFmtId="${numFmtId}"`,
      `fontId="${fontId}"`,
      `fillId="${fillId}"`,
      `borderId="${borderId}"`,
      'xfId="0"',
      numFmtId !== 0 ? 'applyNumberFormat="1"' : '',
      fontId !== 0 ? 'applyFont="1"' : '',
      fillId !== 0 ? 'applyFill="1"' : '',
      borderId !== 0 ? 'applyBorder="1"' : '',
      alineacion ? 'applyAlignment="1"' : '',
    ].filter(Boolean)
    return alineacion ? `<xf ${attrs.join(' ')}>${alineacion}</xf>` : `<xf ${attrs.join(' ')}/>`
  })

  // Los `dxf` son los estilos del formato condicional. Van en su propia lista, y sólo admiten la
  // parte que cambia: por eso aquí no se declara fuente completa ni borde.
  const dxfs = condicionales.map((regla) => {
    const partes: string[] = []
    if (regla.estilo.fuente?.color) {
      partes.push(`<font><color rgb="${atributoDeColor(regla.estilo.fuente.color)}"/></font>`)
    }
    if (regla.estilo.relleno) {
      partes.push(
        `<fill><patternFill><bgColor rgb="${atributoDeColor(regla.estilo.relleno)}"/></patternFill></fill>`,
      )
    }
    return `<dxf>${partes.join('')}</dxf>`
  })

  const numFmts = Array.from(formatos.entries())
    .map(([codigo, id]) => `<numFmt numFmtId="${id}" formatCode="${escaparXml(codigo)}"/>`)
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${
    numFmts ? `<numFmts count="${formatos.size}">${numFmts}</numFmts>` : ''
  }<fonts count="${fuentes.length}">${fuentes.join('')}</fonts><fills count="${rellenos.length}">${rellenos.join(
    '',
  )}</fills><borders count="${bordes.length}">${bordes.join(
    '',
  )}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${
    xfs.length
  }">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>${
    dxfs.length > 0 ? `<dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs>` : '<dxfs count="0"/>'
  }</styleSheet>`
}

function xmlDeCelda(celda: Celda, referencia: string): string {
  const estilo = celda.estilo ? ` s="${celda.estilo}"` : ''
  switch (celda.tipo) {
    case 'texto':
      if (celda.valor === '') return `<c r="${referencia}"${estilo}/>`
      // Cadena en línea: no hace falta la tabla compartida, y el lector de `lib/scheduling`
      // entiende las dos formas.
      return `<c r="${referencia}"${estilo} t="inlineStr"><is><t xml:space="preserve">${escaparXml(
        celda.valor,
      )}</t></is></c>`
    case 'numero':
      return `<c r="${referencia}"${estilo}><v>${celda.valor}</v></c>`
    case 'fecha':
      return `<c r="${referencia}"${estilo}><v>${celda.serial}</v></c>`
    case 'formula':
      // Sin el `=` inicial: en el archivo la fórmula es el contenido de `<f>`, no su forma escrita.
      return `<c r="${referencia}"${estilo}><f>${escaparXml(celda.formula.replace(/^=/, ''))}</f></c>`
    case 'vacia':
      return `<c r="${referencia}"${estilo}/>`
  }
}

function xmlDeHoja(hoja: Hoja): string {
  const nivelMaximo = hoja.filas.reduce((max, fila) => Math.max(max, fila.nivel ?? 0), 0)

  const cols = hoja.columnas
    .map((columna, i) => {
      const n = i + 1
      const oculta = columna.oculta ? ' hidden="1"' : ''
      const ancho = Math.round((columna.ancho + RELLENO_DE_ANCHO) * 256) / 256
      return `<col min="${n}" max="${n}" width="${ancho}" customWidth="1"${oculta}/>`
    })
    .join('')

  const filas = hoja.filas
    .map((fila, i) => {
      const numero = i + 1
      const celdas = fila.celdas
        .map((celda, j) => xmlDeCelda(celda, `${letraDeColumna(j + 1)}${numero}`))
        .join('')
      const nivel = fila.nivel ? ` outlineLevel="${fila.nivel}"` : ''
      const altura = fila.altura ? ` ht="${fila.altura}" customHeight="1"` : ''
      return `<row r="${numero}"${nivel}${altura}>${celdas}</row>`
    })
    .join('')

  let vistas: string
  if (hoja.panelFijo) {
    const { fila, columna } = hoja.panelFijo
    const esquina = `${letraDeColumna(columna + 1)}${fila + 1}`
    vistas = `<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane xSplit="${columna}" ySplit="${fila}" topLeftCell="${esquina}" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="${esquina}" sqref="${esquina}"/></sheetView></sheetViews>`
  } else {
    vistas = '<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>'
  }

  const condicionales = (hoja.condicionales ?? [])
    .map(
      (regla, i) =>
        `<conditionalFormatting sqref="${regla.rango}"><cfRule type="cellIs" dxfId="${i}" priority="${
          i + 1
        }" operator="${regla.operador}"><formula>${escaparXml(regla.valor)}</formula></cfRule></conditionalFormatting>`,
    )
    .join('')

  const validaciones = hoja.validaciones ?? []
  const xmlValidaciones =
    validaciones.length > 0
      ? `<dataValidations count="${validaciones.length}">${validaciones
          .map(
            (v) =>
              `<dataValidation type="decimal" operator="between" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Valor fuera de rango" error="${escaparXml(
                v.mensaje,
              )}" sqref="${v.rango}"><formula1>${v.minimo}</formula1><formula2>${v.maximo}</formula2></dataValidation>`,
          )
          .join('')}</dataValidations>`
      : ''

  // El orden de aquí abajo lo fija el esquema: cols, sheetData, autoFilter, condicionales,
  // validaciones. Cambiarlo produce un archivo que Excel no abre.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><outlinePr summaryBelow="0" summaryRight="0"/></sheetPr>${vistas}<sheetFormatPr defaultRowHeight="15"${
    nivelMaximo > 0 ? ` outlineLevelRow="${Math.min(nivelMaximo, 7)}"` : ''
  }/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${filas}</sheetData>${
    hoja.autofiltro ? `<autoFilter ref="${hoja.autofiltro}"/>` : ''
  }${condicionales}${xmlValidaciones}</worksheet>`
}

/**
 * Arma el archivo completo. El resultado es determinista: mismo libro, mismos bytes.
 *
 * `fullCalcOnLoad` es lo que hace que las fórmulas tengan valor al abrir. Aquí se escriben
 * fórmulas sin resultado en caché —a propósito, para que la hoja sea la que calcula y no un
 * volcado de números—, y sin esa marca Excel enseñaría celdas vacías hasta que alguien las tocara.
 */
export function escribirLibro(libro: Libro, estilos: Estilos): Buffer {
  const hojas = libro.hojas
  const condicionales = hojas.flatMap((hoja) => hoja.condicionales ?? [])

  const nombresDefinidos = (libro.nombresDefinidos ?? [])
    .map((n) => `<definedName name="${escaparXml(n.nombre)}">${escaparXml(n.refiereA)}</definedName>`)
    .join('')

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas
    .map((hoja, i) => `<sheet name="${escaparXml(hoja.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')}</sheets>${
    nombresDefinidos ? `<definedNames>${nombresDefinidos}</definedNames>` : ''
  }<calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${
          i + 1
        }.xml"/>`,
    )
    .join('')}<Relationship Id="rId${
    hojas.length + 1
  }" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${hojas
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${
          i + 1
        }.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join(
      '',
    )}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`

  const raiz = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

  const entradas: ZipEntry[] = [
    { path: '[Content_Types].xml', content: Buffer.from(contentTypes, 'utf8') },
    { path: '_rels/.rels', content: Buffer.from(raiz, 'utf8') },
    { path: 'xl/workbook.xml', content: Buffer.from(workbook, 'utf8') },
    { path: 'xl/_rels/workbook.xml.rels', content: Buffer.from(rels, 'utf8') },
    { path: 'xl/styles.xml', content: Buffer.from(hojaDeEstilos(estilos.todos(), condicionales), 'utf8') },
    ...hojas.map((hoja, i) => ({
      path: `xl/worksheets/sheet${i + 1}.xml`,
      content: Buffer.from(xmlDeHoja(hoja), 'utf8'),
    })),
  ]

  return escribirZip(entradas)
}

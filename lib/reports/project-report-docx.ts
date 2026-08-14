/**
 * Reporte ejecutivo de proyecto en Word (.docx).
 *
 * Replica la retícula editorial de "Reporte profesional para directivos.pdf"
 * (templateProject): serif de transición, versalitas espaciadas en teal para los
 * rótulos de sección, cifras grandes con acento magenta, filetes finos y mucho
 * aire. Está pensado para PM y C-level: el argumento primero, el detalle después.
 *
 * Las gráficas se dibujan con tablas sombreadas de Word en vez de imágenes: no
 * requieren binarios nativos (importa en Lambda), quedan nítidas a cualquier
 * zoom y el destinatario puede editarlas.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeightRule,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import { BRAND, STATUS_ORDER, STATUS_STYLE } from './brand'
import { SOFTWAREONE_LOGO_PNG } from './assets/logo'

export type ReportDepth = 'EXECUTIVE' | 'DETAILED' | 'COMPLETE'

const DEPTH: Record<ReportDepth, { phases: number; overdue: number }> = {
  EXECUTIVE: { phases: 6, overdue: 6 },
  DETAILED: { phases: 12, overdue: 10 },
  COMPLETE: { phases: 30, overdue: 40 },
}

export interface ReportWorkItem {
  title: string
  status: string
  priority: string
  phase?: string | null
  startDate: Date
  estimatedEndDate: Date
  completedAt?: Date | null
  ownerName?: string
  /** Posición en el plan; ordena las fases igual que en el tablero. */
  templateOrder?: number | null
}

/** Narrativa estructurada que produce el modelo para este documento. */
export interface ExecutiveBrief {
  verdict?: string
  deck?: string
  lead?: string
  sections?: { eyebrow: string; headline: string; paragraphs: string[] }[]
  asks?: { text: string; owner?: string; due?: string }[]
  note?: string
}

export interface ReportInput {
  project: {
    name: string
    client: string
    status: string
    startDate: Date
    estimatedEndDate: Date
  }
  workItems: ReportWorkItem[]
  blockers: { description: string; severity: string; resolvedAt?: Date | null }[]
  risks: { description: string; riskLevel: string; status: string }[]
  brief?: ExecutiveBrief
  detailLevel?: ReportDepth
  logo?: Buffer
  generatedAt?: Date
}

// ── Primitivas ──────────────────────────────────────────────────────────────

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const
const NO_BORDERS = {
  top: NONE,
  bottom: NONE,
  left: NONE,
  right: NONE,
  insideHorizontal: NONE,
  insideVertical: NONE,
}
const hair = (color: string = BRAND.rule, size = 4) => ({
  style: BorderStyle.SINGLE,
  size,
  color,
})

/** pt → medios-puntos, que es lo que espera OOXML. */
const pt = (n: number) => Math.round(n * 2)

/**
 * Ancho útil de la caja de texto en twips (carta menos los márgenes laterales).
 * `columnWidths` de docx se expresa en DXA, no en porcentaje: pasarle 70 y 30
 * produce columnas de 70 y 30 twips, y el texto se parte en cada palabra.
 */
const CONTENT_DXA = 9840
const cols = (...pcts: number[]) => pcts.map((x) => Math.round((CONTENT_DXA * x) / 100))

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmtDate = (d: Date) => {
  const x = new Date(d)
  return `${String(x.getDate()).padStart(2, '0')} ${MONTHS[x.getMonth()]}`
}
const fmtLong = (d: Date) => {
  const x = new Date(d)
  return `${String(x.getDate()).padStart(2, '0')} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`
}
/** Decimales con coma, como en el documento de referencia. */
const num = (n: number, dec = 0) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec })

interface RunOpts {
  size?: number
  bold?: boolean
  italics?: boolean
  color?: string
  font?: string
  smallCaps?: boolean
  spacing?: number
}

const run = (text: string, o: RunOpts = {}) =>
  new TextRun({
    text,
    size: pt(o.size ?? 10.9),
    bold: o.bold,
    italics: o.italics,
    color: o.color ?? BRAND.ink,
    font: o.font ?? BRAND.serif,
    smallCaps: o.smallCaps,
    characterSpacing: o.spacing,
  })

const para = (
  children: TextRun[],
  o: {
    after?: number
    before?: number
    align?: (typeof AlignmentType)[keyof typeof AlignmentType]
    line?: number
  } = {}
) =>
  new Paragraph({
    alignment: o.align,
    spacing: { after: o.after ?? 140, before: o.before, line: o.line ?? 300 },
    children,
  })

/** Rótulo de sección: «01 · RESUMEN EJECUTIVO» en versalitas espaciadas. */
const eyebrow = (label: string, n?: number) =>
  para(
    [
      run(n !== undefined ? `${String(n).padStart(2, '0')} · ${label}` : label, {
        size: 8.2,
        color: BRAND.teal,
        smallCaps: true,
        bold: true,
        spacing: 24,
      }),
    ],
    { before: 420, after: 60 }
  )

const headline = (t: string, size = 20) =>
  para([run(t, { size, color: BRAND.ink })], { after: 180, line: 264 })

const body = (t: string) =>
  para([run(t, { size: 10.9, color: BRAND.ink })], { after: 150, line: 320 })

const caption = (t: string) =>
  para([run(t, { size: 8.6, color: BRAND.grayLight })], { before: 100, after: 220 })

/** Filete horizontal a todo el ancho. */
const rule = (color: string = BRAND.black, size = 12) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: [CONTENT_DXA],
    borders: { ...NO_BORDERS, bottom: hair(color, size) },
    rows: [
      new TableRow({
        height: { value: 1, rule: HeightRule.EXACT },
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { ...NO_BORDERS, bottom: hair(color, size) },
            children: [new Paragraph({ spacing: { after: 0, line: 1 }, children: [] })],
          }),
        ],
      }),
    ],
  })

/** Barra de progreso fina: relleno + canal. */
function meter(pct: number, color: string, height = 90) {
  const p = Math.max(0, Math.min(100, pct))
  const cells: TableCell[] = []
  const widths: number[] = []
  const cell = (w: number, fill: string) =>
    new TableCell({
      width: { size: Math.max(0.4, w), type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
      borders: NO_BORDERS,
      children: [new Paragraph({ spacing: { after: 0, line: 1 }, children: [] })],
    })
  if (p > 0.4) {
    cells.push(cell(p, color))
    widths.push(Math.max(20, Math.round((CONTENT_DXA * p) / 100)))
  }
  if (p < 99.6) {
    cells.push(cell(100 - p, BRAND.track))
    widths.push(Math.max(20, Math.round((CONTENT_DXA * (100 - p)) / 100)))
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    columnWidths: widths,
    rows: [new TableRow({ height: { value: height, rule: HeightRule.EXACT }, children: cells })],
  })
}

/**
 * Gráfico de columnas. Cada barra es una tabla anidada de altura exacta dentro
 * de una celda alineada al fondo, así la columna crece hacia arriba desde la
 * línea base como en un gráfico de barras normal.
 */
function columnChart(
  data: { label: string; value: number; pct: number; color: string }[],
  height = 1500
) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    columnWidths: cols(...data.map(() => 100 / data.length)),
    rows: [
      new TableRow({
        height: { value: height, rule: HeightRule.EXACT },
        children: data.map(
          (d) =>
            new TableCell({
              borders: { ...NO_BORDERS, bottom: hair(BRAND.ink, 6) },
              verticalAlign: VerticalAlign.BOTTOM,
              margins: { left: 120, right: 120 },
              children: [
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: NO_BORDERS,
                  rows: [
                    new TableRow({
                      height: {
                        value: Math.max(14, Math.round((height - 60) * (d.value / max))),
                        rule: HeightRule.EXACT,
                      },
                      children: [
                        new TableCell({
                          width: { size: 100, type: WidthType.PERCENTAGE },
                          shading: { type: ShadingType.CLEAR, fill: d.color, color: 'auto' },
                          borders: NO_BORDERS,
                          children: [
                            new Paragraph({ spacing: { after: 0, line: 1 }, children: [] }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            })
        ),
      }),
      new TableRow({
        children: data.map(
          (d) =>
            new TableCell({
              borders: NO_BORDERS,
              margins: { top: 100 },
              children: [
                para(
                  [
                    run(num(d.value), {
                      size: 13,
                      bold: true,
                      // Los neutros claros no se leen como texto: la cifra va en
                      // negro y el color queda solo en la columna.
                      color: /^[D-F]/i.test(d.color) ? BRAND.ink : d.color,
                    }),
                  ],
                  { after: 20, align: AlignmentType.CENTER }
                ),
                para([run(d.label, { size: 9.4 })], { after: 10, align: AlignmentType.CENTER }),
                para([run(`${num(d.pct, 1)}%`, { size: 8.6, color: BRAND.grayLight })], {
                  after: 0,
                  align: AlignmentType.CENTER,
                }),
              ],
            })
        ),
      }),
    ],
  })
}

/** Fila «etiqueta … valor» sobre una barra, como la Figura 1 del referente. */
function meterRow(label: string, value: string, pctVal: number, color: string) {
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      columnWidths: cols(72, 28),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: NO_BORDERS,
              margins: { bottom: 40 },
              children: [para([run(label, { size: 10.4 })], { after: 0 })],
            }),
            new TableCell({
              borders: NO_BORDERS,
              margins: { bottom: 40 },
              children: [
                para([run(value, { size: 10.4, bold: true })], {
                  after: 0,
                  align: AlignmentType.RIGHT,
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    meter(pctVal, color, 100),
    new Paragraph({ spacing: { after: 160 }, children: [] }),
  ]
}

// ── Documento ───────────────────────────────────────────────────────────────

export async function buildProjectReportDocx(input: ReportInput): Promise<Buffer> {
  const { project, workItems, blockers, risks } = input
  const now = input.generatedAt ?? new Date()
  const depth = DEPTH[input.detailLevel ?? 'DETAILED']
  const logo = input.logo ?? SOFTWAREONE_LOGO_PNG
  const brief = input.brief ?? {}

  // ── Métricas ──────────────────────────────────────────────────────────────
  const total = workItems.length
  const isOpen = (w: ReportWorkItem) => w.status !== 'DONE' && !w.completedAt
  const done = workItems.filter((w) => w.status === 'DONE' || w.completedAt).length
  const overdue = workItems
    .filter((w) => isOpen(w) && new Date(w.estimatedEndDate) < now)
    .sort((a, b) => +new Date(a.estimatedEndDate) - +new Date(b.estimatedEndDate))
  const openBlockers = blockers.filter((b) => !b.resolvedAt)
  const openRisks = risks.filter((r) => r.status !== 'CLOSED')

  const scopePct = total ? (done / total) * 100 : 0
  const start = new Date(project.startDate)
  const end = new Date(project.estimatedEndDate)
  const totalDays = Math.max(1, Math.round((+end - +start) / 86400000))
  const elapsed = Math.max(0, Math.min(totalDays, Math.round((+now - +start) / 86400000)))
  const remaining = Math.max(0, Math.round((+end - +now) / 86400000))
  const timePct = (elapsed / totalDays) * 100
  const spi = timePct > 0 ? scopePct / timePct : 1
  const gapPP = Math.round(timePct - scopePct)
  const worstOverdue = overdue.length
    ? Math.floor((+now - +new Date(overdue[0].estimatedEndDate)) / 86400000)
    : 0

  const verdict =
    brief.verdict ??
    (openBlockers.length || spi < 0.8 ? 'En riesgo' : spi < 0.95 ? 'Atención' : 'En curso')
  const verdictColor = verdict === 'En curso' ? BRAND.teal : BRAND.crimson

  const byStatus = STATUS_ORDER.map((s) => ({
    ...STATUS_STYLE[s],
    n: workItems.filter((w) => w.status === s).length,
  })).filter((s) => s.n > 0)

  const phases = Array.from(
    workItems.reduce((m, w) => {
      const k = w.phase?.trim() || 'Sin fase'
      const c = m.get(k) ?? { total: 0, done: 0, seq: Number.MAX_SAFE_INTEGER }
      c.total++
      if (w.status === 'DONE' || w.completedAt) c.done++
      c.seq = Math.min(c.seq, w.templateOrder ?? Number.MAX_SAFE_INTEGER)
      m.set(k, c)
      return m
    }, new Map<string, { total: number; done: number; seq: number }>())
  )
    .map(([name, v]) => ({ name, ...v, pct: (v.done / v.total) * 100 }))
    // En el orden del plan: el `templateOrder` más bajo de sus tareas. Ordenar
    // por avance dejaba el desempate al azar cuando todas están en 0%.
    .sort((a, b) => a.seq - b.seq || a.name.localeCompare(b.name, 'es', { numeric: true }))
    .slice(0, depth.phases)

  const children: (Paragraph | Table)[] = []

  // ── Masthead ──────────────────────────────────────────────────────────────
  children.push(
    rule(BRAND.black, 18),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { ...NO_BORDERS, bottom: hair(BRAND.black, 4) },
      columnWidths: cols(40, 60),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: { ...NO_BORDERS, bottom: hair(BRAND.black, 4) },
              margins: { top: 120, bottom: 120 },
              children: [
                new Paragraph({
                  spacing: { after: 0, line: 240 },
                  children: [
                    new ImageRun({
                      data: logo,
                      transformation: { width: 104, height: 37 },
                      type: 'png',
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              borders: { ...NO_BORDERS, bottom: hair(BRAND.black, 4) },
              margins: { top: 120, bottom: 120 },
              children: [
                para(
                  [
                    run('Reporte ejecutivo de proyecto', {
                      size: 8.6,
                      smallCaps: true,
                      spacing: 22,
                      color: BRAND.gray,
                    }),
                  ],
                  { after: 20, align: AlignmentType.RIGHT }
                ),
                para(
                  [
                    run(`Corte al ${fmtLong(now)}`, {
                      size: 8.6,
                      smallCaps: true,
                      spacing: 22,
                      color: BRAND.gray,
                    }),
                  ],
                  { after: 0, align: AlignmentType.RIGHT }
                ),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 420 }, children: [] })
  )

  // ── Titular ───────────────────────────────────────────────────────────────
  children.push(
    para([run(project.name, { size: 27 })], { after: 0, line: 250 }),
    para([run(`— ${project.client}`, { size: 27 })], { after: 260, line: 250 }),
    para(
      [
        run(brief.deck ?? `Ventana ${fmtDate(start)} → ${fmtLong(end)}`, {
          size: 13,
          italics: true,
          color: BRAND.teal,
        }),
      ],
      { after: 340, line: 276 }
    )
  )

  // ── Veredicto + entrada ───────────────────────────────────────────────────
  const lead =
    brief.lead ??
    `El proyecto ha consumido ${num(timePct)}% de su calendario y entregado ${num(scopePct)}% de su alcance. ` +
      `Quedan ${remaining} días para la fecha comprometida.`
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      columnWidths: cols(30, 70),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: NO_BORDERS,
              width: { size: 30, type: WidthType.PERCENTAGE },
              margins: { right: 200 },
              children: [
                para([run(verdict, { size: 13, bold: true, color: verdictColor })], { after: 0 }),
              ],
            }),
            new TableCell({
              borders: NO_BORDERS,
              children: [para([run(lead, { size: 11.2 })], { after: 0, line: 330 })],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 400 }, children: [] })
  )

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = [
    {
      value: `${num(scopePct)}%`,
      label: 'Completitud',
      note: `${done} de ${total} tareas cerradas`,
      accent: BRAND.ink as string,
    },
    {
      value: `${num(timePct)}%`,
      label: 'Calendario',
      note: `${elapsed} de ${totalDays} días consumidos`,
      accent: BRAND.ink as string,
    },
    {
      value: String(overdue.length),
      label: 'Vencidas',
      note: overdue.length ? `hasta ${worstOverdue} días de atraso` : 'sin atrasos',
      accent: (overdue.length ? BRAND.crimson : BRAND.ink) as string,
    },
    {
      value: num(spi, 2),
      label: 'Índice de avance',
      note: `meta ≥ 0,95 · ${remaining} días restantes`,
      accent: (spi < 0.95 ? BRAND.crimson : BRAND.ink) as string,
    },
  ]
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      columnWidths: cols(25, 25, 25, 25),
      rows: [
        new TableRow({
          children: kpis.map(
            (k) =>
              new TableCell({
                width: { size: 25, type: WidthType.PERCENTAGE },
                borders: NO_BORDERS,
                margins: { right: 200 },
                children: [
                  para([run(k.value, { size: 23, color: k.accent })], { after: 40, line: 250 }),
                  para(
                    [
                      run(k.label, {
                        size: 8.2,
                        smallCaps: true,
                        bold: true,
                        spacing: 22,
                        color: BRAND.teal,
                      }),
                    ],
                    { after: 40 }
                  ),
                  para([run(k.note, { size: 9.4, color: BRAND.gray })], { after: 0, line: 250 }),
                ],
              })
          ),
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 300 }, children: [] })
  )

  // ── Secciones narrativas ──────────────────────────────────────────────────
  let n = 1
  const briefSections = brief.sections ?? []
  const firstSections = briefSections.slice(0, 1)
  const restSections = briefSections.slice(1)

  for (const s of firstSections) {
    children.push(eyebrow(s.eyebrow, n++), headline(s.headline))
    s.paragraphs.forEach((p) => children.push(body(p)))
  }

  // ── La brecha ─────────────────────────────────────────────────────────────
  children.push(eyebrow('La brecha', n++), headline('Avance contra calendario'))
  children.push(...meterRow('Alcance ejecutado', `${num(scopePct)}%`, scopePct, BRAND.crimson))
  children.push(...meterRow('Calendario consumido', `${num(timePct)}%`, timePct, BRAND.ink))
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      columnWidths: cols(64, 36),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 64, type: WidthType.PERCENTAGE },
              borders: NO_BORDERS,
              margins: { right: 260 },
              children: [
                para(
                  [
                    run(
                      `Cada punto porcentual de brecha equivale a unos ${num(total / 100, 1)} work items no ejecutados: ` +
                        `la brecha acumulada representa cerca de ${Math.round((gapPP * total) / 100)} tareas de retraso frente al plan.`,
                      { size: 10.4 }
                    ),
                  ],
                  { after: 0, line: 320 }
                ),
              ],
            }),
            new TableCell({
              width: { size: 36, type: WidthType.PERCENTAGE },
              borders: NO_BORDERS,
              children: [
                para([run(`${gapPP} pp`, { size: 23, color: BRAND.crimson })], {
                  after: 20,
                  align: AlignmentType.RIGHT,
                  line: 250,
                }),
                para(
                  [run('de brecha', { size: 8.2, smallCaps: true, spacing: 22, color: BRAND.gray })],
                  { after: 0, align: AlignmentType.RIGHT }
                ),
              ],
            }),
          ],
        }),
      ],
    }),
    caption(`Figura 1 · Avance de alcance contra consumo de calendario al ${fmtLong(now)}.`)
  )

  // ── Portafolio por estado ─────────────────────────────────────────────────
  children.push(eyebrow('El portafolio', n++), headline(`${num(total)} work items por estado`))
  children.push(
    columnChart(
      byStatus.map((st) => ({
        label: st.label,
        value: st.n,
        pct: (st.n / total) * 100,
        color: st.color,
      }))
    ),
    caption('Figura 2 · Distribución de los work items del portafolio.')

  )

  // ── Atrasos ───────────────────────────────────────────────────────────────
  if (overdue.length) {
    const shown = overdue.slice(0, depth.overdue)
    const maxLate = Math.max(
      1,
      ...shown.map((w) => Math.floor((+now - +new Date(w.estimatedEndDate)) / 86400000))
    )
    children.push(
      eyebrow('Atrasos', n++),
      headline(overdue.length === 1 ? 'Una tarea vencida' : `${num(overdue.length)} tareas vencidas`)
    )
    const rows: TableRow[] = [
      new TableRow({
        children: ['Tarea', 'Fase', 'Vence', 'Atraso'].map(
          (h, i) =>
            new TableCell({
              borders: { ...NO_BORDERS, bottom: hair(BRAND.ink, 8) },
              margins: { bottom: 90, right: 140 },
              children: [
                para([run(h, { size: 8.2, smallCaps: true, spacing: 22, color: BRAND.gray })], {
                  after: 0,
                  align: i >= 2 ? AlignmentType.RIGHT : AlignmentType.LEFT,
                }),
              ],
            })
        ),
      }),
    ]
    shown.forEach((w) => {
      const late = Math.floor((+now - +new Date(w.estimatedEndDate)) / 86400000)
      const strong = late >= Math.max(14, maxLate * 0.4)
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 42, type: WidthType.PERCENTAGE },
              borders: { ...NO_BORDERS, bottom: hair() },
              margins: { top: 100, bottom: 100, right: 140 },
              children: [para([run(w.title, { size: 10.4 })], { after: 0, line: 270 })],
            }),
            new TableCell({
              width: { size: 26, type: WidthType.PERCENTAGE },
              borders: { ...NO_BORDERS, bottom: hair() },
              margins: { top: 100, bottom: 100, right: 140 },
              children: [
                para([run(w.phase ?? '—', { size: 10, color: BRAND.gray })], { after: 0, line: 270 }),
              ],
            }),
            new TableCell({
              width: { size: 14, type: WidthType.PERCENTAGE },
              borders: { ...NO_BORDERS, bottom: hair() },
              margins: { top: 100, bottom: 100, right: 140 },
              children: [
                para([run(fmtDate(w.estimatedEndDate), { size: 10, color: BRAND.gray })], {
                  after: 0,
                  align: AlignmentType.RIGHT,
                }),
              ],
            }),
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              borders: { ...NO_BORDERS, bottom: hair() },
              margins: { top: 100, bottom: 100 },
              children: [
                // Barra y cifra en la misma línea, como la Tabla 1 del referente.
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: NO_BORDERS,
                  columnWidths: cols(13, 5),
                  rows: [
                    new TableRow({
                      children: [
                        new TableCell({
                          borders: NO_BORDERS,
                          margins: { top: 40, right: 100 },
                          children: [
                            meter((late / maxLate) * 100, strong ? BRAND.crimson : BRAND.ink, 70),
                          ],
                        }),
                        new TableCell({
                          borders: NO_BORDERS,
                          children: [
                            para(
                              [
                                run(String(late), {
                                  size: 10,
                                  bold: strong,
                                  color: strong ? BRAND.crimson : BRAND.ink,
                                }),
                              ],
                              { after: 0, align: AlignmentType.RIGHT }
                            ),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        })
      )
    })
    children.push(
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows })
    )
    children.push(
      caption(
        `Tabla 1 · Días de atraso al ${fmtLong(now)}.` +
          (overdue.length > depth.overdue
            ? ` Se listan las ${depth.overdue} más antiguas de ${overdue.length}.`
            : '')
      )
    )
  }

  // ── Frentes de trabajo ────────────────────────────────────────────────────
  if (phases.length) {
    children.push(eyebrow('Frentes de trabajo', n++), headline('Preparación por frente'))
    const rows = phases.map(
      (ph) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 42, type: WidthType.PERCENTAGE },
              borders: NO_BORDERS,
              margins: { top: 70, bottom: 70, right: 160 },
              children: [para([run(ph.name, { size: 10 })], { after: 0, line: 260 })],
            }),
            new TableCell({
              width: { size: 40, type: WidthType.PERCENTAGE },
              borders: NO_BORDERS,
              margins: { top: 130, bottom: 70, right: 160 },
              children: [meter(ph.pct, ph.pct === 0 ? BRAND.track : BRAND.teal, 70)],
            }),
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              borders: NO_BORDERS,
              margins: { top: 70, bottom: 70 },
              children: [
                para([run(`${ph.done}/${ph.total}`, { size: 9.4, color: BRAND.grayLight })], {
                  after: 0,
                  align: AlignmentType.RIGHT,
                }),
              ],
            }),
          ],
        })
    )
    children.push(
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows })
    )
    children.push(caption('Figura 3 · Preparación por frente de trabajo.'))
  }

  // ── Riesgos y gobernanza ──────────────────────────────────────────────────
  children.push(
    eyebrow('Riesgos y gobernanza', n++),
    headline(
      openBlockers.length || openRisks.length
        ? `${openBlockers.length} bloqueos y ${openRisks.length} riesgos abiertos`
        : 'Cero riesgos y cero bloqueos registrados'
    )
  )
  if (openBlockers.length || openRisks.length) {
    const rows: TableRow[] = [
      new TableRow({
        children: ['Tipo', 'Descripción', 'Nivel'].map(
          (h) =>
            new TableCell({
              borders: { ...NO_BORDERS, bottom: hair(BRAND.ink, 8) },
              margins: { bottom: 90, right: 140 },
              children: [
                para([run(h, { size: 8.2, smallCaps: true, spacing: 22, color: BRAND.gray })], {
                  after: 0,
                }),
              ],
            })
        ),
      }),
    ]
    const add = (tipo: string, desc: string, nivel: string) =>
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              borders: { ...NO_BORDERS, bottom: hair() },
              margins: { top: 100, bottom: 100, right: 140 },
              children: [para([run(tipo, { size: 10 })], { after: 0, line: 270 })],
            }),
            new TableCell({
              width: { size: 62, type: WidthType.PERCENTAGE },
              borders: { ...NO_BORDERS, bottom: hair() },
              margins: { top: 100, bottom: 100, right: 140 },
              children: [para([run(desc, { size: 10, color: BRAND.gray })], { after: 0, line: 270 })],
            }),
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              borders: { ...NO_BORDERS, bottom: hair() },
              margins: { top: 100, bottom: 100 },
              children: [
                para(
                  [
                    run(nivel, {
                      size: 10,
                      color: /alta|high|critical|crítica/i.test(nivel) ? BRAND.crimson : BRAND.gray,
                    }),
                  ],
                  { after: 0 }
                ),
              ],
            }),
          ],
        })
      )
    openBlockers.slice(0, 10).forEach((b) => add('Bloqueo', b.description, b.severity))
    openRisks.slice(0, 10).forEach((r) => add('Riesgo', r.description, r.riskLevel))
    children.push(
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows })
    )
  } else {
    children.push(
      body(
        'No hay riesgos ni bloqueos registrados en el tablero. En un programa de esta escala, ' +
          'la ausencia de registro es en sí misma un hallazgo de gobernanza que conviene atender.'
      )
    )
  }

  // ── Resto de la narrativa ─────────────────────────────────────────────────
  for (const s of restSections) {
    children.push(eyebrow(s.eyebrow, n++), headline(s.headline))
    s.paragraphs.forEach((p) => children.push(body(p)))
  }

  // ── Decisiones solicitadas ────────────────────────────────────────────────
  if (brief.asks?.length) {
    children.push(eyebrow('Decisiones solicitadas', n++), headline('Lo que pedimos al comité'))
    const rows = brief.asks.map(
      (a, i) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 8, type: WidthType.PERCENTAGE },
              borders: { ...NO_BORDERS, bottom: hair() },
              margins: { top: 140, bottom: 140 },
              children: [
                para([run(String(i + 1), { size: 15, bold: true, color: BRAND.teal })], { after: 0 }),
              ],
            }),
            new TableCell({
              width: { size: 62, type: WidthType.PERCENTAGE },
              borders: { ...NO_BORDERS, bottom: hair() },
              margins: { top: 140, bottom: 140, right: 200 },
              children: [para([run(a.text, { size: 10.9 })], { after: 0, line: 300 })],
            }),
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              borders: { ...NO_BORDERS, bottom: hair() },
              margins: { top: 140, bottom: 140 },
              children: [
                para([run(a.owner ?? '—', { size: 9.4, color: BRAND.gray })], {
                  after: 10,
                  align: AlignmentType.RIGHT,
                }),
                para([run(a.due ?? '', { size: 9.4, color: BRAND.gray })], {
                  after: 0,
                  align: AlignmentType.RIGHT,
                }),
              ],
            }),
          ],
        })
    )
    children.push(
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows })
    )
    children.push(rule(BRAND.ink, 12))
  }

  // ── Nota metodológica ─────────────────────────────────────────────────────
  children.push(
    eyebrow('Nota metodológica'),
    para(
      [
        run(
          brief.note ??
            `Cifras del tablero del proyecto con corte al ${fmtLong(now)}. El índice de avance compara alcance ` +
              `ejecutado contra calendario consumido; una lectura por debajo de 0,95 indica que la entrega va detrás del plan.`,
          { size: 9.4, color: BRAND.gray }
        ),
      ],
      { after: 0, line: 280 }
    )
  )

  // ── Ensamble ──────────────────────────────────────────────────────────────
  const doc = new Document({
    creator: 'SoftwareOne',
    title: `Reporte ejecutivo — ${project.name}`,
    styles: {
      default: { document: { run: { font: BRAND.serif, color: BRAND.ink, size: pt(10.9) } } },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1100, bottom: 900, left: 1200, right: 1200 } } },
        footers: {
          default: new Footer({
            children: [
              rule(BRAND.rule, 4),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: NO_BORDERS,
                columnWidths: cols(55, 45),
                rows: [
                  new TableRow({
                    children: [
                      new TableCell({
                        borders: NO_BORDERS,
                        margins: { top: 90 },
                        children: [
                          para(
                            [
                              run(`SoftwareOne · Reporte ejecutivo para ${project.client}`, {
                                size: 8.2,
                                smallCaps: true,
                                spacing: 20,
                                color: BRAND.grayLight,
                              }),
                            ],
                            { after: 0 }
                          ),
                        ],
                      }),
                      new TableCell({
                        borders: NO_BORDERS,
                        margins: { top: 90 },
                        children: [
                          para(
                            [
                              run(`${project.name} · ${fmtLong(now)}`, {
                                size: 8.2,
                                smallCaps: true,
                                spacing: 20,
                                color: BRAND.grayLight,
                              }),
                            ],
                            { after: 0, align: AlignmentType.RIGHT }
                          ),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}

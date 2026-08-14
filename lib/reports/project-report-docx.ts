/**
 * Reporte ejecutivo de proyecto en Word (.docx).
 *
 * Dirigido a PM y C-level: una plana de KPIs y gráficas al frente, el detalle
 * después. Se inspira en Template.dotx (paleta, tipografía y logo) sin heredar
 * su estructura, que está pensada para documentos largos.
 *
 * Las gráficas se dibujan con tablas sombreadas de Word en lugar de imágenes:
 * no requieren binarios nativos (importa en Lambda), quedan nítidas a
 * cualquier zoom y el destinatario puede editarlas.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeightRule,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { BRAND, STATUS_ORDER, STATUS_STYLE } from './brand'
import { SOFTWAREONE_LOGO_PNG } from './assets/logo'

export type ReportDepth = 'EXECUTIVE' | 'DETAILED' | 'COMPLETE'

/** Cuánto detalle acompaña a los KPIs, según el nivel elegido en la app. */
const DEPTH: Record<ReportDepth, { phases: number; overdue: number; showRisks: boolean }> = {
  EXECUTIVE: { phases: 5, overdue: 5, showRisks: true },
  DETAILED: { phases: 8, overdue: 15, showRisks: true },
  COMPLETE: { phases: 20, overdue: 60, showRisks: true },
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
  /** Narrativa que produce el generador de reportes de la app. */
  aiNarrative?: string
  /** Nivel elegido en el diálogo; gobierna cuánto detalle acompaña a los KPIs. */
  detailLevel?: ReportDepth
  logo?: Buffer
  generatedAt?: Date
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } as const
const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
}

const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

function text(
  content: string,
  o: {
    size?: number
    bold?: boolean
    color?: string
    align?: (typeof AlignmentType)[keyof typeof AlignmentType]
    spacing?: { before?: number; after?: number }
    caps?: boolean
  } = {}
) {
  return new Paragraph({
    alignment: o.align,
    spacing: o.spacing ?? { after: 80 },
    children: [
      new TextRun({
        text: content,
        size: (o.size ?? 10) * 2, // docx usa medios-puntos
        bold: o.bold,
        color: o.color ?? BRAND.body,
        font: BRAND.font,
        allCaps: o.caps,
      }),
    ],
  })
}

function sectionTitle(label: string) {
  return [
    new Paragraph({
      spacing: { before: 320, after: 0 },
      children: [
        new TextRun({ text: label, size: 26, bold: true, color: BRAND.ink, font: BRAND.font }),
      ],
    }),
    // Regla de acento bajo el título
    new Table({
      width: { size: 12, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          height: { value: 40, rule: HeightRule.EXACT },
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: BRAND.primary, color: 'auto' },
              borders: NO_BORDERS,
              children: [new Paragraph({ children: [] })],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ]
}

/** Barra proporcional compuesta por celdas sombreadas. */
function bar(segments: { pct: number; color: string }[], heightTwips = 220) {
  const clean = segments.filter((s) => s.pct > 0.01)
  if (clean.length === 0) clean.push({ pct: 100, color: BRAND.hairline })
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    columnWidths: clean.map((s) => Math.max(1, Math.round(s.pct * 100))),
    rows: [
      new TableRow({
        height: { value: heightTwips, rule: HeightRule.EXACT },
        children: clean.map(
          (s) =>
            new TableCell({
              width: { size: Math.max(0.5, s.pct), type: WidthType.PERCENTAGE },
              shading: { type: ShadingType.CLEAR, fill: s.color, color: 'auto' },
              borders: NO_BORDERS,
              children: [new Paragraph({ children: [] })],
            })
        ),
      }),
    ],
  })
}

/** Tarjeta de KPI: número grande sobre etiqueta. */
function kpiCell(value: string, label: string, accent: string) {
  return new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    margins: { top: 140, bottom: 140, left: 160, right: 160 },
    shading: { type: ShadingType.CLEAR, fill: BRAND.surface, color: 'auto' },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 18, color: accent },
      bottom: NO_BORDER,
      left: NO_BORDER,
      right: { style: BorderStyle.SINGLE, size: 6, color: BRAND.white },
    },
    children: [
      new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({ text: value, size: 40, bold: true, color: BRAND.ink, font: BRAND.font }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: label,
            size: 15,
            color: BRAND.muted,
            font: BRAND.font,
            allCaps: true,
          }),
        ],
      }),
    ],
  })
}

function dataRow(cells: string[], o: { header?: boolean; zebra?: boolean } = {}) {
  return new TableRow({
    children: cells.map(
      (c, i) =>
        new TableCell({
          margins: { top: 90, bottom: 90, left: 120, right: 120 },
          shading: {
            type: ShadingType.CLEAR,
            fill: o.header ? BRAND.primary : o.zebra ? BRAND.surface : BRAND.white,
            color: 'auto',
          },
          borders: {
            ...NO_BORDERS,
            bottom: { style: BorderStyle.SINGLE, size: 2, color: BRAND.hairline },
          },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: c,
                  size: o.header ? 15 : 17,
                  bold: o.header,
                  color: o.header ? BRAND.white : BRAND.body,
                  font: BRAND.font,
                  allCaps: o.header,
                }),
              ],
            }),
          ],
        })
    ),
  })
}

export async function buildProjectReportDocx(input: ReportInput): Promise<Buffer> {
  const { project, workItems, blockers, risks } = input
  const now = input.generatedAt ?? new Date()
  const depth = DEPTH[input.detailLevel ?? 'DETAILED']
  const logo = input.logo ?? SOFTWAREONE_LOGO_PNG

  // ── Métricas ──────────────────────────────────────────────────────────────
  const total = workItems.length
  const isOpen = (w: ReportWorkItem) => w.status !== 'DONE' && !w.completedAt
  const done = workItems.filter((w) => w.status === 'DONE' || w.completedAt).length
  const overdue = workItems.filter((w) => isOpen(w) && new Date(w.estimatedEndDate) < now)
  const inProgress = workItems.filter((w) => w.status === 'IN_PROGRESS')
  const openBlockers = blockers.filter((b) => !b.resolvedAt)
  const openRisks = risks.filter((r) => r.status !== 'CLOSED')
  const pct = total ? Math.round((done / total) * 100) : 0

  const start = new Date(project.startDate)
  const end = new Date(project.estimatedEndDate)
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
  const elapsed = Math.min(
    totalDays,
    Math.max(0, Math.round((now.getTime() - start.getTime()) / 86400000))
  )
  const remaining = Math.max(0, Math.round((end.getTime() - now.getTime()) / 86400000))
  const timePct = Math.round((elapsed / totalDays) * 100)
  // SPI simplificado: avance real contra avance esperado por calendario.
  const spi = timePct > 0 ? pct / timePct : 1

  const health =
    openBlockers.length > 0 || spi < 0.8
      ? { label: 'EN RIESGO', color: BRAND.danger }
      : spi < 0.95
        ? { label: 'ATENCIÓN', color: BRAND.warn }
        : { label: 'EN CURSO', color: BRAND.ok }

  const byStatus = STATUS_ORDER.map((s) => ({
    key: s,
    ...STATUS_STYLE[s],
    n: workItems.filter((w) => w.status === s).length,
  })).filter((s) => s.n > 0)

  // Fases con más pendientes, para no listar las 68 completas
  const phases = Array.from(
    workItems.reduce((m, w) => {
      const k = w.phase?.trim() || 'Sin fase'
      const cur = m.get(k) ?? { total: 0, done: 0 }
      cur.total++
      if (w.status === 'DONE' || w.completedAt) cur.done++
      m.set(k, cur)
      return m
    }, new Map<string, { total: number; done: number }>())
  )
    .map(([name, v]) => ({ name, ...v, pct: Math.round((v.done / v.total) * 100) }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total)
    .slice(0, depth.phases)

  // ── Portada ───────────────────────────────────────────────────────────────
  const cover: (Paragraph | Table)[] = []
  if (logo) {
    cover.push(
      new Paragraph({
        spacing: { after: 600 },
        children: [
          new ImageRun({
            data: logo,
            transformation: { width: 150, height: 53 },
            type: 'png',
          }),
        ],
      })
    )
  }
  cover.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              margins: { top: 420, bottom: 420, left: 360, right: 360 },
              shading: { type: ShadingType.CLEAR, fill: BRAND.primary, color: 'auto' },
              borders: NO_BORDERS,
              children: [
                new Paragraph({
                  spacing: { after: 120 },
                  children: [
                    new TextRun({
                      text: 'Reporte ejecutivo de proyecto',
                      size: 20,
                      color: BRAND.white,
                      font: BRAND.font,
                      allCaps: true,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { after: 100 },
                  children: [
                    new TextRun({
                      text: project.name,
                      size: 48,
                      bold: true,
                      color: BRAND.white,
                      font: BRAND.font,
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${project.client}  ·  Corte al ${fmtDate(now)}`,
                      size: 20,
                      color: BRAND.white,
                      font: BRAND.font,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 300 }, children: [] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          children: [
            kpiCell(`${pct}%`, 'Completitud', BRAND.primary),
            kpiCell(String(total), 'Tareas totales', BRAND.cyan),
            kpiCell(String(overdue.length), 'Vencidas', overdue.length ? BRAND.danger : BRAND.ok),
            kpiCell(String(openBlockers.length), 'Bloqueadores', openBlockers.length ? BRAND.danger : BRAND.ok),
          ],
        }),
        new TableRow({ children: [new TableCell({ columnSpan: 4, borders: NO_BORDERS, children: [new Paragraph({ spacing: { after: 100 }, children: [] })] })] }),
        new TableRow({
          children: [
            kpiCell(String(inProgress.length), 'En curso', BRAND.primary),
            kpiCell(String(openRisks.length), 'Riesgos abiertos', openRisks.length ? BRAND.warn : BRAND.ok),
            kpiCell(String(remaining), 'Días restantes', BRAND.teal),
            kpiCell(spi.toFixed(2), 'Índice de avance', spi < 0.8 ? BRAND.danger : spi < 0.95 ? BRAND.warn : BRAND.ok),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 320 }, children: [] }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              margins: { top: 160, bottom: 160, left: 200, right: 200 },
              shading: { type: ShadingType.CLEAR, fill: health.color, color: 'auto' },
              borders: NO_BORDERS,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `ESTADO GENERAL: ${health.label}`,
                      size: 22,
                      bold: true,
                      color: BRAND.white,
                      font: BRAND.font,
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Avance real ${pct}% contra ${timePct}% de calendario transcurrido · ${fmtDate(start)} → ${fmtDate(end)}`,
                      size: 17,
                      color: BRAND.white,
                      font: BRAND.font,
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

  // ── Cuerpo ────────────────────────────────────────────────────────────────
  const body: (Paragraph | Table)[] = []

  body.push(...sectionTitle('Avance general'))
  body.push(
    text(`${done} de ${total} tareas completadas`, { size: 10, color: BRAND.muted }),
    bar(
      [
        { pct, color: BRAND.primary },
        { pct: 100 - pct, color: BRAND.hairline },
      ],
      260
    ),
    new Paragraph({ spacing: { after: 60 }, children: [] }),
    text(`Calendario transcurrido: ${timePct}% (${elapsed} de ${totalDays} días)`, {
      size: 9,
      color: BRAND.muted,
    }),
    bar(
      [
        { pct: timePct, color: BRAND.blueSoft },
        { pct: 100 - timePct, color: BRAND.hairline },
      ],
      140
    )
  )

  body.push(...sectionTitle('Distribución por estado'))
  body.push(bar(byStatus.map((s) => ({ pct: (s.n / total) * 100, color: s.color })), 300))
  body.push(new Paragraph({ spacing: { after: 100 }, children: [] }))
  body.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          children: byStatus.map(
            (s) =>
              new TableCell({
                borders: {
                  ...NO_BORDERS,
                  top: { style: BorderStyle.SINGLE, size: 18, color: s.color },
                },
                margins: { top: 100, bottom: 60, right: 120 },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `${s.n}`,
                        size: 22,
                        bold: true,
                        color: BRAND.ink,
                        font: BRAND.font,
                      }),
                    ],
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: s.label,
                        size: 14,
                        color: BRAND.muted,
                        font: BRAND.font,
                      }),
                    ],
                  }),
                ],
              })
          ),
        }),
      ],
    })
  )

  if (phases.length) {
    body.push(...sectionTitle('Fases con menor avance'))
    for (const ph of phases) {
      body.push(
        new Paragraph({
          spacing: { before: 100, after: 40 },
          children: [
            new TextRun({ text: ph.name, size: 17, color: BRAND.body, font: BRAND.font }),
            new TextRun({
              text: `   ${ph.pct}%  (${ph.done}/${ph.total})`,
              size: 15,
              bold: true,
              color: BRAND.muted,
              font: BRAND.font,
            }),
          ],
        }),
        bar(
          [
            { pct: ph.pct, color: ph.pct < 25 ? BRAND.danger : ph.pct < 60 ? BRAND.warn : BRAND.primary },
            { pct: 100 - ph.pct, color: BRAND.hairline },
          ],
          130
        )
      )
    }
  }

  if (overdue.length) {
    body.push(...sectionTitle('Tareas vencidas'))
    const rows = [dataRow(['Tarea', 'Fase', 'Vencimiento', 'Días', 'Responsable'], { header: true })]
    overdue
      .sort((a, b) => +new Date(a.estimatedEndDate) - +new Date(b.estimatedEndDate))
      .slice(0, depth.overdue)
      .forEach((w, i) =>
        rows.push(
          dataRow(
            [
              w.title,
              w.phase ?? '—',
              fmtDate(w.estimatedEndDate),
              String(Math.floor((now.getTime() - +new Date(w.estimatedEndDate)) / 86400000)),
              w.ownerName ?? '—',
            ],
            { zebra: i % 2 === 1 }
          )
        )
      )
    body.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows }))
    if (overdue.length > depth.overdue) {
      body.push(text(`… y ${overdue.length - depth.overdue} más.`, { size: 9, color: BRAND.muted }))
    }
  }

  if (openBlockers.length || openRisks.length) {
    body.push(...sectionTitle('Bloqueadores y riesgos'))
    const rows = [dataRow(['Tipo', 'Descripción', 'Severidad / Nivel'], { header: true })]
    openBlockers.forEach((b, i) =>
      rows.push(dataRow(['Bloqueador', b.description, b.severity], { zebra: i % 2 === 1 }))
    )
    openRisks.forEach((r, i) =>
      rows.push(dataRow(['Riesgo', r.description, r.riskLevel], { zebra: (openBlockers.length + i) % 2 === 1 }))
    )
    body.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows }))
  }

  if (input.aiNarrative?.trim()) {
    body.push(...sectionTitle('Análisis'))
    for (const line of input.aiNarrative.trim().split('\n')) {
      const t = line.trim()
      if (!t) {
        body.push(new Paragraph({ spacing: { after: 60 }, children: [] }))
        continue
      }
      const isHeading = /^#{1,6}\s/.test(t)
      const isBullet = /^[-*•]\s/.test(t)
      body.push(
        new Paragraph({
          spacing: { after: 60 },
          bullet: isBullet ? { level: 0 } : undefined,
          children: [
            new TextRun({
              text: t.replace(/^#{1,6}\s*/, '').replace(/^[-*•]\s*/, '').replace(/\*\*/g, ''),
              size: isHeading ? 20 : 17,
              bold: isHeading,
              color: isHeading ? BRAND.ink : BRAND.body,
              font: BRAND.font,
            }),
          ],
        })
      )
    }
  }

  // ── Documento ─────────────────────────────────────────────────────────────
  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: `${project.client} · Confidencial · Página `,
            size: 14,
            color: BRAND.muted,
            font: BRAND.font,
          }),
          new TextRun({ children: [PageNumber.CURRENT], size: 14, color: BRAND.muted, font: BRAND.font }),
        ],
      }),
    ],
  })

  const doc = new Document({
    creator: 'SoftwareOne',
    title: `Reporte ejecutivo — ${project.name}`,
    styles: { default: { document: { run: { font: BRAND.font, color: BRAND.body } } } },
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
        children: cover,
      },
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: project.name,
                    size: 14,
                    color: BRAND.muted,
                    font: BRAND.font,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: { default: footer },
        children: body,
      },
    ],
  })

  return Buffer.from(await Packer.toBuffer(doc))
}

/**
 * POST /api/v1/ai/generate-report/docx
 *
 * Devuelve el mismo reporte que genera la app, empaquetado en Word con portada,
 * KPIs y gráficas. La narrativa llega ya generada desde el cliente para no pagar
 * una segunda llamada al modelo: el texto que el usuario está viendo en pantalla
 * es exactamente el que se embebe en el documento.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, AuthContext } from '@/lib/middleware/withAuth'
import { Permission } from '@/types'
import prisma from '@/lib/prisma'
import { buildProjectReportDocx } from '@/lib/reports/project-report-docx'
import { AIService } from '@/lib/services/ai-service'

export const maxDuration = 60

const schema = z.object({
  projectId: z.string().uuid('Invalid project ID format'),
  detailLevel: z.enum(['EXECUTIVE', 'DETAILED', 'COMPLETE']).default('DETAILED'),
})

function fileName(projectName: string, now: Date) {
  const slug = projectName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `Reporte-${slug || 'Proyecto'}-${now.toISOString().slice(0, 10)}.docx`
}

async function handler(
  request: NextRequest,
  _context: { params: Promise<{}> },
  authContext: AuthContext
): Promise<NextResponse> {
  try {
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid request data',
          details: parsed.error.issues.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      )
    }

    const { projectId, detailLevel } = parsed.data

    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: authContext.organizationId },
      include: {
        workItems: { include: { owner: { select: { name: true } } } },
        blockers: true,
        risks: true,
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Project not found or you do not have access to it' },
        { status: 404 }
      )
    }

    const now = new Date()

    // Cifras calculadas aquí y entregadas al modelo: así argumenta sobre ellas
    // en lugar de inventarlas, y el documento y la narrativa no se contradicen.
    const items = project.workItems
    const total = items.length
    const done = items.filter((w) => w.status === 'DONE' || w.completedAt).length
    const overdue = items
      .filter((w) => w.status !== 'DONE' && !w.completedAt && w.estimatedEndDate < now)
      .sort((a, b) => +a.estimatedEndDate - +b.estimatedEndDate)
    const days = (a: Date, b: Date) => Math.round((+a - +b) / 86400000)
    const totalDays = Math.max(1, days(project.estimatedEndDate, project.startDate))
    const elapsed = Math.max(0, Math.min(totalDays, days(now, project.startDate)))
    const scopePct = total ? (done / total) * 100 : 0
    const timePct = (elapsed / totalDays) * 100

    const brief = await AIService.generateExecutiveBrief({
      proyecto: project.name,
      cliente: project.client,
      ventana: `${project.startDate.toISOString().slice(0, 10)} → ${project.estimatedEndDate.toISOString().slice(0, 10)}`,
      diasTotales: totalDays,
      diasTranscurridos: elapsed,
      diasRestantes: Math.max(0, days(project.estimatedEndDate, now)),
      tareasTotales: total,
      tareasCerradas: done,
      pctAlcance: Number(scopePct.toFixed(1)),
      pctCalendario: Number(timePct.toFixed(1)),
      indiceAvance: Number((timePct > 0 ? scopePct / timePct : 1).toFixed(2)),
      tareasVencidas: overdue.length,
      vencidasTop: overdue.slice(0, 10).map((w) => ({
        tarea: w.title,
        fase: w.phase,
        diasAtraso: days(now, w.estimatedEndDate),
      })),
      porEstado: items.reduce<Record<string, number>>((acc, w) => {
        acc[w.status] = (acc[w.status] ?? 0) + 1
        return acc
      }, {}),
      bloqueosAbiertos: project.blockers
        .filter((b) => !b.resolvedAt)
        .map((b) => ({ descripcion: b.description, severidad: b.severity })),
      riesgosAbiertos: project.risks
        .filter((r) => r.status !== 'CLOSED')
        .map((r) => ({ descripcion: r.description, nivel: r.riskLevel })),
    }).catch((e) => {
      // El documento se sostiene con las cifras aunque la narrativa falle.
      console.error('[AI Report DOCX] brief failed, continuing without narrative:', e)
      return {}
    })

    const buffer = await buildProjectReportDocx({
      project: {
        name: project.name,
        client: project.client,
        status: project.status,
        startDate: project.startDate,
        estimatedEndDate: project.estimatedEndDate,
      },
      workItems: project.workItems.map((w) => ({
        title: w.title,
        status: w.status,
        priority: w.priority,
        phase: w.phase,
        startDate: w.startDate,
        estimatedEndDate: w.estimatedEndDate,
        completedAt: w.completedAt,
        ownerName: w.owner?.name,
      })),
      blockers: project.blockers.map((b) => ({
        description: b.description,
        severity: b.severity,
        resolvedAt: b.resolvedAt,
      })),
      risks: project.risks.map((r) => ({
        description: r.description,
        riskLevel: r.riskLevel,
        status: r.status,
      })),
      brief,
      detailLevel,
      generatedAt: now,
    })

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName(project.name, now)}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[AI Report DOCX] Error:', error)
    const err = error as Error
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Failed to build the Word report',
        source: 'generate-report-docx:handler',
        detail: { name: err?.name ?? null, message: err?.message ?? String(error) },
      },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handler, {
  requiredPermissions: [Permission.AI_USE],
})

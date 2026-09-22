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
import { buildProjectSnapshot, toBriefFacts } from '@/lib/reports/project-snapshot'
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

    // Cifras calculadas aparte y entregadas al modelo: así argumenta sobre ellas en lugar de
    // inventarlas, y el documento y la narrativa no se contradicen.
    //
    // El cálculo vive en `lib/reports/project-snapshot.ts` desde que el reporte diario por correo
    // empezó a usar las mismas cifras. Estaba aquí, en línea; se movió para que el Word y el
    // correo no puedan contar cosas distintas del mismo proyecto el mismo día.
    const datosProyecto = {
      name: project.name,
      client: project.client,
      status: project.status,
      startDate: project.startDate,
      estimatedEndDate: project.estimatedEndDate,
    }
    const snapshot = buildProjectSnapshot({
      project: datosProyecto,
      workItems: project.workItems,
      blockers: project.blockers,
      risks: project.risks,
      now,
    })

    const brief = await AIService.generateExecutiveBrief(
      toBriefFacts(datosProyecto, snapshot)
    ).catch((e) => {
      // El documento se sostiene con las cifras aunque la narrativa falle.
      console.error('[AI Report DOCX] brief failed, continuing without narrative:', e)
      return {}
    })

    const buffer = await buildProjectReportDocx({
      project: datosProyecto,
      workItems: project.workItems.map((w) => ({
        title: w.title,
        status: w.status,
        priority: w.priority,
        phase: w.phase,
        startDate: w.startDate,
        estimatedEndDate: w.estimatedEndDate,
        completedAt: w.completedAt,
        ownerName: w.owner?.name,
        templateOrder: w.templateOrder,
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

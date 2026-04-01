/**
 * AIService - AWS Bedrock Integration Service
 * 
 * Provides AI-powered features using AWS Bedrock (Claude 3 Sonnet):
 * - Project report generation with different detail levels
 * - Proactive project analysis with caching
 * - Text improvement for various purposes
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 16.5
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelCommandInput,
} from '@aws-sdk/client-bedrock-runtime'
import prisma from '@/lib/prisma'
import { AIServiceError, AIGuardrailsError } from '@/lib/errors'
import { ReportDetailLevel } from '@/types'
import {
  AIAnalysis,
  TextPurpose,
  AISuggestion,
  DetectedRisk,
  OverdueItemSuggestion,
} from '@/types/ai'

// Bedrock configuration from environment variables
const AWS_REGION = process.env.AWS_REGION || 'us-east-1'
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0'
const BEDROCK_GUARDRAIL_ID = process.env.BEDROCK_GUARDRAIL_ID
const BEDROCK_GUARDRAIL_VERSION = process.env.BEDROCK_GUARDRAIL_VERSION || '1'

// Cache duration in hours (default 24 hours)
const CACHE_DURATION_HOURS = 24

interface BedrockOptions {
  maxTokens?: number
  temperature?: number
  topP?: number
}

interface ProjectData {
  id: string
  name: string
  description: string
  client: string
  status: string
  startDate: Date
  estimatedEndDate: Date
  workItems: Array<{
    id: string
    title: string
    description: string
    status: string
    priority: string
    startDate: Date
    estimatedEndDate: Date
    completedAt: Date | null
    owner: { name: string }
  }>
  blockers: Array<{
    id: string
    description: string
    blockedBy: string
    severity: string
    startDate: Date
    resolvedAt: Date | null
    workItem: { title: string }
  }>
  risks: Array<{
    id: string
    description: string
    probability: number
    impact: number
    riskLevel: string
    status: string
    mitigationPlan: string
    owner: { name: string }
  }>
  agreements: Array<{
    id: string
    description: string
    agreementDate: Date
    participants: string
    status: string
    completedAt: Date | null
  }>
}

export class AIService {
  private static bedrockClient: BedrockRuntimeClient | null = null

  /**
   * Get or create Bedrock client instance
   */
  private static getBedrockClient(): BedrockRuntimeClient {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
    const region = process.env.AWS_REGION || 'us-east-1'

    if (!accessKeyId || !secretAccessKey) {
      throw new AIServiceError(
        'AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables.'
      )
    }

    return new BedrockRuntimeClient({
      region,
      credentials: { accessKeyId, secretAccessKey },
    })
  }

  /**
   * Execute a Bedrock request with retry logic and error handling
   * Implements exponential backoff for retries (max 3 attempts)
   * 
   * Requirements: 9.3, 16.5
   */
  private static async executeBedrockRequest<T>(
    prompt: string,
    options: BedrockOptions = {}
  ): Promise<T> {
    const maxRetries = 3
    const baseDelay = 1000 // 1 second
    const startTime = Date.now()

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.getBedrockClient()

        // Prepare the request payload for Claude 3
        const payload = {
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: options.maxTokens || 4096,
          temperature: options.temperature || 0.7,
          top_p: options.topP || 0.9,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }

        const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0'
        const input: InvokeModelCommandInput = {
          modelId,
          contentType: 'application/json',
          accept: 'application/json',
          body: JSON.stringify(payload),
        }

        // Add guardrails if configured
        if (BEDROCK_GUARDRAIL_ID) {
          input.guardrailIdentifier = BEDROCK_GUARDRAIL_ID
          input.guardrailVersion = BEDROCK_GUARDRAIL_VERSION
        }

        const command = new InvokeModelCommand(input)
        const response = await client.send(command)

        // Parse response
        const responseBody = JSON.parse(
          new TextDecoder().decode(response.body)
        )

        // Check for guardrails intervention
        if (responseBody.stop_reason === 'guardrail_intervened') {
          throw new AIGuardrailsError(
            'Content blocked by AI guardrails (PII detection or content policy violation)'
          )
        }

        // Extract content from Claude response
        const content = responseBody.content?.[0]?.text
        if (!content) {
          throw new AIServiceError('No content in Bedrock response')
        }

        // Track performance metrics
        const duration = Date.now() - startTime
        const inputTokens = responseBody.usage?.input_tokens || 0
        const outputTokens = responseBody.usage?.output_tokens || 0

        // Import PerformanceMonitor dynamically to avoid circular dependencies
        try {
          const { PerformanceMonitor } = await import('@/lib/monitoring/performance-monitor')
          await PerformanceMonitor.trackBedrockCall(
            duration,
            BEDROCK_MODEL_ID,
            inputTokens,
            outputTokens
          )
        } catch (error) {
          // Ignore if PerformanceMonitor is not available
          console.warn('Failed to track Bedrock performance:', error)
        }

        return content as T
      } catch (error: unknown) {
        const err = error as Error & { name?: string; $metadata?: { httpStatusCode?: number } }

        // Handle guardrails errors (don't retry)
        if (error instanceof AIGuardrailsError) {
          throw error
        }

        // Handle throttling errors (retry with backoff)
        if (
          err.name === 'ThrottlingException' ||
          err.$metadata?.httpStatusCode === 429
        ) {
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt - 1)
            console.warn(
              `[AIService] Throttled, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`
            )
            await new Promise((resolve) => setTimeout(resolve, delay))
            continue
          }
          throw new AIServiceError('AI service throttled, please try again later')
        }

        // Handle timeout errors (retry with backoff)
        if (err.name === 'TimeoutError') {
          if (attempt < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempt - 1)
            console.warn(
              `[AIService] Timeout, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`
            )
            await new Promise((resolve) => setTimeout(resolve, delay))
            continue
          }
          throw new AIServiceError('AI request timed out, please try again')
        }

        // Handle other errors
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1)
          console.warn(
            `[AIService] Error, retrying in ${delay}ms (attempt ${attempt}/${maxRetries}):`,
            err.message
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }

        throw new AIServiceError(
          `Failed to execute AI request: ${err.message}`,
          { originalError: err.message }
        )
      }
    }

    throw new AIServiceError('Max retries exceeded')
  }

  /**
   * Fetch project data with all related entities
   */
  private static async getProjectData(projectId: string): Promise<ProjectData> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        workItems: {
          include: {
            owner: {
              select: { name: true },
            },
          },
        },
        blockers: {
          include: {
            workItem: {
              select: { title: true },
            },
          },
        },
        risks: {
          include: {
            owner: {
              select: { name: true },
            },
          },
        },
        agreements: true,
      },
    })

    if (!project) {
      throw new AIServiceError('Project not found')
    }

    return project as unknown as ProjectData
  }

  /**
   * Generate project report with AI
   * Supports different detail levels: EXECUTIVE, DETAILED, COMPLETE
   * 
   * Requirements: 8.1, 8.2, 8.3
   */
  static async generateProjectReport(
    projectId: string,
    detailLevel: ReportDetailLevel
  ): Promise<string> {
    try {
      const project = await this.getProjectData(projectId)

      // Build prompt based on detail level
      const prompt = this.buildReportPrompt(project, detailLevel)

      // Call Bedrock
      const report = await this.executeBedrockRequest<string>(prompt, {
        maxTokens: detailLevel === ReportDetailLevel.COMPLETE ? 8000 : 4096,
        temperature: 0.5, // Lower temperature for more factual reports
      })

      return report
    } catch (error) {
      if (error instanceof AIServiceError || error instanceof AIGuardrailsError) {
        throw error
      }
      throw new AIServiceError(
        `Failed to generate project report: ${(error as Error).message}`
      )
    }
  }

  /**
   * Build report prompt based on detail level
   */
  private static buildReportPrompt(
    project: ProjectData,
    detailLevel: ReportDetailLevel
  ): string {
    const baseInfo = `
Genera un reporte del proyecto con la siguiente información:

**Proyecto:** ${project.name}
**Cliente:** ${project.client}
**Estado:** ${project.status}
**Descripción:** ${project.description}
**Fecha de inicio:** ${project.startDate.toISOString().split('T')[0]}
**Fecha estimada de finalización:** ${project.estimatedEndDate.toISOString().split('T')[0]}

**Work Items (${project.workItems.length}):**
${project.workItems.map((wi) => `- [${wi.status}] ${wi.title} (${wi.priority}) - Responsable: ${wi.owner.name}`).join('\n')}

**Blockers activos (${project.blockers.filter((b) => !b.resolvedAt).length}):**
${project.blockers.filter((b) => !b.resolvedAt).map((b) => `- [${b.severity}] ${b.description} - Bloqueado por: ${b.blockedBy}`).join('\n') || 'Ninguno'}

**Riesgos (${project.risks.filter((r) => r.status !== 'CLOSED').length}):**
${project.risks.filter((r) => r.status !== 'CLOSED').map((r) => `- [${r.riskLevel}] ${r.description} - Responsable: ${r.owner.name}`).join('\n') || 'Ninguno'}

**Acuerdos (${project.agreements.length}):**
${project.agreements.map((a) => `- [${a.status}] ${a.description} - Fecha: ${a.agreementDate.toISOString().split('T')[0]}`).join('\n') || 'Ninguno'}
`

    if (detailLevel === ReportDetailLevel.EXECUTIVE) {
      return `${baseInfo}

Genera un reporte ejecutivo conciso (máximo 300 palabras) que resuma:
1. Estado general del proyecto
2. Principales logros
3. Riesgos y blockers críticos
4. Próximos pasos

Usa un tono profesional y enfócate en información de alto nivel para ejecutivos.`
    }

    if (detailLevel === ReportDetailLevel.DETAILED) {
      return `${baseInfo}

Genera un reporte detallado (500-800 palabras) que incluya:
1. Resumen ejecutivo
2. Progreso de work items por estado
3. Análisis de blockers y su impacto
4. Evaluación de riesgos
5. Estado de acuerdos
6. Recomendaciones

Usa un tono profesional y proporciona análisis específico.`
    }

    // COMPLETE
    return `${baseInfo}

Genera un reporte completo y exhaustivo (1000-1500 palabras) que incluya:
1. Resumen ejecutivo
2. Análisis detallado de progreso por work item
3. Evaluación completa de blockers con impacto y recomendaciones
4. Análisis de riesgos con planes de mitigación
5. Estado detallado de acuerdos y compromisos
6. Métricas de performance
7. Recomendaciones estratégicas y tácticas
8. Próximos pasos con timeline

Usa un tono profesional y proporciona análisis profundo con datos específicos.`
  }

  /**
   * Analyze project and provide AI suggestions
   * Checks cache first (24-hour expiration)
   * 
   * Requirements: 9.1, 9.2, 9.4
   */
  static async analyzeProject(projectId: string): Promise<AIAnalysis> {
    try {
      // Check cache first
      const cached = await this.getCachedAnalysis(projectId)
      if (cached) {
        return cached
      }

      // Fetch project data
      const project = await this.getProjectData(projectId)

      // Build analysis prompt
      const prompt = this.buildAnalysisPrompt(project)

      // Call Bedrock
      const analysisText = await this.executeBedrockRequest<string>(prompt, {
        maxTokens: 4096,
        temperature: 0.7,
      })

      // Parse JSON response
      const analysis = this.parseAnalysisResponse(analysisText, projectId)

      // Cache the analysis
      await this.cacheAnalysis(projectId, analysis)

      return analysis
    } catch (error) {
      if (error instanceof AIServiceError || error instanceof AIGuardrailsError) {
        throw error
      }
      throw new AIServiceError(
        `Failed to analyze project: ${(error as Error).message}`
      )
    }
  }

  /**
   * Build analysis prompt
   */
  private static buildAnalysisPrompt(project: ProjectData): string {
    const now = new Date()
    const overdueWorkItems = project.workItems.filter(
      (wi) =>
        wi.status !== 'DONE' &&
        new Date(wi.estimatedEndDate) < now &&
        !wi.completedAt
    )

    return `
Analiza el siguiente proyecto y proporciona sugerencias proactivas en formato JSON.

**Proyecto:** ${project.name}
**Cliente:** ${project.client}
**Estado:** ${project.status}
**Fecha de inicio:** ${project.startDate.toISOString().split('T')[0]}
**Fecha estimada de finalización:** ${project.estimatedEndDate.toISOString().split('T')[0]}

**Work Items:**
${project.workItems.map((wi) => `- ID: ${wi.id}, Título: ${wi.title}, Estado: ${wi.status}, Prioridad: ${wi.priority}, Fecha estimada: ${wi.estimatedEndDate.toISOString().split('T')[0]}, Responsable: ${wi.owner.name}`).join('\n')}

**Blockers activos:**
${project.blockers.filter((b) => !b.resolvedAt).map((b) => `- ID: ${b.id}, Descripción: ${b.description}, Severidad: ${b.severity}, Work Item: ${b.workItem.title}`).join('\n') || 'Ninguno'}

**Riesgos:**
${project.risks.filter((r) => r.status !== 'CLOSED').map((r) => `- ID: ${r.id}, Descripción: ${r.description}, Nivel: ${r.riskLevel}, Probabilidad: ${r.probability}, Impacto: ${r.impact}`).join('\n') || 'Ninguno'}

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin texto adicional) con la siguiente estructura:
{
  "suggestions": [
    {
      "type": "CREATE_BLOCKER" | "ADJUST_DATES" | "CREATE_RISK" | "REASSIGN",
      "priority": "LOW" | "MEDIUM" | "HIGH",
      "description": "descripción de la sugerencia",
      "affectedEntityId": "id del work item o entidad afectada (DEBE SER EL ID, NO EL TÍTULO)",
      "suggestedAction": {}
    }
  ],
  "detectedRisks": [
    {
      "description": "descripción del riesgo detectado",
      "probability": 1-5,
      "impact": 1-5,
      "affectedWorkItemIds": ["id1", "id2"]
    }
  ],
  "overdueItems": [
    {
      "workItemId": "id del work item (DEBE SER EL ID UUID, NO EL TÍTULO)",
      "title": "título del work item",
      "daysOverdue": número,
      "suggestedAction": "acción sugerida"
    }
  ]
}

IMPORTANTE: 
- En "affectedEntityId" y "workItemId" SIEMPRE usa el ID (UUID) del work item, NO el título.
- Los IDs están en el formato UUID (ejemplo: "123e4567-e89b-12d3-a456-426614174000")
- El campo "title" en overdueItems es donde va el título del work item.

Analiza:
1. Work items atrasados (${overdueWorkItems.length} encontrados)
2. Blockers que requieren atención
3. Riesgos potenciales no identificados
4. Sugerencias de reasignación o ajuste de fechas
`
  }

  /**
   * Parse AI analysis response
   */
  private static parseAnalysisResponse(
    responseText: string,
    projectId: string
  ): AIAnalysis {
    try {
      // Remove markdown code blocks if present
      let jsonText = responseText.trim()
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\n?$/g, '')
      }

      const parsed = JSON.parse(jsonText)

      return {
        projectId,
        analyzedAt: new Date(),
        suggestions: parsed.suggestions || [],
        detectedRisks: parsed.detectedRisks || [],
        overdueItems: parsed.overdueItems || [],
      }
    } catch (error) {
      console.error('[AIService] Failed to parse analysis response:', error)
      // Return empty analysis if parsing fails
      return {
        projectId,
        analyzedAt: new Date(),
        suggestions: [],
        detectedRisks: [],
        overdueItems: [],
      }
    }
  }

  /**
   * Improve text for specific purpose
   * 
   * Requirements: 8.4
   */
  static async improveText(
    text: string,
    purpose: TextPurpose,
    context?: { projectName?: string; projectDescription?: string }
  ): Promise<string> {
    try {
      const prompt = this.buildImproveTextPrompt(text, purpose, context)

      const improvedText = await this.executeBedrockRequest<string>(prompt, {
        maxTokens: 2048,
        temperature: 0.7,
      })

      return improvedText
    } catch (error) {
      if (error instanceof AIServiceError || error instanceof AIGuardrailsError) {
        throw error
      }
      throw new AIServiceError(
        `Failed to improve text: ${(error as Error).message}`
      )
    }
  }

  /**
   * Build improve text prompt
   */
  private static buildImproveTextPrompt(
    text: string,
    purpose: TextPurpose,
    context?: { projectName?: string; projectDescription?: string }
  ): string {
    const purposeInstructions = {
      [TextPurpose.EMAIL]: 'un email profesional',
      [TextPurpose.REPORT]: 'un reporte formal',
      [TextPurpose.DESCRIPTION]: 'una descripción clara y concisa',
    }

    let contextSection = ''
    if (context?.projectName || context?.projectDescription) {
      contextSection = `
Contexto del proyecto:
${context.projectName ? `- Nombre del proyecto: ${context.projectName}` : ''}
${context.projectDescription ? `- Descripción del proyecto: ${context.projectDescription}` : ''}

Este texto forma parte de una actividad dentro de este proyecto.
`
    }

    return `
${contextSection}
Mejora el siguiente texto para ${purposeInstructions[purpose]}:

"${text}"

Instrucciones:
- Mantén el significado original
- Mejora la claridad y profesionalismo
- Corrige errores gramaticales y ortográficos
- Usa un tono apropiado para ${purposeInstructions[purpose]}
${context ? '- Considera el contexto del proyecto para generar una descripción relevante' : ''}
- Responde ÚNICAMENTE con el texto mejorado, sin explicaciones adicionales
`
  }

  /**
   * Get cached analysis if available and not expired
   * 
   * Requirements: 9.4
   */
  static async getCachedAnalysis(
    projectId: string
  ): Promise<AIAnalysis | null> {
    try {
      const cache = await prisma.aIAnalysisCache.findUnique({
        where: { projectId },
      })

      if (!cache) {
        // Track cache miss
        try {
          const { PerformanceMonitor } = await import('@/lib/monitoring/performance-monitor')
          await PerformanceMonitor.trackCacheHit('ai-analysis', false)
        } catch (error) {
          // Ignore if PerformanceMonitor is not available
        }
        return null
      }

      // Check if cache is expired
      if (new Date() > cache.expiresAt) {
        // Delete expired cache
        await this.invalidateCache(projectId)
        
        // Track cache miss (expired)
        try {
          const { PerformanceMonitor } = await import('@/lib/monitoring/performance-monitor')
          await PerformanceMonitor.trackCacheHit('ai-analysis', false)
        } catch (error) {
          // Ignore if PerformanceMonitor is not available
        }
        
        return null
      }

      // Track cache hit
      try {
        const { PerformanceMonitor } = await import('@/lib/monitoring/performance-monitor')
        await PerformanceMonitor.trackCacheHit('ai-analysis', true)
      } catch (error) {
        // Ignore if PerformanceMonitor is not available
      }

      // Parse and return cached analysis
      const analysisData = cache.analysisData as Record<string, unknown>
      return {
        projectId: cache.projectId,
        analyzedAt: cache.analyzedAt,
        suggestions: (analysisData.suggestions as AISuggestion[]) || [],
        detectedRisks: (analysisData.detectedRisks as DetectedRisk[]) || [],
        overdueItems: (analysisData.overdueItems as OverdueItemSuggestion[]) || [],
      }
    } catch (error) {
      console.error('[AIService] Error getting cached analysis:', error)
      return null
    }
  }

  /**
   * Cache analysis with expiration
   */
  private static async cacheAnalysis(
    projectId: string,
    analysis: AIAnalysis
  ): Promise<void> {
    try {
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + CACHE_DURATION_HOURS)

      await prisma.aIAnalysisCache.upsert({
        where: { projectId },
        create: {
          projectId,
          analysisData: JSON.parse(JSON.stringify({
            suggestions: analysis.suggestions,
            detectedRisks: analysis.detectedRisks,
            overdueItems: analysis.overdueItems,
          })),
          analyzedAt: analysis.analyzedAt,
          expiresAt,
        },
        update: {
          analysisData: JSON.parse(JSON.stringify({
            suggestions: analysis.suggestions,
            detectedRisks: analysis.detectedRisks,
            overdueItems: analysis.overdueItems,
          })),
          analyzedAt: analysis.analyzedAt,
          expiresAt,
        },
      })
    } catch (error) {
      console.error('[AIService] Error caching analysis:', error)
      // Don't throw error, caching is not critical
    }
  }

  /**
   * Invalidate (delete) cached analysis
   * 
   * Requirements: 9.4
   */
  static async invalidateCache(projectId: string): Promise<void> {
    try {
      await prisma.aIAnalysisCache.delete({
        where: { projectId },
      })
    } catch (error) {
      // Ignore error if cache doesn't exist
      if ((error as { code?: string }).code !== 'P2025') {
        console.error('[AIService] Error invalidating cache:', error)
      }
    }
  }
}

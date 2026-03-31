import prisma from '@/lib/prisma'
import { NotFoundError } from '@/lib/errors'
import { 
  ExportOptions, 
  ExportResult, 
  ReportDetailLevel,
  WorkItemStatus,
  BlockerSeverity,
  RiskLevel,
  AgreementStatus,
  NotificationMessage
} from '@/types'

export class ExportService {
  /**
   * Export project with structured report
   * Requirements: 11.1, 11.2, 11.5
   * 
   * Generates a structured report with sections:
   * - Executive summary
   * - Work items (grouped by status)
   * - Active blockers
   * - Risks
   * - Agreements
   * 
   * Supports detail levels that filter content:
   * - EXECUTIVE: High-level summary only
   * - DETAILED: Summary + key items
   * - COMPLETE: All information
   */
  async exportProject(projectId: string, options: ExportOptions): Promise<ExportResult> {
    // Fetch project with all related data
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        workItems: options.includeWorkItems ? {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
              },
            },
            blockers: {
              where: {
                resolvedAt: null,
              },
              select: {
                id: true,
                severity: true,
              },
            },
          },
          orderBy: [
            { status: 'asc' },
            { priority: 'desc' },
          ],
        } : false,
        blockers: options.includeBlockers ? {
          where: {
            resolvedAt: null, // Only active blockers
          },
          include: {
            workItem: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          orderBy: {
            severity: 'desc',
          },
        } : false,
        risks: options.includeRisks ? {
          where: {
            status: {
              not: 'CLOSED',
            },
          },
          include: {
            owner: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            riskLevel: 'desc',
          },
        } : false,
        agreements: options.includeAgreements ? {
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
            workItems: {
              include: {
                workItem: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                  },
                },
              },
            },
            notes: {
              orderBy: {
                createdAt: 'desc',
              },
              take: options.detailLevel === ReportDetailLevel.COMPLETE ? undefined : 3,
            },
          },
          orderBy: {
            agreementDate: 'desc',
          },
        } : false,
      },
    })

    if (!project) {
      throw new NotFoundError('Project')
    }

    // Build report content based on format
    const format = 'MARKDOWN' // Default to markdown for better structure
    let content = ''

    // Generate report sections
    content += this.generateHeader(project, format)
    content += this.generateExecutiveSummary(project, options, format)
    
    if (options.includeWorkItems && project.workItems) {
      content += this.generateWorkItemsSection(project.workItems, options.detailLevel, format)
    }
    
    if (options.includeBlockers && project.blockers) {
      content += this.generateBlockersSection(project.blockers, options.detailLevel, format)
    }
    
    if (options.includeRisks && project.risks) {
      content += this.generateRisksSection(project.risks, options.detailLevel, format)
    }
    
    if (options.includeAgreements && project.agreements) {
      content += this.generateAgreementsSection(project.agreements, options.detailLevel, format)
    }

    return {
      content,
      format,
      generatedAt: new Date(),
    }
  }

  /**
   * Generate report header
   */
  private generateHeader(project: any, format: string): string {
    const startDate = new Date(project.startDate).toLocaleDateString()
    const endDate = new Date(project.estimatedEndDate).toLocaleDateString()
    
    if (format === 'MARKDOWN') {
      return `# Project Export: ${project.name}\n\n` +
             `**Client:** ${project.client}\n` +
             `**Status:** ${project.status}\n` +
             `**Timeline:** ${startDate} - ${endDate}\n` +
             `**Organization:** ${project.organization.name}\n` +
             `**Generated:** ${new Date().toLocaleString()}\n\n` +
             `---\n\n`
    } else {
      return `PROJECT EXPORT: ${project.name}\n\n` +
             `Client: ${project.client}\n` +
             `Status: ${project.status}\n` +
             `Timeline: ${startDate} - ${endDate}\n` +
             `Organization: ${project.organization.name}\n` +
             `Generated: ${new Date().toLocaleString()}\n\n` +
             `${'='.repeat(80)}\n\n`
    }
  }

  /**
   * Generate executive summary section
   * Requirements: 11.2
   */
  private generateExecutiveSummary(project: any, options: ExportOptions, format: string): string {
    let summary = format === 'MARKDOWN' ? '## Executive Summary\n\n' : 'EXECUTIVE SUMMARY\n\n'

    // Calculate key metrics
    const workItems = project.workItems || []
    const totalWorkItems = workItems.length
    const completedWorkItems = workItems.filter((item: any) => item.status === WorkItemStatus.DONE).length
    const completionRate = totalWorkItems > 0 ? Math.round((completedWorkItems / totalWorkItems) * 100) : 0

    const activeBlockers = project.blockers?.length || 0
    const criticalBlockers = project.blockers?.filter((b: any) => b.severity === BlockerSeverity.CRITICAL).length || 0

    const activeRisks = project.risks?.length || 0
    const highRisks = project.risks?.filter((r: any) => 
      r.riskLevel === RiskLevel.HIGH || r.riskLevel === RiskLevel.CRITICAL
    ).length || 0

    const activeAgreements = project.agreements?.filter((a: any) => 
      a.status === AgreementStatus.PENDING || a.status === AgreementStatus.IN_PROGRESS
    ).length || 0

    // Add project description
    summary += `${project.description}\n\n`

    // Add key metrics
    if (format === 'MARKDOWN') {
      summary += `### Key Metrics\n\n`
      summary += `- **Completion Rate:** ${completionRate}% (${completedWorkItems}/${totalWorkItems} work items)\n`
      summary += `- **Active Blockers:** ${activeBlockers}${criticalBlockers > 0 ? ` (${criticalBlockers} critical)` : ''}\n`
      summary += `- **Active Risks:** ${activeRisks}${highRisks > 0 ? ` (${highRisks} high/critical)` : ''}\n`
      summary += `- **Active Agreements:** ${activeAgreements}\n\n`
    } else {
      summary += `Key Metrics:\n`
      summary += `  Completion Rate: ${completionRate}% (${completedWorkItems}/${totalWorkItems} work items)\n`
      summary += `  Active Blockers: ${activeBlockers}${criticalBlockers > 0 ? ` (${criticalBlockers} critical)` : ''}\n`
      summary += `  Active Risks: ${activeRisks}${highRisks > 0 ? ` (${highRisks} high/critical)` : ''}\n`
      summary += `  Active Agreements: ${activeAgreements}\n\n`
    }

    // Add AI narrative if requested
    if (options.useAINarrative) {
      summary += this.generateAINarrativePlaceholder(project, format)
    }

    return summary
  }

  /**
   * Generate AI narrative placeholder
   * Note: Actual AI integration will be implemented in task 12.3
   */
  private generateAINarrativePlaceholder(project: any, format: string): string {
    if (format === 'MARKDOWN') {
      return `### AI Analysis\n\n` +
             `*AI-generated narrative will be available once AI service is integrated.*\n\n`
    } else {
      return `AI Analysis:\n` +
             `AI-generated narrative will be available once AI service is integrated.\n\n`
    }
  }

  /**
   * Generate work items section
   * Requirements: 11.2, 11.5
   */
  private generateWorkItemsSection(workItems: any[], detailLevel: ReportDetailLevel, format: string): string {
    let section = format === 'MARKDOWN' ? '## Work Items\n\n' : 'WORK ITEMS\n\n'

    // Group work items by status
    const itemsByStatus = new Map<string, any[]>()
    for (const item of workItems) {
      const status = item.status
      if (!itemsByStatus.has(status)) {
        itemsByStatus.set(status, [])
      }
      itemsByStatus.get(status)!.push(item)
    }

    // Define status order
    const statusOrder = [
      WorkItemStatus.BLOCKED,
      WorkItemStatus.IN_PROGRESS,
      WorkItemStatus.TODO,
      WorkItemStatus.BACKLOG,
      WorkItemStatus.DONE,
    ]

    // Generate section for each status
    for (const status of statusOrder) {
      const items = itemsByStatus.get(status) || []
      if (items.length === 0) continue

      if (format === 'MARKDOWN') {
        section += `### ${status} (${items.length})\n\n`
      } else {
        section += `${status} (${items.length}):\n`
      }

      // Filter items based on detail level
      let itemsToShow = items
      if (detailLevel === ReportDetailLevel.EXECUTIVE) {
        // Show only critical/high priority items
        itemsToShow = items.filter((item: any) => 
          item.priority === 'CRITICAL' || item.priority === 'HIGH'
        ).slice(0, 3)
      } else if (detailLevel === ReportDetailLevel.DETAILED) {
        // Show top 10 items per status
        itemsToShow = items.slice(0, 10)
      }

      // Generate item entries
      for (const item of itemsToShow) {
        const hasBlockers = item.blockers && item.blockers.length > 0
        const blockerIndicator = hasBlockers ? ' 🚫' : ''
        const endDate = new Date(item.estimatedEndDate).toLocaleDateString()
        
        if (format === 'MARKDOWN') {
          section += `- **${item.title}**${blockerIndicator}\n`
          if (detailLevel === ReportDetailLevel.COMPLETE) {
            section += `  - Priority: ${item.priority}\n`
            section += `  - Owner: ${item.owner.name}\n`
            section += `  - Due: ${endDate}\n`
            if (item.description && item.description.trim()) {
              section += `  - Description: ${item.description.substring(0, 100)}${item.description.length > 100 ? '...' : ''}\n`
            }
          } else if (detailLevel === ReportDetailLevel.DETAILED) {
            section += `  - Priority: ${item.priority} | Owner: ${item.owner.name} | Due: ${endDate}\n`
          }
        } else {
          section += `  - ${item.title}${blockerIndicator}\n`
          if (detailLevel === ReportDetailLevel.COMPLETE) {
            section += `    Priority: ${item.priority}, Owner: ${item.owner.name}, Due: ${endDate}\n`
            if (item.description && item.description.trim()) {
              section += `    Description: ${item.description.substring(0, 100)}${item.description.length > 100 ? '...' : ''}\n`
            }
          } else if (detailLevel === ReportDetailLevel.DETAILED) {
            section += `    Priority: ${item.priority}, Owner: ${item.owner.name}, Due: ${endDate}\n`
          }
        }
      }

      // Add count if items were filtered
      if (itemsToShow.length < items.length) {
        const remaining = items.length - itemsToShow.length
        section += format === 'MARKDOWN' 
          ? `\n*...and ${remaining} more*\n\n`
          : `\n  ...and ${remaining} more\n\n`
      } else {
        section += '\n'
      }
    }

    return section
  }

  /**
   * Generate blockers section
   * Requirements: 11.2, 11.5
   */
  private generateBlockersSection(blockers: any[], detailLevel: ReportDetailLevel, format: string): string {
    if (blockers.length === 0) {
      return format === 'MARKDOWN' 
        ? '## Active Blockers\n\nNo active blockers.\n\n'
        : 'ACTIVE BLOCKERS\n\nNo active blockers.\n\n'
    }

    let section = format === 'MARKDOWN' ? '## Active Blockers\n\n' : 'ACTIVE BLOCKERS\n\n'

    // Filter blockers based on detail level
    let blockersToShow = blockers
    if (detailLevel === ReportDetailLevel.EXECUTIVE) {
      // Show only critical blockers
      blockersToShow = blockers.filter((b: any) => b.severity === BlockerSeverity.CRITICAL)
    } else if (detailLevel === ReportDetailLevel.DETAILED) {
      // Show top 10 blockers
      blockersToShow = blockers.slice(0, 10)
    }

    for (const blocker of blockersToShow) {
      const startDate = new Date(blocker.startDate).toLocaleDateString()
      const daysBlocked = Math.floor((Date.now() - new Date(blocker.startDate).getTime()) / (1000 * 60 * 60 * 24))
      
      if (format === 'MARKDOWN') {
        section += `### ${blocker.severity} - ${blocker.workItem.title}\n\n`
        section += `**Blocked by:** ${blocker.blockedBy}\n`
        section += `**Duration:** ${daysBlocked} days (since ${startDate})\n`
        if (detailLevel === ReportDetailLevel.COMPLETE) {
          section += `**Description:** ${blocker.description}\n`
        }
        section += '\n'
      } else {
        section += `${blocker.severity} - ${blocker.workItem.title}\n`
        section += `  Blocked by: ${blocker.blockedBy}\n`
        section += `  Duration: ${daysBlocked} days (since ${startDate})\n`
        if (detailLevel === ReportDetailLevel.COMPLETE) {
          section += `  Description: ${blocker.description}\n`
        }
        section += '\n'
      }
    }

    // Add count if blockers were filtered
    if (blockersToShow.length < blockers.length) {
      const remaining = blockers.length - blockersToShow.length
      section += format === 'MARKDOWN'
        ? `*...and ${remaining} more blockers*\n\n`
        : `...and ${remaining} more blockers\n\n`
    }

    return section
  }

  /**
   * Generate risks section
   * Requirements: 11.2, 11.5
   */
  private generateRisksSection(risks: any[], detailLevel: ReportDetailLevel, format: string): string {
    if (risks.length === 0) {
      return format === 'MARKDOWN'
        ? '## Risks\n\nNo active risks.\n\n'
        : 'RISKS\n\nNo active risks.\n\n'
    }

    let section = format === 'MARKDOWN' ? '## Risks\n\n' : 'RISKS\n\n'

    // Filter risks based on detail level
    let risksToShow = risks
    if (detailLevel === ReportDetailLevel.EXECUTIVE) {
      // Show only high/critical risks
      risksToShow = risks.filter((r: any) => 
        r.riskLevel === RiskLevel.HIGH || r.riskLevel === RiskLevel.CRITICAL
      )
    } else if (detailLevel === ReportDetailLevel.DETAILED) {
      // Show top 10 risks
      risksToShow = risks.slice(0, 10)
    }

    for (const risk of risksToShow) {
      if (format === 'MARKDOWN') {
        section += `### ${risk.riskLevel} - ${risk.description.substring(0, 60)}${risk.description.length > 60 ? '...' : ''}\n\n`
        section += `**Status:** ${risk.status}\n`
        section += `**Owner:** ${risk.owner.name}\n`
        section += `**Probability:** ${risk.probability}/5 | **Impact:** ${risk.impact}/5\n`
        if (detailLevel === ReportDetailLevel.COMPLETE && risk.mitigationPlan) {
          section += `**Mitigation Plan:** ${risk.mitigationPlan}\n`
        }
        section += '\n'
      } else {
        section += `${risk.riskLevel} - ${risk.description.substring(0, 60)}${risk.description.length > 60 ? '...' : ''}\n`
        section += `  Status: ${risk.status}\n`
        section += `  Owner: ${risk.owner.name}\n`
        section += `  Probability: ${risk.probability}/5, Impact: ${risk.impact}/5\n`
        if (detailLevel === ReportDetailLevel.COMPLETE && risk.mitigationPlan) {
          section += `  Mitigation Plan: ${risk.mitigationPlan}\n`
        }
        section += '\n'
      }
    }

    // Add count if risks were filtered
    if (risksToShow.length < risks.length) {
      const remaining = risks.length - risksToShow.length
      section += format === 'MARKDOWN'
        ? `*...and ${remaining} more risks*\n\n`
        : `...and ${remaining} more risks\n\n`
    }

    return section
  }

  /**
   * Generate agreements section
   * Requirements: 11.2, 11.5
   */
  private generateAgreementsSection(agreements: any[], detailLevel: ReportDetailLevel, format: string): string {
    if (agreements.length === 0) {
      return format === 'MARKDOWN'
        ? '## Agreements\n\nNo agreements recorded.\n\n'
        : 'AGREEMENTS\n\nNo agreements recorded.\n\n'
    }

    let section = format === 'MARKDOWN' ? '## Agreements\n\n' : 'AGREEMENTS\n\n'

    // Filter agreements based on detail level
    let agreementsToShow = agreements
    if (detailLevel === ReportDetailLevel.EXECUTIVE) {
      // Show only active agreements
      agreementsToShow = agreements.filter((a: any) => 
        a.status === AgreementStatus.PENDING || a.status === AgreementStatus.IN_PROGRESS
      ).slice(0, 5)
    } else if (detailLevel === ReportDetailLevel.DETAILED) {
      // Show top 10 agreements
      agreementsToShow = agreements.slice(0, 10)
    }

    for (const agreement of agreementsToShow) {
      const agreementDate = new Date(agreement.agreementDate).toLocaleDateString()
      
      if (format === 'MARKDOWN') {
        section += `### ${agreement.description.substring(0, 60)}${agreement.description.length > 60 ? '...' : ''}\n\n`
        section += `**Status:** ${agreement.status}\n`
        section += `**Date:** ${agreementDate}\n`
        section += `**Participants:** ${agreement.participants}\n`
        section += `**Created by:** ${agreement.createdBy.name}\n`
        
        if (agreement.workItems && agreement.workItems.length > 0) {
          section += `**Linked Work Items:** ${agreement.workItems.length}\n`
          if (detailLevel === ReportDetailLevel.COMPLETE) {
            for (const link of agreement.workItems) {
              section += `  - ${link.workItem.title} (${link.workItem.status})\n`
            }
          }
        }
        
        if (detailLevel === ReportDetailLevel.COMPLETE && agreement.notes && agreement.notes.length > 0) {
          section += `**Progress Notes:** ${agreement.notes.length}\n`
          for (const note of agreement.notes.slice(0, 3)) {
            const noteDate = new Date(note.createdAt).toLocaleDateString()
            section += `  - ${noteDate}: ${note.note.substring(0, 100)}${note.note.length > 100 ? '...' : ''}\n`
          }
        }
        section += '\n'
      } else {
        section += `${agreement.description.substring(0, 60)}${agreement.description.length > 60 ? '...' : ''}\n`
        section += `  Status: ${agreement.status}\n`
        section += `  Date: ${agreementDate}\n`
        section += `  Participants: ${agreement.participants}\n`
        section += `  Created by: ${agreement.createdBy.name}\n`
        
        if (agreement.workItems && agreement.workItems.length > 0) {
          section += `  Linked Work Items: ${agreement.workItems.length}\n`
          if (detailLevel === ReportDetailLevel.COMPLETE) {
            for (const link of agreement.workItems) {
              section += `    - ${link.workItem.title} (${link.workItem.status})\n`
            }
          }
        }
        
        if (detailLevel === ReportDetailLevel.COMPLETE && agreement.notes && agreement.notes.length > 0) {
          section += `  Progress Notes: ${agreement.notes.length}\n`
          for (const note of agreement.notes.slice(0, 3)) {
            const noteDate = new Date(note.createdAt).toLocaleDateString()
            section += `    - ${noteDate}: ${note.note.substring(0, 100)}${note.note.length > 100 ? '...' : ''}\n`
          }
        }
        section += '\n'
      }
    }

    // Add count if agreements were filtered
    if (agreementsToShow.length < agreements.length) {
      const remaining = agreements.length - agreementsToShow.length
      section += format === 'MARKDOWN'
        ? `*...and ${remaining} more agreements*\n\n`
        : `...and ${remaining} more agreements\n\n`
    }

    return section
  }

  /**
   * Generate notification message for critical blockers and high risks
   * Requirements: 12.1, 12.3
   * 
   * Creates a notification message with:
   * - Subject line based on type and severity
   * - Body with key information (description, project, owner, etc.)
   * - Priority based on severity/risk level (CRITICAL/HIGH = high priority)
   * - Format suitable for email or messaging platforms
   */
  async generateNotificationMessage(
    entityType: 'blocker' | 'risk',
    entityId: string,
    locale: string = 'es'
  ): Promise<NotificationMessage> {
    if (entityType === 'blocker') {
      return this.generateBlockerNotification(entityId, locale)
    } else {
      return this.generateRiskNotification(entityId, locale)
    }
  }

  /**
   * Generate notification for a blocker
   */
  private async generateBlockerNotification(blockerId: string, locale: string = 'es'): Promise<NotificationMessage> {
    const blocker = await prisma.blocker.findUnique({
      where: { id: blockerId },
      include: {
        workItem: {
          select: {
            id: true,
            title: true,
            owner: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            client: true,
          },
        },
      },
    })

    if (!blocker) {
      throw new NotFoundError('Blocker')
    }

    // Calculate duration
    const daysBlocked = Math.floor(
      (Date.now() - new Date(blocker.startDate).getTime()) / (1000 * 60 * 60 * 24)
    )

    // Determine priority based on severity
    const priority = blocker.severity === BlockerSeverity.CRITICAL || blocker.severity === BlockerSeverity.HIGH
      ? 'HIGH'
      : 'MEDIUM'

    // Translations
    const translations = {
      es: {
        alertTitle: 'Alerta de Bloqueador',
        notificationTitle: 'NOTIFICACIÓN DE BLOQUEADOR',
        severity: 'Severidad',
        project: 'Proyecto',
        client: 'Cliente',
        workItem: 'Elemento de Trabajo',
        owner: 'Responsable',
        blockedBy: 'Bloqueado Por',
        duration: 'Duración',
        days: 'días',
        since: 'desde',
        description: 'Descripción',
        footer: 'Este bloqueador requiere atención inmediata para desbloquear el progreso del elemento de trabajo.'
      },
      pt: {
        alertTitle: 'Alerta de Bloqueador',
        notificationTitle: 'NOTIFICAÇÃO DE BLOQUEADOR',
        severity: 'Severidade',
        project: 'Projeto',
        client: 'Cliente',
        workItem: 'Item de Trabalho',
        owner: 'Responsável',
        blockedBy: 'Bloqueado Por',
        duration: 'Duração',
        days: 'dias',
        since: 'desde',
        description: 'Descrição',
        footer: 'Este bloqueador requer atenção imediata para desbloquear o progresso do item de trabalho.'
      }
    }

    const t = translations[locale as 'es' | 'pt'] || translations.es

    // Generate subject
    const subject = `[${blocker.severity}] ${t.alertTitle}: ${blocker.project.name} - ${blocker.workItem.title}`

    // Generate body
    const body = `${t.notificationTitle}

${t.severity}: ${blocker.severity}
${t.project}: ${blocker.project.name}
${t.client}: ${blocker.project.client}
${t.workItem}: ${blocker.workItem.title}
${t.owner}: ${blocker.workItem.owner.name}

${t.blockedBy}: ${blocker.blockedBy}
${t.duration}: ${daysBlocked} ${t.days} (${t.since} ${new Date(blocker.startDate).toLocaleDateString()})

${t.description}:
${blocker.description}

${t.footer}`

    return {
      subject,
      body,
      priority: priority as 'LOW' | 'MEDIUM' | 'HIGH',
    }
  }

  /**
   * Generate notification for a risk
   */
  private async generateRiskNotification(riskId: string, locale: string = 'es'): Promise<NotificationMessage> {
    const risk = await prisma.risk.findUnique({
      where: { id: riskId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            client: true,
          },
        },
      },
    })

    if (!risk) {
      throw new NotFoundError('Risk')
    }

    // Determine priority based on risk level
    const priority = risk.riskLevel === RiskLevel.CRITICAL || risk.riskLevel === RiskLevel.HIGH
      ? 'HIGH'
      : 'MEDIUM'

    // Translations
    const translations = {
      es: {
        alertTitle: 'Alerta de Riesgo',
        notificationTitle: 'NOTIFICACIÓN DE RIESGO',
        riskLevel: 'Nivel de Riesgo',
        project: 'Proyecto',
        client: 'Cliente',
        owner: 'Responsable',
        status: 'Estado',
        probability: 'Probabilidad',
        impact: 'Impacto',
        description: 'Descripción',
        mitigationPlan: 'Plan de Mitigación',
        noMitigationPlan: 'No se ha definido un plan de mitigación',
        footer: 'Este riesgo requiere monitoreo y posibles acciones para prevenir un impacto negativo en el proyecto.'
      },
      pt: {
        alertTitle: 'Alerta de Risco',
        notificationTitle: 'NOTIFICAÇÃO DE RISCO',
        riskLevel: 'Nível de Risco',
        project: 'Projeto',
        client: 'Cliente',
        owner: 'Responsável',
        status: 'Status',
        probability: 'Probabilidade',
        impact: 'Impacto',
        description: 'Descrição',
        mitigationPlan: 'Plano de Mitigação',
        noMitigationPlan: 'Nenhum plano de mitigação definido',
        footer: 'Este risco requer monitoramento e possíveis ações para prevenir um impacto negativo no projeto.'
      }
    }

    const t = translations[locale as 'es' | 'pt'] || translations.es

    // Generate subject
    const subject = `[${risk.riskLevel}] ${t.alertTitle}: ${risk.project.name}`

    // Generate body
    const body = `${t.notificationTitle}

${t.riskLevel}: ${risk.riskLevel}
${t.project}: ${risk.project.name}
${t.client}: ${risk.project.client}
${t.owner}: ${risk.owner.name}
${t.status}: ${risk.status}

${t.probability}: ${risk.probability}/5
${t.impact}: ${risk.impact}/5

${t.description}:
${risk.description}

${t.mitigationPlan}:
${risk.mitigationPlan || t.noMitigationPlan}

${t.footer}`

    return {
      subject,
      body,
      priority: priority as 'LOW' | 'MEDIUM' | 'HIGH',
    }
  }

    /**
     * Format markdown content for email
     * Requirements: 12.2
     *
     * Converts markdown to plain text with email-friendly formatting:
     * - Headers (# ## ###) converted to uppercase with spacing
     * - Bold text (**text**) converted to uppercase
     * - Lists (- item) converted with proper indentation
     * - Proper spacing between sections
     * - Clean plain text suitable for email bodies
     */
    async formatForEmail(content: string): Promise<string> {
      let formatted = content

      // Convert markdown headers to plain text with proper spacing
      // H1: # Header -> HEADER with double line breaks
      formatted = formatted.replace(/^# (.+)$/gm, (match, text) => {
        return `\n\n${text.toUpperCase()}\n${'='.repeat(text.length)}\n`
      })

      // H2: ## Header -> HEADER with single line break
      formatted = formatted.replace(/^## (.+)$/gm, (match, text) => {
        return `\n\n${text.toUpperCase()}\n${'-'.repeat(text.length)}\n`
      })

      // H3: ### Header -> Header: with spacing
      formatted = formatted.replace(/^### (.+)$/gm, (match, text) => {
        return `\n\n${text}:\n`
      })

      // Convert bold text (**text**) to uppercase
      formatted = formatted.replace(/\*\*(.+?)\*\*/g, (match, text) => {
        return text.toUpperCase()
      })

      // Convert markdown lists to plain text with proper indentation
      // Handle nested lists (2 spaces = level 1, 4 spaces = level 2, etc.)
      formatted = formatted.replace(/^(\s*)- (.+)$/gm, (match, indent, text) => {
        const level = indent.length / 2
        const indentation = '  '.repeat(level)
        return `${indentation}• ${text}`
      })

      // Convert markdown horizontal rules to plain text separators
      // Only match exactly 3 or more dashes (not underlines from headers)
      formatted = formatted.replace(/^---$/gm, '\n' + '='.repeat(80) + '\n')

      // Clean up excessive blank lines (more than 2 consecutive)
      formatted = formatted.replace(/\n{3,}/g, '\n\n')

      // Trim leading and trailing whitespace
      formatted = formatted.trim()

      // Ensure proper spacing at the end
      formatted += '\n'

      return formatted
    }
}

export const exportService = new ExportService()

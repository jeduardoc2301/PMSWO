import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ExportService } from '../export.service'
import prisma from '@/lib/prisma'
import { 
  ReportDetailLevel, 
  WorkItemStatus, 
  BlockerSeverity, 
  RiskLevel,
  AgreementStatus,
  ProjectStatus,
  WorkItemPriority,
  RiskStatus
} from '@/types'
import { NotFoundError } from '@/lib/errors'

vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUnique: vi.fn(),
    },
    blocker: {
      findUnique: vi.fn(),
    },
    risk: {
      findUnique: vi.fn(),
    },
  },
}))

describe('ExportService', () => {
  let exportService: ExportService

  beforeEach(() => {
    exportService = new ExportService()
    vi.clearAllMocks()
  })

  describe('exportProject', () => {
    const mockProject = {
      id: 'project-1',
      name: 'Test Project',
      description: 'A test project for export',
      client: 'Test Client',
      status: ProjectStatus.ACTIVE,
      startDate: new Date('2024-01-01'),
      estimatedEndDate: new Date('2024-12-31'),
      organization: {
        id: 'org-1',
        name: 'Test Organization',
      },
      workItems: [
        {
          id: 'wi-1',
          title: 'Critical Work Item',
          description: 'This is a critical work item',
          status: WorkItemStatus.IN_PROGRESS,
          priority: WorkItemPriority.CRITICAL,
          estimatedEndDate: new Date('2024-06-01'),
          owner: {
            id: 'user-1',
            name: 'John Doe',
          },
          blockers: [],
        },
        {
          id: 'wi-2',
          title: 'Completed Work Item',
          description: 'This work item is done',
          status: WorkItemStatus.DONE,
          priority: WorkItemPriority.MEDIUM,
          estimatedEndDate: new Date('2024-05-01'),
          owner: {
            id: 'user-2',
            name: 'Jane Smith',
          },
          blockers: [],
        },
      ],
      blockers: [
        {
          id: 'blocker-1',
          description: 'Critical blocker',
          blockedBy: 'External dependency',
          severity: BlockerSeverity.CRITICAL,
          startDate: new Date('2024-03-01'),
          workItem: {
            id: 'wi-1',
            title: 'Critical Work Item',
          },
        },
      ],
      risks: [
        {
          id: 'risk-1',
          description: 'High risk of delay',
          riskLevel: RiskLevel.HIGH,
          status: 'MONITORING',
          probability: 4,
          impact: 4,
          mitigationPlan: 'Monitor closely and escalate if needed',
          owner: {
            id: 'user-1',
            name: 'John Doe',
          },
        },
      ],
      agreements: [
        {
          id: 'agreement-1',
          description: 'Agreement to deliver feature X',
          status: AgreementStatus.IN_PROGRESS,
          agreementDate: new Date('2024-02-01'),
          participants: 'Team A, Team B',
          createdBy: {
            id: 'user-1',
            name: 'John Doe',
          },
          workItems: [
            {
              workItem: {
                id: 'wi-1',
                title: 'Critical Work Item',
                status: WorkItemStatus.IN_PROGRESS,
              },
            },
          ],
          notes: [
            {
              id: 'note-1',
              note: 'Progress update: 50% complete',
              createdAt: new Date('2024-03-15'),
            },
          ],
        },
      ],
    }

    it('should throw NotFoundError if project does not exist', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null)

      const options = {
        detailLevel: ReportDetailLevel.EXECUTIVE,
        includeWorkItems: true,
        includeBlockers: true,
        includeRisks: true,
        includeAgreements: true,
        useAINarrative: false,
      }

      await expect(exportService.exportProject('non-existent', options)).rejects.toThrow('Project not found')
    })

    it('should generate export with all sections when all options are enabled', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.COMPLETE,
        includeWorkItems: true,
        includeBlockers: true,
        includeRisks: true,
        includeAgreements: true,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result).toBeDefined()
      expect(result.format).toBe('MARKDOWN')
      expect(result.content).toContain('Test Project')
      expect(result.content).toContain('Executive Summary')
      expect(result.content).toContain('Work Items')
      expect(result.content).toContain('Active Blockers')
      expect(result.content).toContain('Risks')
      expect(result.content).toContain('Agreements')
      expect(result.generatedAt).toBeInstanceOf(Date)
    })

    it('should include project header with basic information', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.EXECUTIVE,
        includeWorkItems: false,
        includeBlockers: false,
        includeRisks: false,
        includeAgreements: false,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('Test Project')
      expect(result.content).toContain('Test Client')
      expect(result.content).toContain('ACTIVE')
      expect(result.content).toContain('Test Organization')
    })

    it('should include executive summary with key metrics', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.EXECUTIVE,
        includeWorkItems: true,
        includeBlockers: true,
        includeRisks: true,
        includeAgreements: true,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('Executive Summary')
      expect(result.content).toContain('Completion Rate')
      expect(result.content).toContain('50%') // 1 of 2 work items completed
      expect(result.content).toContain('Active Blockers')
      expect(result.content).toContain('Active Risks')
      expect(result.content).toContain('Active Agreements')
    })

    it('should filter work items by priority in EXECUTIVE detail level', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.EXECUTIVE,
        includeWorkItems: true,
        includeBlockers: false,
        includeRisks: false,
        includeAgreements: false,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      // Should include critical work item
      expect(result.content).toContain('Critical Work Item')
      // Should not include medium priority completed item in executive summary
      // (only high/critical items shown in executive level)
    })

    it('should show all work items in COMPLETE detail level', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.COMPLETE,
        includeWorkItems: true,
        includeBlockers: false,
        includeRisks: false,
        includeAgreements: false,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('Critical Work Item')
      expect(result.content).toContain('Completed Work Item')
      expect(result.content).toContain('John Doe')
      expect(result.content).toContain('Jane Smith')
    })

    it('should only show critical blockers in EXECUTIVE detail level', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.EXECUTIVE,
        includeWorkItems: false,
        includeBlockers: true,
        includeRisks: false,
        includeAgreements: false,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('Active Blockers')
      expect(result.content).toContain('CRITICAL')
      expect(result.content).toContain('External dependency')
    })

    it('should only show high/critical risks in EXECUTIVE detail level', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.EXECUTIVE,
        includeWorkItems: false,
        includeBlockers: false,
        includeRisks: true,
        includeAgreements: false,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('Risks')
      expect(result.content).toContain('HIGH')
      expect(result.content).toContain('High risk of delay')
    })

    it('should only show active agreements in EXECUTIVE detail level', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.EXECUTIVE,
        includeWorkItems: false,
        includeBlockers: false,
        includeRisks: false,
        includeAgreements: true,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('Agreements')
      expect(result.content).toContain('Agreement to deliver feature X')
      expect(result.content).toContain('IN_PROGRESS')
    })

    it('should include AI narrative placeholder when useAINarrative is true', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.EXECUTIVE,
        includeWorkItems: false,
        includeBlockers: false,
        includeRisks: false,
        includeAgreements: false,
        useAINarrative: true,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('AI Analysis')
      expect(result.content).toContain('AI-generated narrative')
    })

    it('should not include sections when options are disabled', async () => {
      const projectWithoutRelations = {
        ...mockProject,
        workItems: [],
        blockers: [],
        risks: [],
        agreements: [],
      }
      
      vi.mocked(prisma.project.findUnique).mockResolvedValue(projectWithoutRelations as any)

      const options = {
        detailLevel: ReportDetailLevel.COMPLETE,
        includeWorkItems: false,
        includeBlockers: false,
        includeRisks: false,
        includeAgreements: false,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      // Should only have header and executive summary
      expect(result.content).toContain('Test Project')
      expect(result.content).toContain('Executive Summary')
      // Should not have dedicated sections for these (only metrics in summary)
      expect(result.content).not.toContain('## Work Items')
      expect(result.content).not.toContain('## Active Blockers')
      expect(result.content).not.toContain('## Risks')
      expect(result.content).not.toContain('## Agreements')
    })

    it('should handle project with no work items', async () => {
      const projectWithNoWorkItems = {
        ...mockProject,
        workItems: [],
        blockers: [],
        risks: [],
        agreements: [],
      }
      
      vi.mocked(prisma.project.findUnique).mockResolvedValue(projectWithNoWorkItems as any)

      const options = {
        detailLevel: ReportDetailLevel.COMPLETE,
        includeWorkItems: true,
        includeBlockers: false,
        includeRisks: false,
        includeAgreements: false,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('0% (0/0 work items)')
    })

    it('should handle project with no active blockers', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        ...mockProject,
        blockers: [],
      } as any)

      const options = {
        detailLevel: ReportDetailLevel.COMPLETE,
        includeWorkItems: false,
        includeBlockers: true,
        includeRisks: false,
        includeAgreements: false,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('No active blockers')
    })

    it('should handle project with no active risks', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        ...mockProject,
        risks: [],
      } as any)

      const options = {
        detailLevel: ReportDetailLevel.COMPLETE,
        includeWorkItems: false,
        includeBlockers: false,
        includeRisks: true,
        includeAgreements: false,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('No active risks')
    })

    it('should handle project with no agreements', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        ...mockProject,
        agreements: [],
      } as any)

      const options = {
        detailLevel: ReportDetailLevel.COMPLETE,
        includeWorkItems: false,
        includeBlockers: false,
        includeRisks: false,
        includeAgreements: true,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('No agreements recorded')
    })

    it('should group work items by status', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.COMPLETE,
        includeWorkItems: true,
        includeBlockers: false,
        includeRisks: false,
        includeAgreements: false,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      // Should have sections for different statuses
      expect(result.content).toContain('IN_PROGRESS')
      expect(result.content).toContain('DONE')
    })

    it('should show blocker duration in days', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.COMPLETE,
        includeWorkItems: false,
        includeBlockers: true,
        includeRisks: false,
        includeAgreements: false,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('days')
      expect(result.content).toContain('Duration')
    })

    it('should show risk probability and impact', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.COMPLETE,
        includeWorkItems: false,
        includeBlockers: false,
        includeRisks: true,
        includeAgreements: false,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('Probability')
      expect(result.content).toContain('Impact')
      expect(result.content).toContain('4/5')
    })

    it('should show linked work items for agreements in COMPLETE detail level', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.COMPLETE,
        includeWorkItems: false,
        includeBlockers: false,
        includeRisks: false,
        includeAgreements: true,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('Linked Work Items')
      expect(result.content).toContain('Critical Work Item')
    })

    it('should show progress notes for agreements in COMPLETE detail level', async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.COMPLETE,
        includeWorkItems: false,
        includeBlockers: false,
        includeRisks: false,
        includeAgreements: true,
        useAINarrative: false,
      }

      const result = await exportService.exportProject('project-1', options)

      expect(result.content).toContain('Progress Notes')
      expect(result.content).toContain('50% complete')
    })
  })

  describe('generateNotificationMessage', () => {
    const mockBlocker = {
      id: 'blocker-1',
      description: 'Critical blocker preventing deployment',
      blockedBy: 'External API dependency',
      severity: BlockerSeverity.CRITICAL,
      startDate: new Date('2024-03-01'),
      workItem: {
        id: 'wi-1',
        title: 'Deploy to production',
        owner: {
          id: 'user-1',
          name: 'John Doe',
        },
      },
      project: {
        id: 'project-1',
        name: 'Test Project',
        client: 'Test Client',
      },
    }

    const mockRisk = {
      id: 'risk-1',
      description: 'High risk of missing deadline due to resource constraints',
      riskLevel: RiskLevel.HIGH,
      status: RiskStatus.MONITORING,
      probability: 4,
      impact: 5,
      mitigationPlan: 'Add additional resources and extend timeline',
      owner: {
        id: 'user-1',
        name: 'John Doe',
      },
      project: {
        id: 'project-1',
        name: 'Test Project',
        client: 'Test Client',
      },
    }

    describe('blocker notifications', () => {
      it('should generate notification for critical blocker', async () => {
        vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mockBlocker as any)

        const result = await exportService.generateNotificationMessage('blocker', 'blocker-1')

        expect(result).toBeDefined()
        expect(result.subject).toContain('[CRITICAL]')
        expect(result.subject).toContain('Blocker Alert')
        expect(result.subject).toContain('Test Project')
        expect(result.subject).toContain('Deploy to production')
        expect(result.body).toContain('BLOCKER NOTIFICATION')
        expect(result.body).toContain('Severity: CRITICAL')
        expect(result.body).toContain('Project: Test Project')
        expect(result.body).toContain('Client: Test Client')
        expect(result.body).toContain('Work Item: Deploy to production')
        expect(result.body).toContain('Owner: John Doe')
        expect(result.body).toContain('Blocked By: External API dependency')
        expect(result.body).toContain('Duration:')
        expect(result.body).toContain('days')
        expect(result.body).toContain('Critical blocker preventing deployment')
        expect(result.priority).toBe('HIGH')
      })

      it('should generate notification for high severity blocker', async () => {
        const highBlocker = {
          ...mockBlocker,
          severity: BlockerSeverity.HIGH,
        }
        vi.mocked(prisma.blocker.findUnique).mockResolvedValue(highBlocker as any)

        const result = await exportService.generateNotificationMessage('blocker', 'blocker-1')

        expect(result.subject).toContain('[HIGH]')
        expect(result.priority).toBe('HIGH')
      })

      it('should generate notification for medium severity blocker', async () => {
        const mediumBlocker = {
          ...mockBlocker,
          severity: BlockerSeverity.MEDIUM,
        }
        vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mediumBlocker as any)

        const result = await exportService.generateNotificationMessage('blocker', 'blocker-1')

        expect(result.subject).toContain('[MEDIUM]')
        expect(result.priority).toBe('MEDIUM')
      })

      it('should calculate blocker duration correctly', async () => {
        const recentBlocker = {
          ...mockBlocker,
          startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        }
        vi.mocked(prisma.blocker.findUnique).mockResolvedValue(recentBlocker as any)

        const result = await exportService.generateNotificationMessage('blocker', 'blocker-1')

        expect(result.body).toContain('Duration: 5 days')
      })

      it('should throw NotFoundError if blocker does not exist', async () => {
        vi.mocked(prisma.blocker.findUnique).mockResolvedValue(null)

        await expect(
          exportService.generateNotificationMessage('blocker', 'non-existent')
        ).rejects.toThrow('Blocker not found')
      })
    })

    describe('risk notifications', () => {
      it('should generate notification for critical risk', async () => {
        const criticalRisk = {
          ...mockRisk,
          riskLevel: RiskLevel.CRITICAL,
        }
        vi.mocked(prisma.risk.findUnique).mockResolvedValue(criticalRisk as any)

        const result = await exportService.generateNotificationMessage('risk', 'risk-1')

        expect(result).toBeDefined()
        expect(result.subject).toContain('[CRITICAL]')
        expect(result.subject).toContain('Risk Alert')
        expect(result.subject).toContain('Test Project')
        expect(result.body).toContain('RISK NOTIFICATION')
        expect(result.body).toContain('Risk Level: CRITICAL')
        expect(result.body).toContain('Project: Test Project')
        expect(result.body).toContain('Client: Test Client')
        expect(result.body).toContain('Owner: John Doe')
        expect(result.body).toContain('Status: MONITORING')
        expect(result.body).toContain('Probability: 4/5')
        expect(result.body).toContain('Impact: 5/5')
        expect(result.body).toContain('High risk of missing deadline')
        expect(result.body).toContain('Add additional resources')
        expect(result.priority).toBe('HIGH')
      })

      it('should generate notification for high risk', async () => {
        vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)

        const result = await exportService.generateNotificationMessage('risk', 'risk-1')

        expect(result.subject).toContain('[HIGH]')
        expect(result.priority).toBe('HIGH')
      })

      it('should generate notification for medium risk', async () => {
        const mediumRisk = {
          ...mockRisk,
          riskLevel: RiskLevel.MEDIUM,
        }
        vi.mocked(prisma.risk.findUnique).mockResolvedValue(mediumRisk as any)

        const result = await exportService.generateNotificationMessage('risk', 'risk-1')

        expect(result.subject).toContain('[MEDIUM]')
        expect(result.priority).toBe('MEDIUM')
      })

      it('should handle risk with no mitigation plan', async () => {
        const riskWithoutPlan = {
          ...mockRisk,
          mitigationPlan: null,
        }
        vi.mocked(prisma.risk.findUnique).mockResolvedValue(riskWithoutPlan as any)

        const result = await exportService.generateNotificationMessage('risk', 'risk-1')

        expect(result.body).toContain('No mitigation plan defined')
      })

      it('should throw NotFoundError if risk does not exist', async () => {
        vi.mocked(prisma.risk.findUnique).mockResolvedValue(null)

        await expect(
          exportService.generateNotificationMessage('risk', 'non-existent')
        ).rejects.toThrow('Risk not found')
      })
    })

    describe('notification format', () => {
      it('should format blocker notification for email/messaging', async () => {
        vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mockBlocker as any)

        const result = await exportService.generateNotificationMessage('blocker', 'blocker-1')

        // Check that the notification has clear structure
        expect(result.subject).toBeTruthy()
        expect(result.subject.length).toBeGreaterThan(0)
        expect(result.body).toBeTruthy()
        expect(result.body.length).toBeGreaterThan(0)
        expect(result.priority).toMatch(/^(LOW|MEDIUM|HIGH)$/)
        
        // Check that body has proper sections
        expect(result.body).toContain('Severity:')
        expect(result.body).toContain('Project:')
        expect(result.body).toContain('Description:')
      })

      it('should format risk notification for email/messaging', async () => {
        vi.mocked(prisma.risk.findUnique).mockResolvedValue(mockRisk as any)

        const result = await exportService.generateNotificationMessage('risk', 'risk-1')

        // Check that the notification has clear structure
        expect(result.subject).toBeTruthy()
        expect(result.subject.length).toBeGreaterThan(0)
        expect(result.body).toBeTruthy()
        expect(result.body.length).toBeGreaterThan(0)
        expect(result.priority).toMatch(/^(LOW|MEDIUM|HIGH)$/)
        
        // Check that body has proper sections
        expect(result.body).toContain('Risk Level:')
        expect(result.body).toContain('Project:')
        expect(result.body).toContain('Description:')
        expect(result.body).toContain('Mitigation Plan:')
      })
    })
  })

  describe('formatForEmail', () => {
    it('should convert H1 headers to uppercase with underline', async () => {
      const markdown = '# Main Header'
      const result = await exportService.formatForEmail(markdown)

      expect(result).toContain('MAIN HEADER')
      expect(result).toContain('===========')
    })

    it('should convert H2 headers to uppercase with dashed underline', async () => {
      const markdown = '## Section Header'
      const result = await exportService.formatForEmail(markdown)

      expect(result).toContain('SECTION HEADER')
      // H2 headers should have dashes matching the length of the text
      const lines = result.split('\n').filter(line => line.trim() !== '')
      const headerIndex = lines.findIndex(line => line.includes('SECTION HEADER'))
      expect(headerIndex).toBeGreaterThanOrEqual(0)
      // The next non-empty line should be dashes
      if (headerIndex >= 0 && headerIndex < lines.length - 1) {
        expect(lines[headerIndex + 1]).toMatch(/^-+$/)
      }
    })

    it('should convert H3 headers to title case with colon', async () => {
      const markdown = '### Subsection Header'
      const result = await exportService.formatForEmail(markdown)

      expect(result).toContain('Subsection Header:')
    })

    it('should convert bold text to uppercase', async () => {
      const markdown = 'This is **important** text'
      const result = await exportService.formatForEmail(markdown)

      expect(result).toContain('This is IMPORTANT text')
      expect(result).not.toContain('**')
    })

    it('should convert markdown lists to bullet points', async () => {
      const markdown = '- First item\n- Second item\n- Third item'
      const result = await exportService.formatForEmail(markdown)

      expect(result).toContain('• First item')
      expect(result).toContain('• Second item')
      expect(result).toContain('• Third item')
      expect(result).not.toContain('- ')
    })

    it('should handle nested lists with proper indentation', async () => {
      const markdown = '- Level 1\n  - Level 2\n    - Level 3'
      const result = await exportService.formatForEmail(markdown)

      expect(result).toContain('• Level 1')
      expect(result).toContain('  • Level 2')
      expect(result).toContain('    • Level 3')
    })

    it('should convert horizontal rules to separator lines', async () => {
      const markdown = 'Section 1\n\n---\n\nSection 2'
      const result = await exportService.formatForEmail(markdown)

      expect(result).toContain('='.repeat(80))
    })

    it('should clean up excessive blank lines', async () => {
      const markdown = 'Line 1\n\n\n\n\nLine 2'
      const result = await exportService.formatForEmail(markdown)

      // Should have at most 2 consecutive newlines
      expect(result).not.toContain('\n\n\n')
      expect(result).toContain('Line 1')
      expect(result).toContain('Line 2')
    })

    it('should trim leading and trailing whitespace', async () => {
      const markdown = '\n\n  Content  \n\n'
      const result = await exportService.formatForEmail(markdown)

      expect(result).toBe('Content\n')
    })

    it('should handle complex markdown with multiple elements', async () => {
      const markdown = `# Project Report

## Executive Summary

This is a **critical** project update.

### Key Metrics

- Completion: 75%
- Blockers: 2
  - Critical: 1
  - High: 1

---

## Next Steps

- Review blockers
- Update timeline`

      const result = await exportService.formatForEmail(markdown)

      // Check headers
      expect(result).toContain('PROJECT REPORT')
      expect(result).toContain('EXECUTIVE SUMMARY')
      expect(result).toContain('Key Metrics:')
      expect(result).toContain('NEXT STEPS') // H2 headers are converted to uppercase

      // Check bold text
      expect(result).toContain('CRITICAL')

      // Check lists
      expect(result).toContain('• Completion: 75%')
      expect(result).toContain('• Blockers: 2')
      expect(result).toContain('  • Critical: 1')
      expect(result).toContain('  • High: 1')
      expect(result).toContain('• Review blockers')
      expect(result).toContain('• Update timeline')

      // Check separator
      expect(result).toContain('='.repeat(80))

      // Should not contain markdown syntax
      expect(result).not.toContain('##')
      expect(result).not.toContain('**')
      // The horizontal rule should be converted to equals signs
      expect(result).toContain('='.repeat(80))
    })

    it('should handle empty content', async () => {
      const markdown = ''
      const result = await exportService.formatForEmail(markdown)

      expect(result).toBe('\n')
    })

    it('should handle content with no markdown', async () => {
      const markdown = 'Plain text content without any markdown'
      const result = await exportService.formatForEmail(markdown)

      expect(result).toBe('Plain text content without any markdown\n')
    })

    it('should preserve line breaks between sections', async () => {
      const markdown = '## Section 1\n\nContent 1\n\n## Section 2\n\nContent 2'
      const result = await exportService.formatForEmail(markdown)

      expect(result).toContain('SECTION 1')
      expect(result).toContain('Content 1')
      expect(result).toContain('SECTION 2')
      expect(result).toContain('Content 2')
      
      // Should have proper spacing
      const lines = result.split('\n')
      expect(lines.length).toBeGreaterThan(5)
    })

    it('should handle multiple bold text in same line', async () => {
      const markdown = 'This is **bold** and this is also **bold**'
      const result = await exportService.formatForEmail(markdown)

      expect(result).toBe('This is BOLD and this is also BOLD\n')
    })

    it('should format exported project content for email', async () => {
      // This test verifies that formatForEmail works with actual export output
      const mockProject = {
        id: 'project-1',
        name: 'Test Project',
        description: 'A test project',
        client: 'Test Client',
        status: ProjectStatus.ACTIVE,
        startDate: new Date('2024-01-01'),
        estimatedEndDate: new Date('2024-12-31'),
        organization: {
          id: 'org-1',
          name: 'Test Organization',
        },
        workItems: [],
        blockers: [],
        risks: [],
        agreements: [],
      }

      vi.mocked(prisma.project.findUnique).mockResolvedValue(mockProject as any)

      const options = {
        detailLevel: ReportDetailLevel.EXECUTIVE,
        includeWorkItems: false,
        includeBlockers: false,
        includeRisks: false,
        includeAgreements: false,
        useAINarrative: false,
      }

      const exportResult = await exportService.exportProject('project-1', options)
      const emailFormatted = await exportService.formatForEmail(exportResult.content)

      // Should convert markdown to plain text
      expect(emailFormatted).not.toContain('##')
      expect(emailFormatted).not.toContain('**')
      
      // Should contain uppercase headers
      expect(emailFormatted).toContain('PROJECT EXPORT: TEST PROJECT')
      expect(emailFormatted).toContain('EXECUTIVE SUMMARY')
      
      // Should have proper structure
      expect(emailFormatted).toContain('CLIENT: Test Client')
      expect(emailFormatted).toContain('STATUS: ACTIVE')
    })

    it('should format notification message for email', async () => {
      const mockBlocker = {
        id: 'blocker-1',
        description: 'Critical blocker',
        blockedBy: 'External dependency',
        severity: BlockerSeverity.CRITICAL,
        startDate: new Date('2024-03-01'),
        workItem: {
          id: 'wi-1',
          title: 'Deploy to production',
          owner: {
            id: 'user-1',
            name: 'John Doe',
          },
        },
        project: {
          id: 'project-1',
          name: 'Test Project',
          client: 'Test Client',
        },
      }

      vi.mocked(prisma.blocker.findUnique).mockResolvedValue(mockBlocker as any)

      const notification = await exportService.generateNotificationMessage('blocker', 'blocker-1')
      const emailFormatted = await exportService.formatForEmail(notification.body)

      // Should be plain text suitable for email
      expect(emailFormatted).toContain('BLOCKER NOTIFICATION')
      expect(emailFormatted).toContain('Severity: CRITICAL')
      expect(emailFormatted).toContain('Project: Test Project')
      expect(emailFormatted).toContain('Description:')
      expect(emailFormatted).toContain('Critical blocker')
    })
  })
})

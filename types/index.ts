// Core enums
export enum UserRole {
  EXECUTIVE = 'EXECUTIVE',
  ADMIN = 'ADMIN',
  PROJECT_MANAGER = 'PROJECT_MANAGER',
  INTERNAL_CONSULTANT = 'INTERNAL_CONSULTANT',
  EXTERNAL_CONSULTANT = 'EXTERNAL_CONSULTANT',
}

export enum ProjectStatus {
  PLANNING = 'PLANNING',
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

export enum WorkItemStatus {
  BACKLOG = 'BACKLOG',
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  DONE = 'DONE',
}

export enum WorkItemPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum BlockerSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum RiskStatus {
  IDENTIFIED = 'IDENTIFIED',
  MONITORING = 'MONITORING',
  MITIGATING = 'MITIGATING',
  MATERIALIZED = 'MATERIALIZED',
  CLOSED = 'CLOSED',
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum AgreementStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum KanbanColumnType {
  BACKLOG = 'BACKLOG',
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  DONE = 'DONE',
  CUSTOM = 'CUSTOM',
}

export enum Locale {
  ES = 'es',
  PT = 'pt',
}

// RBAC Permissions
export enum Permission {
  // Organization
  ORG_MANAGE = 'org:manage',
  ORG_VIEW = 'org:view',

  // Users
  USER_CREATE = 'user:create',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  USER_VIEW = 'user:view',

  // Projects
  PROJECT_CREATE = 'project:create',
  PROJECT_UPDATE = 'project:update',
  PROJECT_DELETE = 'project:delete',
  PROJECT_VIEW = 'project:view',
  PROJECT_ARCHIVE = 'project:archive',

  // Work Items
  WORK_ITEM_CREATE = 'work_item:create',
  WORK_ITEM_UPDATE = 'work_item:update',
  WORK_ITEM_UPDATE_OWN = 'work_item:update_own',
  WORK_ITEM_DELETE = 'work_item:delete',
  WORK_ITEM_VIEW = 'work_item:view',

  // Blockers
  BLOCKER_CREATE = 'blocker:create',
  BLOCKER_UPDATE = 'blocker:update',
  BLOCKER_RESOLVE = 'blocker:resolve',
  BLOCKER_VIEW = 'blocker:view',

  // Risks
  RISK_CREATE = 'risk:create',
  RISK_UPDATE = 'risk:update',
  RISK_DELETE = 'risk:delete',
  RISK_VIEW = 'risk:view',

  // Agreements
  AGREEMENT_CREATE = 'agreement:create',
  AGREEMENT_UPDATE = 'agreement:update',
  AGREEMENT_DELETE = 'agreement:delete',
  AGREEMENT_VIEW = 'agreement:view',

  // AI
  AI_USE = 'ai:use',

  // Dashboard
  DASHBOARD_EXECUTIVE = 'dashboard:executive',
  DASHBOARD_PROJECT = 'dashboard:project',

  // Export
  EXPORT_PROJECT = 'export:project',
}

// Kanban Board types
export interface KanbanBoard {
  columns: KanbanColumnWithItems[]
  workItems: WorkItemSummary[]
}

export interface KanbanColumnWithItems {
  id: string
  name: string
  order: number
  columnType: KanbanColumnType
  workItemIds: string[]
}

export interface WorkItemSummary {
  id: string
  title: string
  status: WorkItemStatus
  priority: WorkItemPriority
  kanbanColumnId: string
  ownerId: string
  ownerName: string
  startDate?: string
  estimatedEndDate?: string
  phase?: string | null
  estimatedHours?: number | null
}

// Project Metrics types
export interface ProjectMetrics {
  completionRate: number
  totalWorkItems: number
  completedWorkItems: number
  activeBlockers: number
  averageBlockerResolutionTimeHours: number | null
  highPriorityRisks: number
}

// Dashboard types
export interface ExecutiveDashboard {
  activeProjects: number
  projectsAtRisk: number
  criticalBlockers: number
  highRisks: number
  completionRate: number
  averageBlockerResolutionTimeHours: number | null
  projects: ProjectSummary[]
}

export interface ProjectSummary {
  id: string
  name: string
  client: string
  status: ProjectStatus
  completionRate: number
  activeBlockers: number
  criticalBlockers: number
  highRisks: number
  overdueWorkItems: number
}

export interface DashboardFilters {
  dateRange?: {
    startDate: Date
    endDate: Date
  }
  client?: string
  projectManagerId?: string
  status?: ProjectStatus
}

// Project Health types
export enum ProjectHealthStatus {
  HEALTHY = 'HEALTHY',
  AT_RISK = 'AT_RISK',
  CRITICAL = 'CRITICAL',
}

export enum HealthFactorImpact {
  POSITIVE = 'POSITIVE',
  NEGATIVE = 'NEGATIVE',
  NEUTRAL = 'NEUTRAL',
}

export interface ProjectHealth {
  status: ProjectHealthStatus
  score: number
  factors: HealthFactor[]
}

export interface HealthFactor {
  name: string
  impact: HealthFactorImpact
  description: string
}

// Organization Metrics types
export interface OrganizationMetrics {
  totalProjects: number
  activeProjects: number
  completedProjects: number
  totalWorkItems: number
  completedWorkItems: number
  completionRate: number
  activeBlockers: number
  criticalBlockers: number
  averageBlockerResolutionTimeHours: number | null
  activeRisks: number
  highRisks: number
  trends: MetricsTrends
}

export interface MetricsTrends {
  completionRateChange: number // percentage point change from last week
  activeProjectsChange: number // absolute change from last week
  criticalBlockersChange: number // absolute change from last week
  highRisksChange: number // absolute change from last week
}

// Export types
export enum ReportDetailLevel {
  EXECUTIVE = 'EXECUTIVE',
  DETAILED = 'DETAILED',
  COMPLETE = 'COMPLETE',
}

export interface ExportOptions {
  detailLevel: ReportDetailLevel
  includeWorkItems: boolean
  includeBlockers: boolean
  includeRisks: boolean
  includeAgreements: boolean
  useAINarrative: boolean
}

export interface ExportResult {
  content: string
  format: 'PLAIN_TEXT' | 'MARKDOWN'
  generatedAt: Date
}

export interface NotificationMessage {
  subject: string
  body: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
}

// Re-export AI types
export * from './ai'

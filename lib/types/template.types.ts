import { WorkItemPriority } from '@/types'

// Enums
export enum TemplateSortBy {
  NAME = 'NAME',
  UPDATED_AT = 'UPDATED_AT',
  USAGE_COUNT = 'USAGE_COUNT',
  LAST_USED = 'LAST_USED',
}

// Template Types
export interface Template {
  id: string
  organizationId: string
  name: string
  description: string
  categoryId: string | null
  category?: TemplateCategory
  phases: TemplatePhase[]
  usageCount?: number
  lastUsedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface TemplatePhase {
  id: string
  templateId: string
  name: string
  order: number
  activities: TemplateActivity[]
  createdAt: Date
}

export interface TemplateActivity {
  id: string
  phaseId: string
  title: string
  description: string
  priority: WorkItemPriority
  estimatedDuration: number // hours
  order: number
  createdAt: Date
}

export interface TemplateCategory {
  id: string
  organizationId: string
  name: string
  createdAt: Date
}

export interface TemplateSummary {
  id: string
  name: string
  description: string
  categoryId: string | null
  categoryName: string | null
  phaseCount: number
  activityCount: number
  totalEstimatedDuration: number
  usageCount: number
  lastUsedAt: Date | null
  updatedAt: Date
}

// Application Types
export interface ApplyTemplateRequest {
  templateId: string
  selectedActivityIds: string[]
  startDate: string // ISO 8601 date
}

export interface ApplyTemplateResponse {
  workItems: WorkItem[]
  createdCount: number
}

export interface TemplatePreview {
  template: Template
  totalActivities: number
  totalEstimatedDuration: number
  phaseBreakdown: {
    phaseName: string
    activityCount: number
    estimatedDuration: number
  }[]
}

// Form Types
export interface CreateTemplateFormData {
  name: string
  description: string
  categoryId: string | null
  phases: CreatePhaseFormData[]
}

export interface CreatePhaseFormData {
  name: string
  order: number
  activities: CreateActivityFormData[]
}

export interface CreateActivityFormData {
  title: string
  description: string
  priority: WorkItemPriority
  estimatedDuration: number
  order: number
}

// WorkItem type for ApplyTemplateResponse
export interface WorkItem {
  id: string
  organizationId: string
  projectId: string
  ownerId: string
  title: string
  description: string
  status: string
  priority: string
  startDate: Date
  estimatedEndDate: Date
  completedAt?: Date | null
  kanbanColumnId: string
  createdAt: Date
  updatedAt: Date
}

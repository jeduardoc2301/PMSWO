/**
 * AI Service Types
 * Types for AI analysis, suggestions, and text improvement
 */

export enum TextPurpose {
  EMAIL = 'EMAIL',
  REPORT = 'REPORT',
  DESCRIPTION = 'DESCRIPTION',
}

export enum AISuggestionType {
  CREATE_BLOCKER = 'CREATE_BLOCKER',
  ADJUST_DATES = 'ADJUST_DATES',
  CREATE_RISK = 'CREATE_RISK',
  REASSIGN = 'REASSIGN',
}

export enum AISuggestionPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export interface AISuggestion {
  type: AISuggestionType
  priority: AISuggestionPriority
  description: string
  affectedEntityId: string
  suggestedAction: Record<string, unknown>
}

export interface DetectedRisk {
  description: string
  probability: number
  impact: number
  affectedWorkItemIds: string[]
}

export interface OverdueItemSuggestion {
  workItemId: string
  title: string
  daysOverdue: number
  suggestedAction: string
}

export interface AIAnalysis {
  projectId: string
  analyzedAt: Date
  suggestions: AISuggestion[]
  detectedRisks: DetectedRisk[]
  overdueItems: OverdueItemSuggestion[]
}

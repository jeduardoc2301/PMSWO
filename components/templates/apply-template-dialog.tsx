'use client'

import React, { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { TemplateSelectionStep } from './template-selection-step'
import { ActivitySelectionStep } from './activity-selection-step'
import { DateAssignmentStep } from './date-assignment-step'
import { FinalPreviewStep } from './final-preview-step'

interface ApplyTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  onSuccess: () => void
}

type WizardStep = 'template-selection' | 'activity-selection' | 'date-assignment' | 'final-preview'

interface WizardState {
  currentStep: WizardStep
  selectedTemplateId: string | null
  selectedActivityIds: string[]
  startDate: Date
}

/**
 * ApplyTemplateDialog component - Multi-step wizard for applying templates to projects
 * 
 * Orchestrates the template application flow:
 * 1. Template Selection - Browse and select a template
 * 2. Activity Selection - Choose which activities to include
 * 3. Date Assignment - Set start date and view calculated dates
 * 4. Final Preview - Review and confirm before creating work items
 * 
 * Requirements: 9.1, 9.5, 10.1, 11.1, 12.7, 12.9, 17.1, 17.9, 17.10, 20.5, 20.6
 */
export function ApplyTemplateDialog({
  open,
  onOpenChange,
  projectId,
  onSuccess,
}: ApplyTemplateDialogProps) {
  const t = useTranslations('templates')
  const { toast } = useToast()
  
  const [wizardState, setWizardState] = useState<WizardState>({
    currentStep: 'template-selection',
    selectedTemplateId: null,
    selectedActivityIds: [],
    startDate: new Date(),
  })
  
  const [submitting, setSubmitting] = useState(false)

  // Reset wizard state when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setWizardState({
        currentStep: 'template-selection',
        selectedTemplateId: null,
        selectedActivityIds: [],
        startDate: new Date(),
      })
      setSubmitting(false)
    }
    onOpenChange(newOpen)
  }

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    setWizardState(prev => ({
      ...prev,
      selectedTemplateId: templateId,
      selectedActivityIds: [], // Reset activity selection when template changes
    }))
  }

  // Handle activity selection
  const handleActivitySelect = (activityIds: string[]) => {
    setWizardState(prev => ({
      ...prev,
      selectedActivityIds: activityIds,
    }))
  }

  // Handle start date change
  const handleStartDateChange = (date: Date) => {
    setWizardState(prev => ({
      ...prev,
      startDate: date,
    }))
  }

  // Navigate to next step
  const handleNext = () => {
    const stepOrder: WizardStep[] = [
      'template-selection',
      'activity-selection',
      'date-assignment',
      'final-preview',
    ]
    const currentIndex = stepOrder.indexOf(wizardState.currentStep)
    if (currentIndex < stepOrder.length - 1) {
      setWizardState(prev => ({
        ...prev,
        currentStep: stepOrder[currentIndex + 1],
      }))
    }
  }

  // Navigate to previous step
  const handleBack = () => {
    const stepOrder: WizardStep[] = [
      'template-selection',
      'activity-selection',
      'date-assignment',
      'final-preview',
    ]
    const currentIndex = stepOrder.indexOf(wizardState.currentStep)
    if (currentIndex > 0) {
      setWizardState(prev => ({
        ...prev,
        currentStep: stepOrder[currentIndex - 1],
      }))
    }
  }

  // Handle final confirmation and API call
  const handleConfirm = async () => {
    if (!wizardState.selectedTemplateId || wizardState.selectedActivityIds.length === 0) {
      toast({
        title: t('errors.validationFailed'),
        description: t('validation.activitiesRequired'),
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch(`/api/v1/projects/${projectId}/apply-template`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId: wizardState.selectedTemplateId,
          selectedActivityIds: wizardState.selectedActivityIds,
          startDate: wizardState.startDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to apply template')
      }

      const data = await response.json()

      // Show success toast with created count
      toast({
        title: t('success.applied', { count: data.createdCount }),
        variant: 'default',
      })

      // Call onSuccess to refresh work items list
      onSuccess()

      // Close dialog
      handleOpenChange(false)
    } catch (error) {
      console.error('Error applying template:', error)
      toast({
        title: t('errors.applyFailed'),
        description: error instanceof Error ? error.message : t('errors.serverError'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Get dialog title based on current step
  const getDialogTitle = () => {
    switch (wizardState.currentStep) {
      case 'template-selection':
        return t('wizard.step1')
      case 'activity-selection':
        return t('wizard.step2')
      case 'date-assignment':
        return t('wizard.step3')
      case 'final-preview':
        return t('wizard.step4')
      default:
        return t('applyTemplate')
    }
  }

  // Get current step number
  const getCurrentStepNumber = () => {
    const stepOrder: WizardStep[] = [
      'template-selection',
      'activity-selection',
      'date-assignment',
      'final-preview',
    ]
    return stepOrder.indexOf(wizardState.currentStep) + 1
  }

  const totalSteps = 4

  // Get dialog description based on current step
  const getDialogDescription = () => {
    switch (wizardState.currentStep) {
      case 'template-selection':
        return t('descriptions.selectTemplateStep')
      case 'activity-selection':
        return t('descriptions.selectActivitiesStep')
      case 'date-assignment':
        return t('descriptions.assignDatesStep')
      case 'final-preview':
        return t('descriptions.confirmStep')
      default:
        return ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <DialogTitle>{getDialogTitle()}</DialogTitle>
            <div className="text-sm font-medium text-gray-900">
              Paso {getCurrentStepNumber()} de {totalSteps}
            </div>
          </div>
          <DialogDescription>{getDialogDescription()}</DialogDescription>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(getCurrentStepNumber() / totalSteps) * 100}%` }}
            />
          </div>
        </DialogHeader>

        {/* Render current step */}
        {wizardState.currentStep === 'template-selection' && (
          <TemplateSelectionStep
            selectedTemplateId={wizardState.selectedTemplateId}
            onTemplateSelect={handleTemplateSelect}
            onNext={handleNext}
            onCancel={() => handleOpenChange(false)}
          />
        )}

        {wizardState.currentStep === 'activity-selection' && (
          <ActivitySelectionStep
            selectedTemplateId={wizardState.selectedTemplateId!}
            selectedActivityIds={wizardState.selectedActivityIds}
            onActivitySelect={handleActivitySelect}
            onNext={handleNext}
            onBack={handleBack}
          />
        )}

        {wizardState.currentStep === 'date-assignment' && (
          <DateAssignmentStep
            selectedTemplateId={wizardState.selectedTemplateId!}
            selectedActivityIds={wizardState.selectedActivityIds}
            startDate={wizardState.startDate}
            onStartDateChange={handleStartDateChange}
            onNext={handleNext}
            onBack={handleBack}
          />
        )}

        {wizardState.currentStep === 'final-preview' && (
          <FinalPreviewStep
            selectedTemplateId={wizardState.selectedTemplateId!}
            selectedActivityIds={wizardState.selectedActivityIds}
            startDate={wizardState.startDate}
            onConfirm={handleConfirm}
            onBack={handleBack}
            onCancel={() => handleOpenChange(false)}
            submitting={submitting}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

# Implementation Plan: Activity Templates Management

## Overview

This implementation plan breaks down the Activity Templates Management feature into discrete, actionable coding tasks. The feature enables users to create, manage, and apply reusable activity templates to projects, significantly reducing project setup time for consulting engagements.

The implementation follows a bottom-up approach: database schema → backend services → API endpoints → frontend components → integration → testing. Each task builds incrementally on previous work, with checkpoints to validate progress.

## Tasks

- [x] 1. Database schema and Prisma setup
  - [x] 1.1 Create Prisma migration for template tables
    - Create migration file for 5 new tables: template_categories, templates, template_phases, template_activities, template_usage
    - Add all columns, foreign keys, indexes, and constraints as specified in design
    - Add CASCADE delete for phases and activities
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.14, 13.1, 19.1, 19.2_
  
  - [x] 1.2 Update Prisma schema with template models
    - Add Template, TemplateCategory, TemplatePhase, TemplateActivity, TemplateUsage models
    - Define all relations between models
    - Add indexes for organization_id, category_id, template_id, phase_id
    - Add unique constraints for order fields and category names
    - _Requirements: 1.1-1.15, 13.1, 16.1, 18.1, 18.2_
  
  - [x] 1.3 Run migration and verify schema
    - Execute Prisma migration against database
    - Generate Prisma client
    - Verify all tables, indexes, and constraints created correctly
    - _Requirements: 1.1-1.15_

- [x] 2. TypeScript types and validation schemas
  - [x] 2.1 Create TypeScript types for templates
    - Create types in lib/types/template.types.ts
    - Define Template, TemplatePhase, TemplateActivity, TemplateCategory interfaces
    - Define TemplateSummary, TemplatePreview, ApplyTemplateRequest, ApplyTemplateResponse types
    - Define CreateTemplateFormData, CreatePhaseFormData, CreateActivityFormData types
    - Define TemplateSortBy enum
    - _Requirements: 1.1-1.15, 6.5, 6.6_
  
  - [x] 2.2 Create Zod validation schemas
    - Create schemas in lib/validators/template.validator.ts
    - Define createTemplateSchema with nested phase and activity validation
    - Define updateTemplateSchema for partial updates
    - Define applyTemplateSchema for template application
    - Define createCategorySchema with 100 character limit
    - Add validation for: required fields, length limits (255 chars), priority enum, positive durations, unique orders
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 13.5, 18.1-18.6_
  
  - [ ]* 2.3 Write property test for field length validation
    - **Property 1: Field Length Validation**
    - **Validates: Requirements 1.2, 1.6, 1.9, 3.3**
    - Test that template names, phase names, and activity titles exceeding 255 characters are rejected
    - Test that category names exceeding 100 characters are rejected

- [x] 3. Backend service layer - TemplateService
  - [x] 3.1 Create TemplateService for CRUD operations
    - Create services/template.service.ts
    - Implement createTemplate(organizationId, userId, data) method
    - Implement getTemplateById(templateId, organizationId) method
    - Implement listTemplates(organizationId, filters) method with category and search filters
    - Implement updateTemplate(templateId, organizationId, data) method
    - Implement deleteTemplate(templateId, organizationId) method
    - All methods enforce multi-tenant isolation by filtering on organizationId
    - _Requirements: 2.3, 2.4, 2.5, 3.1, 4.1, 4.2, 5.2, 6.1, 6.3, 6.4, 16.1-16.6_
  
  - [ ]* 3.2 Write property test for multi-tenant isolation
    - **Property 3: Multi-Tenant Isolation**
    - **Validates: Requirements 2.3, 2.4, 2.5, 6.1, 16.1-16.6**
    - Test that all CRUD operations only access templates from user's organization
    - Test that cross-organization access attempts return not found errors
  
  - [x] 3.3 Add template sorting and filtering logic
    - Implement sorting by name, updatedAt, usageCount, lastUsedAt
    - Implement category filtering
    - Implement name search (case-insensitive contains)
    - Add pagination support (default 20 per page)
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 19.3-19.6_
  
  - [ ]* 3.4 Write property test for template filtering
    - **Property 9: Template Filtering**
    - **Validates: Requirements 6.3, 6.4**
    - Test that category filter returns only matching templates
    - Test that search filter returns only templates with matching names
  
  - [ ]* 3.5 Write property test for template sorting
    - **Property 10: Template Sorting**
    - **Validates: Requirements 6.5, 6.6**
    - Test that templates are correctly ordered by specified sort field and direction
  
  - [x] 3.6 Add template preview calculation
    - Implement getTemplatePreview(templateId, organizationId) method
    - Calculate total activity count across all phases
    - Calculate total estimated duration across all activities
    - Calculate per-phase breakdown (activity count, duration)
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.7_
  
  - [ ]* 3.7 Write property test for preview metrics calculation
    - **Property 11: Template Preview Metrics**
    - **Validates: Requirements 7.6, 7.7**
    - Test that total activity count and duration are correctly calculated
  
  - [x] 3.8 Add usage tracking methods
    - Implement recordTemplateUsage(templateId, projectId, userId) method
    - Implement getTemplateUsageStats(templateId) method
    - Include usage count and last used timestamp in template summaries
    - _Requirements: 19.1, 19.2, 19.3, 19.4_
  
  - [ ]* 3.9 Write property test for usage tracking
    - **Property 18: Usage Tracking**
    - **Validates: Requirements 19.1, 19.2**
    - Test that successful template application increments usage count and records timestamp

- [x] 4. Backend service layer - TemplateCategoryService
  - [x] 4.1 Create TemplateCategoryService
    - Create services/template-category.service.ts
    - Implement createCategory(organizationId, name) method
    - Implement listCategories(organizationId) method
    - Implement deleteCategory(categoryId, organizationId) method with in-use check
    - Enforce multi-tenant isolation
    - _Requirements: 13.1, 13.4, 13.6, 16.1_
  
  - [ ]* 4.2 Write property test for category deletion prevention
    - **Property 20: Category Deletion Prevention**
    - **Validates: Requirements 13.6**
    - Test that categories assigned to templates cannot be deleted

- [x] 5. Backend service layer - TemplateApplicationService
  - [x] 5.1 Create TemplateApplicationService for applying templates
    - Create services/template-application.service.ts
    - Implement applyTemplate(projectId, templateId, selectedActivityIds, startDate, userId, organizationId) method
    - Validate that template and project belong to same organization
    - Validate that at least one activity is selected
    - Calculate start and end dates for all selected activities sequentially
    - Create work items in batch using Prisma transaction
    - Record template usage on success
    - Return created work items
    - _Requirements: 8.4, 10.8, 11.2, 11.3, 11.4, 12.1-12.9, 16.6_
  
  - [ ]* 5.2 Write property test for activity selection validation
    - **Property 14: Activity Selection Count**
    - **Validates: Requirements 10.6, 10.7**
    - Test that selected activity count and total duration are correctly calculated
  
  - [ ]* 5.3 Write property test for sequential date calculation
    - **Property 15: Sequential Date Calculation**
    - **Validates: Requirements 11.3, 11.4**
    - Test that dates are calculated sequentially based on estimated durations
  
  - [ ]* 5.4 Write property test for work item creation mapping
    - **Property 16: Work Item Creation Mapping**
    - **Validates: Requirements 12.1-12.6**
    - Test that work items are created with correct field mappings from template activities
  
  - [ ]* 5.5 Write property test for batch creation atomicity
    - **Property 17: Batch Creation Atomicity**
    - **Validates: Requirements 12.8**
    - Test that if any work item creation fails, all creations are rolled back

- [x] 6. Checkpoint - Backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. API endpoints - Template management
  - [x] 7.1 Create GET /api/v1/templates endpoint
    - Create app/api/v1/templates/route.ts
    - Implement GET handler for listing templates
    - Extract organizationId from authenticated user session
    - Support query params: category, search, sortBy, sortOrder, page, limit
    - Return array of template summaries with usage stats
    - Require authentication
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 16.2_
  
  - [x] 7.2 Create POST /api/v1/templates endpoint
    - Implement POST handler in app/api/v1/templates/route.ts
    - Validate request body with createTemplateSchema
    - Check user has ADMIN or PROJECT_MANAGER role
    - Extract organizationId from user session
    - Call TemplateService.createTemplate
    - Return 201 with created template
    - Return 400 for validation errors, 403 for authorization errors
    - _Requirements: 2.1, 2.2, 3.1, 3.2-3.10, 16.1_
  
  - [ ]* 7.3 Write property test for role-based access control
    - **Property 4: Role-Based Access Control**
    - **Validates: Requirements 2.2**
    - Test that users without ADMIN or PROJECT_MANAGER role cannot create/update/delete templates
  
  - [ ]* 7.4 Write property test for valid template creation
    - **Property 5: Valid Template Creation**
    - **Validates: Requirements 3.1**
    - Test that valid template data successfully creates a template
  
  - [ ]* 7.5 Write property test for invalid data rejection
    - **Property 6: Invalid Data Rejection**
    - **Validates: Requirements 3.7, 18.3, 18.4, 18.6**
    - Test that invalid data is rejected with validation errors
  
  - [x] 7.6 Create GET /api/v1/templates/[id] endpoint
    - Create app/api/v1/templates/[id]/route.ts
    - Implement GET handler for retrieving single template
    - Extract organizationId from user session
    - Call TemplateService.getTemplateById with multi-tenant check
    - Return full template with phases and activities
    - Return 404 if not found or wrong organization
    - _Requirements: 4.1, 7.1, 7.2, 16.3_
  
  - [x] 7.7 Create PATCH /api/v1/templates/[id] endpoint
    - Implement PATCH handler in app/api/v1/templates/[id]/route.ts
    - Validate request body with updateTemplateSchema
    - Check user has ADMIN or PROJECT_MANAGER role
    - Extract organizationId from user session
    - Call TemplateService.updateTemplate with multi-tenant check
    - Return updated template
    - Return 400 for validation errors, 403 for authorization, 404 if not found
    - _Requirements: 2.2, 4.2, 4.3, 4.4, 16.4_
  
  - [ ]* 7.8 Write property test for template update correctness
    - **Property 7: Template Update Correctness**
    - **Validates: Requirements 4.2, 4.4**
    - Test that template updates modify data and update modification timestamp
  
  - [x] 7.9 Create DELETE /api/v1/templates/[id] endpoint
    - Implement DELETE handler in app/api/v1/templates/[id]/route.ts
    - Check user has ADMIN or PROJECT_MANAGER role
    - Extract organizationId from user session
    - Call TemplateService.deleteTemplate with multi-tenant check
    - Return 204 on success
    - Return 403 for authorization, 404 if not found
    - _Requirements: 2.2, 5.1, 5.2, 16.5_
  
  - [ ]* 7.10 Write property test for template deletion cascade
    - **Property 8: Template Deletion Cascade**
    - **Validates: Requirements 5.2, 5.4**
    - Test that template deletion removes template and all associated phases and activities
  
  - [x] 7.11 Create GET /api/v1/templates/[id]/preview endpoint
    - Create app/api/v1/templates/[id]/preview/route.ts
    - Implement GET handler for template preview
    - Extract organizationId from user session
    - Call TemplateService.getTemplatePreview with multi-tenant check
    - Return template with calculated metrics and phase breakdown
    - _Requirements: 7.1-7.7, 16.3_
  
  - [ ]* 7.12 Write property test for phase and activity ordering
    - **Property 12: Phase and Activity Ordering**
    - **Validates: Requirements 7.3, 7.4**
    - Test that phases and activities are returned in correct order
  
  - [ ]* 7.13 Write property test for activity display completeness
    - **Property 13: Activity Display Completeness**
    - **Validates: Requirements 7.5**
    - Test that all activity fields are included in preview

- [x] 8. API endpoints - Category management
  - [x] 8.1 Create GET /api/v1/template-categories endpoint
    - Create app/api/v1/template-categories/route.ts
    - Implement GET handler for listing categories
    - Extract organizationId from user session
    - Call TemplateCategoryService.listCategories
    - Return array of categories
    - _Requirements: 13.1, 16.1_
  
  - [x] 8.2 Create POST /api/v1/template-categories endpoint
    - Implement POST handler in app/api/v1/template-categories/route.ts
    - Validate request body with createCategorySchema
    - Check user has ADMIN or PROJECT_MANAGER role
    - Extract organizationId from user session
    - Call TemplateCategoryService.createCategory
    - Return 201 with created category
    - Return 400 for validation errors (name > 100 chars), 403 for authorization
    - _Requirements: 2.2, 13.1, 13.4, 13.5_

- [x] 9. API endpoints - Template application
  - [x] 9.1 Create POST /api/v1/projects/[id]/apply-template endpoint
    - Create app/api/v1/projects/[id]/apply-template/route.ts
    - Implement POST handler for applying template
    - Validate request body with applyTemplateSchema
    - Check user has WORK_ITEM_CREATE permission for project
    - Extract organizationId and userId from user session
    - Validate project belongs to user's organization
    - Call TemplateApplicationService.applyTemplate
    - Return created work items with count
    - Return 400 for validation errors, 403 for authorization, 404 if template/project not found
    - _Requirements: 8.1, 8.3, 8.4, 10.8, 11.2, 11.3, 11.4, 12.1-12.9, 16.6_

- [x] 10. Checkpoint - API endpoints complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Translation files
  - [x] 11.1 Create Spanish translations
    - Create messages/es/templates.json
    - Add all UI labels, validation messages, error messages, success messages
    - Include keys for: title, createTemplate, editTemplate, deleteTemplate, applyTemplate, templateName, templateDescription, category, phases, activities, totalDuration, usageCount, lastUsed
    - Include validation error keys for all validation scenarios
    - Include error keys for createFailed, updateFailed, deleteFailed, applyFailed, notFound, unauthorized
    - Include success keys for created, updated, deleted, applied
    - _Requirements: 15.1, 15.2, 15.3_
  
  - [x] 11.2 Create Portuguese translations
    - Create messages/pt/templates.json
    - Add same keys as Spanish with Portuguese translations
    - _Requirements: 15.1, 15.2, 15.3_
  
  - [x] 11.3 Update i18n configuration
    - Update i18n/request.ts to load templates namespace
    - Ensure templates namespace available in all template-related pages
    - _Requirements: 15.1_
  
  - [ ]* 11.4 Write property test for template data language preservation
    - **Property 21: Template Data Language Preservation**
    - **Validates: Requirements 15.4, 15.5**
    - Test that template data is stored and displayed in the language it was entered

- [x] 12. Frontend components - Template list and filters
  - [x] 12.1 Create TemplateList component
    - Create components/templates/template-list.tsx
    - Fetch templates from GET /api/v1/templates with SWR
    - Display templates in grid layout using TemplateCard components
    - Show loading state and error state
    - Implement pagination controls
    - _Requirements: 6.1, 6.2_
  
  - [x] 12.2 Create TemplateCard component
    - Create components/templates/template-card.tsx
    - Display template name, description, category, updated date
    - Display usage count and last used date
    - Show action buttons: View, Edit, Delete (role-based visibility)
    - Use shadcn/ui Card component
    - _Requirements: 6.2, 19.3, 19.4_
  
  - [x] 12.3 Create TemplateFilters component
    - Create components/templates/template-filters.tsx
    - Add category dropdown filter (fetch from GET /api/v1/template-categories)
    - Add search input with debounce (300ms)
    - Add sort dropdown (name, updated date, usage count, last used)
    - Update URL query params on filter changes
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 19.5, 19.6_

- [x] 13. Frontend components - Template CRUD dialogs
  - [x] 13.1 Create CreateTemplateDialog component
    - Create components/templates/create-template-dialog.tsx
    - Use shadcn/ui Dialog component
    - Include form fields: name (max 255), description (textarea), category (dropdown)
    - Embed PhaseManager component for managing phases
    - Validate form with Zod schema on client side
    - Call POST /api/v1/templates on submit
    - Show validation errors inline
    - Show success toast and close dialog on success
    - Mutate SWR cache to refresh template list
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.9, 3.10, 13.2, 20.1, 20.5, 20.6_
  
  - [x] 13.2 Create PhaseManager component
    - Create components/templates/phase-manager.tsx
    - Display list of phases with order, name, and actions
    - Allow adding new phases
    - Allow removing phases
    - Allow reordering phases (drag-and-drop or up/down buttons)
    - Embed ActivityManager component for each phase
    - Validate at least one phase exists
    - _Requirements: 1.5, 1.6, 1.7, 3.4, 4.6, 4.7, 4.10_
  
  - [x] 13.3 Create ActivityManager component
    - Create components/templates/activity-manager.tsx
    - Display list of activities with order, title, and actions
    - Allow adding new activities with fields: title (max 255), description (textarea), priority (dropdown), estimated duration (number input)
    - Allow removing activities
    - Allow reordering activities (drag-and-drop or up/down buttons)
    - Validate at least one activity per phase
    - Validate priority is valid enum value
    - Validate estimated duration is positive
    - _Requirements: 1.8-1.13, 3.5, 3.6, 3.7, 3.8, 4.8, 4.9, 4.11, 18.3, 18.4_
  
  - [x] 13.4 Create EditTemplateDialog component
    - Create components/templates/edit-template-dialog.tsx
    - Fetch template data from GET /api/v1/templates/[id]
    - Pre-populate form with existing data
    - Use same form structure as CreateTemplateDialog
    - Call PATCH /api/v1/templates/[id] on submit
    - Show validation errors inline
    - Show success toast and close dialog on success
    - Mutate SWR cache to refresh template list
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 13.3, 20.1, 20.5, 20.6_
  
  - [x] 13.5 Create DeleteTemplateDialog component
    - Create components/templates/delete-template-dialog.tsx
    - Use shadcn/ui AlertDialog component
    - Display confirmation message with template name
    - Warn about cascade deletion of phases and activities
    - Call DELETE /api/v1/templates/[id] on confirm
    - Show success toast and close dialog on success
    - Mutate SWR cache to refresh template list
    - _Requirements: 5.1, 5.2, 5.3, 20.5, 20.6_
  
  - [x] 13.6 Create TemplatePreviewDialog component
    - Create components/templates/template-preview-dialog.tsx
    - Fetch preview data from GET /api/v1/templates/[id]/preview
    - Display template name and description
    - Display phases in order with activities in order
    - Display activity details: title, description, priority, estimated duration
    - Display total activity count and total estimated duration
    - Use shadcn/ui Accordion for phases
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 9.4_

- [x] 14. Frontend components - Template application wizard
  - [x] 14.1 Create ApplyTemplateDialog component
    - Create components/templates/apply-template-dialog.tsx
    - Use shadcn/ui Dialog component with multi-step wizard
    - Manage wizard state: current step, selected template, selected activities, start date
    - Render TemplateSelectionStep, ActivitySelectionStep, DateAssignmentStep, FinalPreviewStep based on current step
    - Provide navigation between steps
    - Call POST /api/v1/projects/[id]/apply-template on final confirmation
    - Show success toast with created count and close dialog on success
    - Refresh project work items list
    - _Requirements: 9.1, 9.5, 10.1, 11.1, 12.7, 12.9, 17.1, 17.9, 17.10, 20.5, 20.6_
  
  - [x] 14.2 Create TemplateSelectionStep component
    - Create components/templates/template-selection-step.tsx
    - Fetch templates from GET /api/v1/templates
    - Display template list with filters (category, search)
    - Allow selecting one template
    - Show template preview on selection
    - Provide "Next" button to proceed to activity selection
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [x] 14.3 Create ActivitySelectionStep component
    - Create components/templates/activity-selection-step.tsx
    - Display selected template's phases and activities
    - Use shadcn/ui Accordion for phases
    - Provide checkboxes for individual activity selection
    - Provide "Select All in Phase" buttons
    - Provide "Select All" button
    - Display count of selected activities
    - Calculate and display total estimated duration of selected activities
    - Validate at least one activity selected before proceeding
    - Provide "Back" and "Next" buttons
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 17.5, 17.6, 17.7_
  
  - [x] 14.4 Create DateAssignmentStep component
    - Create components/templates/date-assignment-step.tsx
    - Provide date picker for start date (default to current date)
    - Calculate end dates for all selected activities based on estimated durations
    - Calculate subsequent activity start dates sequentially
    - Display calculated dates in preview table
    - Provide "Back" and "Next" buttons
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 17.8_
  
  - [x] 14.5 Create FinalPreviewStep component
    - Create components/templates/final-preview-step.tsx
    - Display all selected activities organized by phase
    - Display activity title, description, priority, start date, end date for each
    - Display total count of work items to be created
    - Display total estimated duration
    - Provide "Back" button to modify selections or dates
    - Provide "Cancel" button to abort
    - Provide "Confirm" button to proceed with batch creation
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 17.10_

- [x] 15. Frontend pages - Templates management
  - [x] 15.1 Create templates page
    - Create app/[locale]/templates/page.tsx
    - Server component that checks user role (ADMIN or PROJECT_MANAGER)
    - Redirect to home if unauthorized
    - Render TemplatesClient component
    - _Requirements: 2.1, 2.2, 14.1_
  
  - [x] 15.2 Create templates client component
    - Create app/[locale]/templates/templates-client.tsx
    - Client component that renders TemplateList, TemplateFilters
    - Include "Create Template" button (opens CreateTemplateDialog)
    - Handle dialog state for Create, Edit, Delete, Preview
    - Pass callbacks to TemplateCard for opening dialogs
    - _Requirements: 2.1, 6.1, 6.2, 14.1_
  
  - [x] 15.3 Create templates layout
    - Create app/[locale]/templates/layout.tsx
    - Add page title and breadcrumbs
    - Load templates namespace for translations
    - _Requirements: 14.1, 15.1_

- [x] 16. Navigation integration
  - [x] 16.1 Add Templates menu item to navigation
    - Update navigation component (likely components/navigation.tsx or similar)
    - Add "Templates" menu item with link to /templates
    - Show menu item only for users with ADMIN or PROJECT_MANAGER role
    - Use templates.title translation key
    - _Requirements: 14.1, 14.2, 14.3_

- [x] 17. Project detail integration
  - [x] 17.1 Add "Apply Template" button to project detail page
    - Update project detail client component (app/[locale]/projects/[id]/project-detail-client.tsx)
    - Add "Apply Template" button in work items section
    - Show button only for users with WORK_ITEM_CREATE permission
    - Open ApplyTemplateDialog on click
    - Pass projectId to dialog
    - _Requirements: 8.1, 8.2_

- [x] 18. Checkpoint - Frontend complete
  - Ensure all components render correctly, ask the user if questions arise.

- [x] 19. Property-based tests implementation
  - [x]* 19.1 Implement Property 2: Template Structure Completeness
    - **Validates: Requirements 1.1, 1.3-1.5, 1.7, 1.8, 1.10-1.15**
    - Test that successfully created templates include all required fields and structure
  
  - [x]* 19.2 Implement Property 19: Order Uniqueness
    - **Validates: Requirements 18.1, 18.2**
    - Test that phase orders are unique within template and activity orders are unique within phase

- [x] 20. Integration testing
  - [x]* 20.1 Write integration test for complete template creation flow
    - Test creating template with phases and activities via API
    - Verify database records created correctly
    - Verify multi-tenant isolation
  
  - [x]* 20.2 Write integration test for template application flow
    - Test applying template to project via API
    - Verify work items created with correct data
    - Verify usage tracking updated
    - Verify transaction rollback on failure
  
  - [x]* 20.3 Write integration test for template CRUD with authorization
    - Test that unauthorized users cannot access management endpoints
    - Test that users can only access templates from their organization

- [x] 21. Final checkpoint and documentation
  - [x] 21.1 Run all tests and verify passing
    - Execute all unit tests, property tests, integration tests
    - Verify minimum 80% code coverage
    - Fix any failing tests
  
  - [x] 21.2 Manual testing of critical flows
    - Test creating a template with multiple phases and activities
    - Test applying template to project and verifying work items created
    - Test filtering and searching templates
    - Test multi-language support (Spanish and Portuguese)
    - Test role-based access control
  
  - [x] 21.3 Final checkpoint
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based and integration tests that can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- The implementation follows a bottom-up approach: database → services → API → frontend
- Checkpoints ensure incremental validation at key milestones
- All property tests use fast-check library with minimum 100 iterations
- Multi-tenant isolation is enforced at every layer (database queries, service methods, API endpoints)
- All user-facing text uses i18n with Spanish and Portuguese translations
- Frontend uses shadcn/ui components for consistent design
- API endpoints follow REST conventions with proper status codes
- Validation happens at multiple layers: client-side (Zod), API (Zod), database (constraints)

# Implementation Plan: Plataforma SaaS de Gestión de Proyectos Ejecutiva

## Overview

This implementation plan breaks down the development of a multi-tenant SaaS platform for executive project management into discrete, sequential coding tasks. The platform uses Next.js 14+ with TypeScript, MySQL with Prisma ORM, NextAuth.js for authentication, and AWS Bedrock for AI capabilities. Each task builds incrementally on previous work, with checkpoints to validate progress.

## Tasks

- [x] 1. Project setup and infrastructure configuration
  - Initialize Next.js 14+ project with TypeScript and App Router
  - Configure Tailwind CSS and shadcn/ui components
  - Set up ESLint, Prettier, and TypeScript strict mode
  - Create project directory structure (app, lib, components, services, types)
  - Configure environment variables template (.env.example)
  - _Requirements: 16.1, 16.2_

- [-] 2. Database setup and core schema
  - [x] 2.1 Initialize Prisma and configure MySQL connection
    - Install Prisma and initialize with MySQL provider
    - Configure connection pooling for production
    - Connect to existing RDS MySQL instance
    - Set up database URL environment variables
    - _Requirements: 1.1, 16.3_

  - [x] 2.2 Create Prisma schema for core entities
    - Define Organization, User, Project, KanbanColumn models
    - Add organization_id to all models for multi-tenancy
    - Create composite indexes for (organization_id, ...) queries
    - Configure multi-tenant isolation via Prisma middleware
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1_

  - [ ]\* 2.3 Write property test for multi-tenant data isolation
    - **Property 1: Aislamiento de Datos Multi-Tenant**
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [x] 2.4 Create Prisma schema for work items and tracking
    - Define WorkItem, WorkItemChange, Blocker models
    - Add foreign keys and cascade delete rules
    - Create indexes for status, priority, and date queries
    - _Requirements: 4.1, 4.2, 5.1_

  - [x] 2.5 Create Prisma schema for risks and agreements
    - Define Risk, Agreement, AgreementWorkItem, AgreementNote models
    - Add risk level calculation fields
    - Create indexes for risk level and agreement status
    - _Requirements: 6.1, 7.1_

  - [x] 2.6 Create Prisma schema for AI cache
    - Define AIAnalysisCache model with expiration
    - Add unique constraint on project_id
    - Create index on expires_at for cleanup queries
    - _Requirements: 9.1, 9.4_

  - [x] 2.7 Generate Prisma client and run initial migration
    - Run prisma generate to create TypeScript client for MySQL 8.4
    - Create and apply initial migration
    - Seed database with test organization and users
    - _Requirements: 1.1_

- [-] 3. Authentication and authorization system
  - [x] 3.1 Set up NextAuth.js with credentials provider
    - Install NextAuth.js v5 and configure API route
    - Implement JWT strategy with session callbacks
    - Create sign-in and sign-out pages
    - Configure session duration and token refresh
    - _Requirements: 15.1, 15.4_

  - [x] 3.2 Implement password hashing with bcrypt
    - Install bcrypt and create password utility functions
    - Implement secure password hashing (salt factor 10+)
    - Create password comparison function for authentication
    - _Requirements: 15.3_

  - [ ]\* 3.3 Write property test for JWT token generation
    - **Property 28: Autenticación con JWT**
    - **Validates: Requirements 15.1**

  - [x] 3.4 Create RBAC permission system
    - Define Permission enum with all granular permissions
    - Create rolePermissions mapping for 5 user roles
    - Implement hasPermission and hasRole utility functions
    - _Requirements: 2.1, 2.2_

  - [x] 3.5 Implement authentication middleware
    - Create withAuth HOF for API route protection
    - Validate JWT tokens and extract user session
    - Set organization context for multi-tenant queries
    - Handle authentication errors (401, 403)
    - _Requirements: 15.4, 2.6_

  - [ ]\* 3.6 Write property test for RBAC enforcement
    - **Property 3: Control de Acceso Basado en Roles**
    - **Validates: Requirements 2.1, 2.2**

  - [ ]\* 3.7 Write unit tests for authentication flows
    - Test successful login with valid credentials
    - Test failed login with invalid credentials
    - Test inactive user rejection
    - Test token expiration handling
    - _Requirements: 15.1, 15.4, 2.6_

- [x] 4. Checkpoint - Verify authentication and database setup
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Core service layer - Organization and User management
  - [x] 5.1 Create OrganizationService with CRUD operations
    - Implement createOrganization, getOrganization, updateOrganization
    - Implement addUser and removeUser for organization membership
    - Add validation for organization settings
    - _Requirements: 1.1, 2.3_

  - [x] 5.2 Create UserService with user management
    - Implement createUser with password hashing
    - Implement updateUser, deactivateUser, getUser
    - Validate email uniqueness and role assignments
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [ ]\* 5.3 Write property test for organization_id auto-assignment
    - **Property 2: Asignación Automática de Organization ID**
    - **Validates: Requirements 1.4**

  - [ ]\* 5.4 Write property test for user deactivation
    - **Property 4: Revocación de Acceso al Desactivar Usuario**
    - **Validates: Requirements 2.6**

- [ ] 6. Core service layer - Project management
  - [x] 6.1 Create ProjectService with CRUD operations
    - Implement createProject with automatic organization_id assignment
    - Implement getProject, updateProject, archiveProject
    - Add validation for date ranges (end date > start date)
    - _Requirements: 3.1, 3.4, 3.5_

  - [x] 6.2 Implement automatic Kanban board creation
    - Create 5 default columns on project creation: Backlog, To Do, In Progress, Blockers, Done
    - Set correct order and column_type for each column
    - _Requirements: 3.2_

  - [ ]\* 6.3 Write property test for Kanban board creation
    - **Property 5: Creación Automática de Tablero Kanban**
    - **Validates: Requirements 3.2**

  - [x] 6.4 Implement getKanbanBoard method
    - Fetch project with columns and work items
    - Group work items by kanban_column_id
    - Return structured KanbanBoard object
    - _Requirements: 3.3_

  - [x] 6.5 Implement getProjectMetrics method
    - Calculate completion rate (done / total work items)
    - Calculate average blocker resolution time
    - Count active blockers and high-priority risks
    - _Requirements: 10.2_

  - [ ]\* 6.6 Write property test for archived project persistence
    - **Property 7: Persistencia de Proyectos Archivados**
    - **Validates: Requirements 3.5**

  - [ ]\* 6.7 Write unit tests for project service
    - Test project creation with valid data
    - Test validation errors for invalid date ranges
    - Test archiving and filtering of archived projects
    - _Requirements: 3.1, 3.4, 3.5_

- [ ] 7. Core service layer - Work item management
  - [x] 7.1 Create WorkItemService with CRUD operations
    - Implement createWorkItem with validation
    - Implement getWorkItem, updateWorkItem, deleteWorkItem
    - Validate owner belongs to same organization as project
    - Assign kanban_column_id based on initial status
    - _Requirements: 4.1, 4.3_

  - [x] 7.2 Implement work item change tracking
    - Create audit log entry on every work item update
    - Capture field name, old value, new value, user, timestamp
    - Implement getWorkItemHistory method
    - _Requirements: 4.2, 4.6_

  - [ ]\* 7.3 Write property test for work item change auditing
    - **Property 9: Auditoría de Cambios en Work Items**
    - **Validates: Requirements 4.2, 4.6**

  - [x] 7.4 Implement changeStatus method with Kanban sync
    - Update work item status
    - Move work item to corresponding Kanban column
    - Set completedAt timestamp when status changes to DONE
    - _Requirements: 4.3_

  - [ ]\* 7.5 Write property test for Kanban column synchronization
    - **Property 6: Sincronización de Work Items con Columnas Kanban**
    - **Validates: Requirements 3.3, 4.3**

  - [x] 7.6 Implement getOverdueWorkItems method
    - Query work items where status != DONE and estimatedEndDate < today
    - Return sorted by days overdue (descending)
    - _Requirements: 4.5_

  - [ ]\* 7.7 Write property test for overdue work item detection
    - **Property 10: Detección de Work Items Atrasados**
    - **Validates: Requirements 4.5**

  - [ ]\* 7.8 Write unit tests for work item service
    - Test work item creation with valid data
    - Test validation errors for missing required fields
    - Test status changes and Kanban column updates
    - Test overdue detection logic
    - _Requirements: 4.1, 4.3, 4.5_

- [x] 8. Core service layer - Blocker management
  - [x] 8.1 Create BlockerService with CRUD operations
    - Implement createBlocker linked to work item
    - Implement getBlocker, updateBlocker
    - Validate blocker belongs to same project as work item
    - _Requirements: 5.1_

  - [x] 8.2 Implement blocker duration calculation
    - Create getBlockerDuration method
    - Calculate duration from startDate to resolvedAt (or now if active)
    - Return duration in hours
    - _Requirements: 5.2_

  - [ ]\* 8.3 Write property test for blocker duration calculation
    - **Property 11: Cálculo de Duración de Blockers**
    - **Validates: Requirements 5.2**

  - [x] 8.4 Implement resolveBlocker method
    - Set resolvedAt timestamp and resolution text
    - Move associated work item from Blockers column to appropriate column
    - Update work item status from BLOCKED to previous status
    - _Requirements: 5.3_

  - [ ]\* 8.5 Write property test for work item movement on blocker resolution
    - **Property 12: Movimiento de Work Item al Resolver Blocker**
    - **Validates: Requirements 5.3**

  - [x] 8.6 Implement automatic severity escalation
    - Create background job to check active blockers
    - Escalate severity to CRITICAL if duration > threshold from org settings
    - _Requirements: 5.5_

  - [ ]\* 8.7 Write property test for blocker severity escalation
    - **Property 13: Escalación Automática de Severidad de Blockers**
    - **Validates: Requirements 5.5**

  - [x] 8.8 Implement getActiveBlockers and getCriticalBlockers methods
    - Query blockers where resolvedAt is null
    - Filter critical blockers by severity = CRITICAL
    - Sort by startDate (oldest first)
    - _Requirements: 5.4_

  - [ ]\* 8.9 Write unit tests for blocker service
    - Test blocker creation and linking to work item
    - Test blocker resolution and work item status update
    - Test critical blocker filtering
    - _Requirements: 5.1, 5.3, 5.4_

- [x] 9. Checkpoint - Verify core services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Core service layer - Risk management
  - [x] 10.1 Create RiskService with CRUD operations
    - Implement createRisk with automatic risk level calculation
    - Implement getRisk, updateRisk, closeRisk
    - Validate probability and impact are between 1-5
    - _Requirements: 6.1, 6.2_

  - [x] 10.2 Implement calculateRiskLevel method
    - Calculate score as probability × impact
    - Map score to risk level: LOW (1-5), MEDIUM (6-12), HIGH (13-20), CRITICAL (21-25)
    - _Requirements: 6.2_

  - [ ]\* 10.3 Write property test for risk level calculation
    - **Property 14: Cálculo de Nivel de Riesgo**
    - **Validates: Requirements 6.2**

  - [x] 10.4 Implement convertToBlocker method
    - Create blocker from risk data (description, project, severity based on risk level)
    - Link blocker to a work item if specified
    - Update risk status to MATERIALIZED
    - _Requirements: 6.3_

  - [x] 10.5 Implement convertToWorkItem method
    - Create work item from risk data (title, description, priority based on risk level)
    - Set owner from risk owner
    - Update risk status to MITIGATING
    - _Requirements: 6.3_

  - [ ]\* 10.6 Write property test for risk conversion
    - **Property 15: Conversión de Riesgo a Blocker o Work Item**
    - **Validates: Requirements 6.3**

  - [x] 10.7 Implement risk querying with sorting
    - Create getProjectRisks method with status filter
    - Sort by risk_level (CRITICAL > HIGH > MEDIUM > LOW)
    - _Requirements: 6.4_

  - [ ]\* 10.8 Write property test for risk ordering
    - **Property 16: Ordenamiento de Riesgos por Nivel**
    - **Validates: Requirements 6.4**

  - [ ]\* 10.9 Write unit tests for risk service
    - Test risk creation with valid probability and impact
    - Test risk level calculation for edge cases
    - Test conversion to blocker and work item
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 11. Core service layer - Agreement management
  - [x] 11.1 Create AgreementService with CRUD operations
    - Implement createAgreement with validation
    - Implement getAgreement, updateAgreement, completeAgreement
    - Validate agreement belongs to project
    - _Requirements: 7.1_

  - [x] 11.2 Implement linkWorkItem method
    - Create AgreementWorkItem relationship
    - Validate work item belongs to same project
    - Prevent duplicate links
    - _Requirements: 7.2_

  - [ ]\* 11.3 Write property test for bidirectional agreement-workitem association
    - **Property 17: Asociación de Agreements con Work Items**
    - **Validates: Requirements 7.2, 7.3**

  - [x] 11.4 Implement addProgressNote method
    - Create AgreementNote with user and timestamp
    - Link to agreement
    - _Requirements: 7.4_

  - [x] 11.5 Implement getProjectAgreements method
    - Query agreements by project with status filter
    - Include linked work items and progress notes
    - Sort by agreementDate (descending)
    - _Requirements: 7.1_

  - [ ]\* 11.6 Write unit tests for agreement service
    - Test agreement creation and completion
    - Test work item linking and unlinking
    - Test progress note addition
    - _Requirements: 7.1, 7.2, 7.4_

- [ ] 12. AI service integration with AWS Bedrock
  - [ ] 12.1 Set up AWS Bedrock client and configuration
    - Install AWS SDK for Bedrock Runtime
    - Configure Bedrock client with credentials from Secrets Manager
    - Set up guardrails configuration (content policy, PII detection)
    - Define model ID (Claude 3 Sonnet)
    - _Requirements: 8.1, 9.3_

  - [ ] 12.2 Create AIService base class with error handling
    - Implement executeBedrockRequest with retry logic
    - Handle GuardrailsException, ThrottlingException, TimeoutError
    - Implement exponential backoff for retries (max 3 attempts)
    - Create custom error classes: AIGuardrailsError, AIServiceError
    - _Requirements: 9.3, 16.5_

  - [ ] 12.3 Implement generateProjectReport method
    - Create prompt template with project data (work items, blockers, risks, agreements)
    - Support detail levels: EXECUTIVE, DETAILED, COMPLETE
    - Call Bedrock with structured prompt
    - Parse and return formatted report text
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]\* 12.4 Write property test for report content completeness
    - **Property 18: Contenido Completo en Reportes de IA**
    - **Validates: Requirements 8.3**

  - [ ] 12.5 Implement analyzeProject method with caching
    - Check for cached analysis (< 24 hours old)
    - If cache miss, create analysis prompt with project data
    - Call Bedrock to generate suggestions, detected risks, overdue items
    - Parse JSON response into AIAnalysis structure
    - Cache analysis with 24-hour expiration
    - _Requirements: 9.1, 9.2, 9.4_

  - [ ]\* 12.6 Write property test for AI analysis caching
    - **Property 19: Rate Limiting de Análisis de IA**
    - **Validates: Requirements 9.1, 9.4**

  - [ ]\* 12.7 Write property test for proactive suggestions
    - **Property 20: Sugerencias Proactivas para Work Items Atrasados**
    - **Validates: Requirements 9.2**

  - [ ] 12.8 Implement improveText method
    - Create prompt template for text improvement
    - Support different purposes (email, report, description)
    - Call Bedrock with text and purpose
    - Return improved text
    - _Requirements: 8.4_

  - [ ] 12.9 Implement cache management methods
    - Create getCachedAnalysis method
    - Create invalidateCache method (delete expired or manual invalidation)
    - _Requirements: 9.4_

  - [ ]\* 12.10 Write unit tests for AI service
    - Test error handling for guardrails violations
    - Test retry logic for throttling
    - Test cache hit and miss scenarios
    - Mock Bedrock client responses
    - _Requirements: 8.1, 9.1, 9.3_

- [x] 13. Dashboard and analytics service
  - [x] 13.1 Create DashboardService with executive dashboard
    - Implement getExecutiveDashboard method
    - Calculate aggregate metrics: active projects, projects at risk, critical blockers, high risks
    - Calculate completion rate across all projects
    - Calculate average blocker resolution time
    - Return ProjectSummary array with key metrics per project
    - _Requirements: 10.1, 10.2_

  - [ ]\* 13.2 Write property test for dashboard metrics calculation
    - **Property 21: Cálculo de Métricas Agregadas en Dashboard**
    - **Validates: Requirements 10.2**

  - [x] 13.3 Implement dashboard filtering
    - Add DashboardFilters parameter (date range, client, PM, status)
    - Apply filters to project queries
    - Recalculate metrics based on filtered projects
    - _Requirements: 10.5_

  - [ ]\* 13.4 Write property test for dashboard filtering
    - **Property 22: Filtrado de Dashboard**
    - **Validates: Requirements 10.5**

  - [x] 13.5 Implement getProjectHealth method
    - Calculate health score based on: overdue items, critical blockers, high risks, completion rate
    - Determine status: HEALTHY (score > 70), AT_RISK (40-70), CRITICAL (< 40)
    - Generate HealthFactor array explaining score components
    - _Requirements: 10.3_

  - [x] 13.6 Implement getOrganizationMetrics method
    - Aggregate metrics across all projects in organization
    - Calculate trends (week-over-week changes)
    - _Requirements: 10.2_

  - [ ]\* 13.7 Write unit tests for dashboard service
    - Test metric calculations with various project states
    - Test filtering logic
    - Test health score calculation
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

- [ ] 14. Checkpoint - Verify AI and dashboard services
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Export and notification service
  - [x] 15.1 Create ExportService with project export
    - Implement exportProject method with ExportOptions
    - Generate structured report with sections: executive summary, work items, blockers, risks, agreements
    - Support detail levels (filter content based on level)
    - Optionally use AI to generate narrative sections
    - Format output as PLAIN_TEXT or MARKDOWN
    - _Requirements: 11.1, 11.2, 11.5_

  - [ ]\* 15.2 Write property test for export content completeness
    - **Property 23: Contenido Completo en Exportaciones**
    - **Validates: Requirements 11.2**

  - [ ]\* 15.3 Write property test for export detail levels
    - **Property 24: Niveles de Detalle en Exportación**
    - **Validates: Requirements 11.5**

  - [x] 15.4 Implement generateNotificationMessage method
    - Create notification for critical blockers and high risks
    - Generate subject line and body with key information
    - Set priority based on severity/risk level
    - Format for email or messaging platforms
    - _Requirements: 12.1, 12.3_

  - [ ]\* 15.5 Write property test for notification generation
    - **Property 25: Generación de Mensajes de Notificación**
    - **Validates: Requirements 12.1, 12.3**

  - [x] 15.6 Implement formatForEmail method
    - Convert markdown to plain text with proper formatting
    - Add email-friendly structure (headers, spacing)
    - _Requirements: 12.2_

  - [ ]\* 15.7 Write unit tests for export service
    - Test export with different detail levels
    - Test notification message generation
    - Test email formatting
    - _Requirements: 11.1, 11.2, 12.1_

- [ ] 16. Internationalization (i18n) setup
  - [ ] 16.1 Configure next-intl for App Router
    - Install next-intl package
    - Create i18n configuration with locales (es, pt)
    - Set up middleware for locale detection
    - Configure default locale (es)
    - _Requirements: 13.1, 13.2_

  - [ ] 16.2 Create translation files structure
    - Create messages/es and messages/pt directories
    - Create translation files: common.json, projects.json, work-items.json, blockers.json, risks.json, agreements.json, dashboard.json, errors.json
    - Populate Spanish translations (primary language)
    - Populate Portuguese translations
    - _Requirements: 13.1_

  - [ ] 16.3 Implement I18nService for locale management
    - Create getCurrentLocale, setLocale methods
    - Implement translate method with parameter interpolation
    - Implement formatDate and formatNumber with locale-specific formatting
    - Persist user locale preference in database
    - _Requirements: 13.3, 13.4_

  - [ ]\* 16.4 Write property test for locale persistence
    - **Property 26: Persistencia de Preferencia de Idioma**
    - **Validates: Requirements 13.4**

  - [ ] 16.5 Create error message translation system
    - Map error codes to translation keys
    - Implement translateError function
    - Ensure all error messages are user-friendly and localized
    - _Requirements: 14.3_

  - [ ]\* 16.6 Write property test for error message localization
    - **Property 27: Mensajes de Error Comprensibles**
    - **Validates: Requirements 14.3**

  - [ ]\* 16.7 Write unit tests for i18n service
    - Test locale switching
    - Test date and number formatting for different locales
    - Test translation key resolution
    - _Requirements: 13.1, 13.3, 13.4_

- [ ] 17. API routes - Authentication endpoints
  - [x] 17.1 Create POST /api/v1/auth/signin endpoint
    - Validate email and password
    - Authenticate user with NextAuth
    - Return JWT token and user data
    - _Requirements: 15.1_

  - [x] 17.2 Create POST /api/v1/auth/signout endpoint
    - Invalidate JWT token
    - Clear session
    - _Requirements: 15.1_

  - [x] 17.3 Create POST /api/v1/auth/refresh endpoint
    - Validate refresh token
    - Generate new access token
    - _Requirements: 15.1_

  - [x] 17.4 Create GET /api/v1/auth/me endpoint
    - Return current authenticated user
    - Include organization and roles
    - _Requirements: 15.1_

  - [ ]\* 17.5 Write property test for token validation
    - **Property 30: Validación de Token en Cada Request**
    - **Validates: Requirements 15.4**

  - [ ]\* 17.6 Write property test for access attempt auditing
    - **Property 31: Auditoría de Intentos de Acceso No Autorizado**
    - **Validates: Requirements 15.5**

- [ ] 18. API routes - Organization and user endpoints
  - [x] 18.1 Create GET /api/v1/organizations/:id endpoint
    - Protect with withAuth middleware
    - Validate user belongs to organization
    - Return organization with settings
    - _Requirements: 1.1, 2.1_

  - [x] 18.2 Create PATCH /api/v1/organizations/:id endpoint
    - Protect with ORG_MANAGE permission
    - Validate and update organization settings
    - _Requirements: 1.1, 2.2_

  - [x] 18.3 Create GET /api/v1/organizations/:id/users endpoint
    - Protect with USER_VIEW permission
    - Return users in organization with roles
    - _Requirements: 2.3_

  - [x] 18.4 Create POST /api/v1/organizations/:id/users endpoint
    - Protect with USER_CREATE permission
    - Create user with hashed password
    - Assign roles
    - _Requirements: 2.3, 2.4_

  - [x] 18.5 Create DELETE /api/v1/organizations/:id/users/:userId endpoint
    - Protect with USER_DELETE permission
    - Deactivate user (soft delete)
    - _Requirements: 2.5, 2.6_

  - [ ]\* 18.6 Write integration tests for organization endpoints
    - Test organization retrieval with proper isolation
    - Test user management operations
    - Test permission enforcement
    - _Requirements: 1.1, 2.1, 2.3_

- [ ] 19. API routes - Project endpoints
  - [x] 19.1 Create GET /api/v1/projects endpoint
    - Protect with PROJECT_VIEW permission
    - Filter by organization_id automatically
    - Support pagination, filtering (status, client), sorting
    - Exclude archived projects by default
    - _Requirements: 3.1, 3.5_

  - [x] 19.2 Create POST /api/v1/projects endpoint
    - Protect with PROJECT_CREATE permission
    - Validate project data with Zod schema
    - Create project with automatic Kanban board
    - _Requirements: 3.1, 3.2_

  - [x] 19.3 Create GET /api/v1/projects/:id endpoint
    - Protect with PROJECT_VIEW permission
    - Return project with related data (work items count, blocker count, etc.)
    - _Requirements: 3.1_

  - [x] 19.4 Create PATCH /api/v1/projects/:id endpoint
    - Protect with PROJECT_UPDATE permission
    - Validate and update project fields
    - _Requirements: 3.4_

  - [x] 19.5 Create DELETE /api/v1/projects/:id endpoint
    - Protect with PROJECT_ARCHIVE permission
    - Archive project (set archived = true)
    - _Requirements: 3.5_

  - [x] 19.6 Create GET /api/v1/projects/:id/kanban endpoint
    - Protect with PROJECT_VIEW permission
    - Return Kanban board with columns and work items
    - _Requirements: 3.3_

  - [x] 19.7 Create GET /api/v1/projects/:id/metrics endpoint
    - Protect with PROJECT_VIEW permission
    - Return project metrics (completion rate, blocker stats, etc.)
    - _Requirements: 10.2_

  - [x] 19.8 Create GET /api/v1/projects/:id/health endpoint
    - Protect with PROJECT_VIEW permission
    - Return project health score and factors
    - _Requirements: 10.3_

  - [ ]\* 19.9 Write integration tests for project endpoints
    - Test project CRUD operations
    - Test Kanban board retrieval
    - Test metrics calculation
    - Test multi-tenant isolation
    - _Requirements: 3.1, 3.2, 3.3, 10.2_

- [ ] 20. API routes - Work item endpoints
  - [x] 20.1 Create GET /api/v1/projects/:projectId/work-items endpoint
    - Protect with WORK_ITEM_VIEW permission
    - Filter by project and organization
    - Support filtering by status, priority, owner
    - Support pagination and sorting
    - _Requirements: 4.1_

  - [x] 20.2 Create POST /api/v1/projects/:projectId/work-items endpoint
    - Protect with WORK_ITEM_CREATE permission
    - Validate work item data
    - Create work item with automatic organization_id and kanban_column_id
    - _Requirements: 4.1, 4.3_

  - [x] 20.3 Create GET /api/v1/work-items/:id endpoint
    - Protect with WORK_ITEM_VIEW permission
    - Return work item with related data (blockers, agreements)
    - _Requirements: 4.1_

  - [x] 20.4 Create PATCH /api/v1/work-items/:id endpoint
    - Protect with WORK_ITEM_UPDATE or WORK_ITEM_UPDATE_OWN permission
    - Validate and update work item
    - Create audit log entry for changes
    - _Requirements: 4.2, 4.4_

  - [x] 20.5 Create PATCH /api/v1/work-items/:id/status endpoint
    - Protect with WORK_ITEM_UPDATE permission
    - Change status and sync Kanban column
    - Set completedAt if status is DONE
    - _Requirements: 4.3_

  - [x] 20.6 Create GET /api/v1/work-items/:id/history endpoint
    - Protect with WORK_ITEM_VIEW permission
    - Return work item change history
    - _Requirements: 4.6_

  - [x] 20.7 Create GET /api/v1/projects/:projectId/work-items/overdue endpoint
    - Protect with WORK_ITEM_VIEW permission
    - Return overdue work items for project
    - _Requirements: 4.5_

  - [ ]\* 20.8 Write integration tests for work item endpoints
    - Test work item CRUD operations
    - Test status changes and Kanban sync
    - Test change history tracking
    - Test overdue detection
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

- [x] 21. Checkpoint - Verify API routes for core entities
  - Ensure all tests pass, ask the user if questions arise.

- [x] 22. API routes - Blocker endpoints
  - [x] 22.1 Create GET /api/v1/projects/:projectId/blockers endpoint
    - Protect with BLOCKER_VIEW permission
    - Filter by project and organization
    - Support filtering by severity, resolved status
    - _Requirements: 5.1_

  - [x] 22.2 Create POST /api/v1/projects/:projectId/blockers endpoint
    - Protect with BLOCKER_CREATE permission
    - Validate blocker data
    - Create blocker linked to work item
    - Update work item status to BLOCKED
    - _Requirements: 5.1_

  - [x] 22.3 Create GET /api/v1/blockers/:id endpoint
    - Protect with BLOCKER_VIEW permission
    - Return blocker with duration calculation
    - _Requirements: 5.1, 5.2_

  - [x] 22.4 Create PATCH /api/v1/blockers/:id endpoint
    - Protect with BLOCKER_UPDATE permission
    - Validate and update blocker fields
    - _Requirements: 5.1_

  - [x] 22.5 Create POST /api/v1/blockers/:id/resolve endpoint
    - Protect with BLOCKER_RESOLVE permission
    - Set resolvedAt and resolution text
    - Move work item from Blockers column
    - _Requirements: 5.3_

  - [x] 22.6 Create GET /api/v1/projects/:projectId/blockers/critical endpoint
    - Protect with BLOCKER_VIEW permission
    - Return critical blockers (severity = CRITICAL or duration > threshold)
    - _Requirements: 5.4, 5.5_

  - [ ]\* 22.7 Write integration tests for blocker endpoints
    - Test blocker creation and work item status update
    - Test blocker resolution and work item movement
    - Test critical blocker filtering
    - _Requirements: 5.1, 5.3, 5.4_

- [x] 23. API routes - Risk endpoints
  - [x] 23.1 Create GET /api/v1/projects/:projectId/risks endpoint
    - Protect with RISK_VIEW permission
    - Filter by project and organization
    - Support filtering by risk level, status
    - Sort by risk level (descending)
    - _Requirements: 6.1, 6.4_

  - [x] 23.2 Create POST /api/v1/projects/:projectId/risks endpoint
    - Protect with RISK_CREATE permission
    - Validate risk data (probability and impact 1-5)
    - Calculate and set risk level automatically
    - _Requirements: 6.1, 6.2_

  - [x] 23.3 Create GET /api/v1/risks/:id endpoint
    - Protect with RISK_VIEW permission
    - Return risk with calculated risk level
    - _Requirements: 6.1_

  - [x] 23.4 Create PATCH /api/v1/risks/:id endpoint
    - Protect with RISK_UPDATE permission
    - Validate and update risk
    - Recalculate risk level if probability or impact changed
    - _Requirements: 6.1, 6.2_

  - [x] 23.5 Create POST /api/v1/risks/:id/convert-to-blocker endpoint
    - Protect with RISK_UPDATE and BLOCKER_CREATE permissions
    - Create blocker from risk data
    - Update risk status to MATERIALIZED
    - _Requirements: 6.3_

  - [x] 23.6 Create POST /api/v1/risks/:id/convert-to-work-item endpoint
    - Protect with RISK_UPDATE and WORK_ITEM_CREATE permissions
    - Create work item from risk data
    - Update risk status to MITIGATING
    - _Requirements: 6.3_

  - [x] 23.7 Create POST /api/v1/risks/:id/close endpoint
    - Protect with RISK_UPDATE permission
    - Set closedAt and closure notes
    - Update status to CLOSED
    - _Requirements: 6.1_

  - [ ]\* 23.8 Write integration tests for risk endpoints
    - Test risk CRUD operations
    - Test risk level calculation
    - Test conversion to blocker and work item
    - Test risk ordering
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 24. API routes - Agreement endpoints
  - [ ] 24.1 Create GET /api/v1/projects/:projectId/agreements endpoint
    - Protect with AGREEMENT_VIEW permission
    - Filter by project and organization
    - Support filtering by status
    - Include linked work items and progress notes
    - _Requirements: 7.1_

  - [ ] 24.2 Create POST /api/v1/projects/:projectId/agreements endpoint
    - Protect with AGREEMENT_CREATE permission
    - Validate agreement data
    - Create agreement
    - _Requirements: 7.1_

  - [ ] 24.3 Create GET /api/v1/agreements/:id endpoint
    - Protect with AGREEMENT_VIEW permission
    - Return agreement with work items and notes
    - _Requirements: 7.1_

  - [ ] 24.4 Create PATCH /api/v1/agreements/:id endpoint
    - Protect with AGREEMENT_UPDATE permission
    - Validate and update agreement
    - _Requirements: 7.1_

  - [ ] 24.5 Create POST /api/v1/agreements/:id/link-work-item endpoint
    - Protect with AGREEMENT_UPDATE permission
    - Validate work item belongs to same project
    - Create AgreementWorkItem link
    - _Requirements: 7.2_

  - [ ] 24.6 Create POST /api/v1/agreements/:id/progress-notes endpoint
    - Protect with AGREEMENT_UPDATE permission
    - Create progress note with user and timestamp
    - _Requirements: 7.4_

  - [ ] 24.7 Create POST /api/v1/agreements/:id/complete endpoint
    - Protect with AGREEMENT_UPDATE permission
    - Set completedAt timestamp
    - Update status to COMPLETED
    - _Requirements: 7.1_

  - [ ]\* 24.8 Write integration tests for agreement endpoints
    - Test agreement CRUD operations
    - Test work item linking
    - Test progress note addition
    - _Requirements: 7.1, 7.2, 7.4_

- [ ] 25. API routes - AI assistant endpoints
  - [ ] 25.1 Create POST /api/v1/ai/generate-report endpoint
    - Protect with AI_USE permission
    - Validate project ID and detail level
    - Call AIService.generateProjectReport
    - Return formatted report text
    - Handle AI errors gracefully
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ] 25.2 Create POST /api/v1/ai/analyze-project endpoint
    - Protect with AI_USE permission
    - Validate project ID
    - Call AIService.analyzeProject (with caching)
    - Return analysis with suggestions
    - _Requirements: 9.1, 9.2_

  - [ ] 25.3 Create POST /api/v1/ai/suggest-description endpoint
    - Protect with AI_USE permission
    - Validate context string
    - Call AIService.suggestWorkItemDescription
    - Return suggestion array
    - _Requirements: 8.4_

  - [ ] 25.4 Create POST /api/v1/ai/improve-text endpoint
    - Protect with AI_USE permission
    - Validate text and purpose
    - Call AIService.improveText
    - Return improved text
    - _Requirements: 8.4_

  - [ ] 25.5 Create GET /api/v1/ai/cached-analysis/:projectId endpoint
    - Protect with AI_USE permission
    - Return cached analysis if exists and not expired
    - _Requirements: 9.4_

  - [ ] 25.6 Create DELETE /api/v1/ai/cached-analysis/:projectId endpoint
    - Protect with AI_USE permission
    - Invalidate cached analysis for project
    - _Requirements: 9.4_

  - [ ]\* 25.7 Write property test for async AI processing
    - **Property 32: Procesamiento Asíncrono de IA**
    - **Validates: Requirements 16.5**

  - [ ]\* 25.8 Write integration tests for AI endpoints
    - Test report generation with mocked Bedrock
    - Test project analysis with caching
    - Test error handling for guardrails violations
    - _Requirements: 8.1, 9.1, 9.3_

- [ ] 26. API routes - Dashboard and export endpoints
  - [ ] 26.1 Create GET /api/v1/dashboard/executive endpoint
    - Protect with DASHBOARD_EXECUTIVE permission
    - Parse and validate filters from query params
    - Call DashboardService.getExecutiveDashboard
    - Return dashboard data with metrics
    - _Requirements: 10.1, 10.2, 10.5_

  - [ ] 26.2 Create GET /api/v1/dashboard/metrics endpoint
    - Protect with DASHBOARD_EXECUTIVE permission
    - Call DashboardService.getOrganizationMetrics
    - Return organization-wide metrics
    - _Requirements: 10.2_

  - [ ] 26.3 Create POST /api/v1/export/project/:projectId endpoint
    - Protect with EXPORT_PROJECT permission
    - Validate export options
    - Call ExportService.exportProject
    - Return formatted export content
    - _Requirements: 11.1, 11.2, 11.5_

  - [ ] 26.4 Create POST /api/v1/export/notification endpoint
    - Protect with EXPORT_PROJECT permission
    - Validate notification type and entity ID
    - Call ExportService.generateNotificationMessage
    - Return notification message
    - _Requirements: 12.1, 12.3_

  - [ ]\* 26.5 Write integration tests for dashboard and export endpoints
    - Test dashboard with various filters
    - Test export with different detail levels
    - Test notification generation
    - _Requirements: 10.1, 10.2, 11.1, 12.1_

- [ ] 27. Checkpoint - Verify all API routes
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 28. Frontend - Layout and navigation components
  - [x] 28.1 Create root layout with i18n provider
    - Set up next-intl provider in root layout
    - Create locale-based routing structure
    - Add metadata and viewport configuration
    - _Requirements: 13.1_

  - [x] 28.2 Create main navigation component
    - Implement responsive sidebar with navigation links
    - Show different menu items based on user role
    - Add locale switcher (ES/PT)
    - Include user profile dropdown with sign out
    - _Requirements: 2.1, 13.3_

  - [x] 28.3 Create header component
    - Display current page title
    - Show breadcrumb navigation
    - Include quick actions (create project, create work item)
    - _Requirements: 14.1_

  - [x] 28.4 Create loading and error boundary components
    - Implement loading.tsx for route transitions
    - Implement error.tsx for error handling
    - Create user-friendly error messages
    - _Requirements: 14.3, 17.1_

- [ ] 29. Frontend - Authentication pages
  - [x] 29.1 Create sign-in page
    - Build sign-in form with email and password fields
    - Implement form validation with Zod
    - Handle authentication with NextAuth
    - Show error messages for failed login
    - Redirect to dashboard on success
    - _Requirements: 15.1, 14.3_

  - [x] 29.2 Create sign-out functionality
    - Implement sign-out button in navigation
    - Clear session and redirect to sign-in
    - _Requirements: 15.1_

  - [x] 29.3 Create protected route wrapper
    - Implement middleware to check authentication
    - Redirect unauthenticated users to sign-in
    - Check user permissions for routes
    - _Requirements: 15.4, 2.1_

- [ ] 30. Frontend - Dashboard pages
  - [x] 30.1 Create executive dashboard page
    - Display key metrics cards (active projects, at-risk projects, critical blockers, high risks)
    - Show project list with health indicators
    - Implement filter controls (date range, client, PM, status)
    - Add charts for completion rate and trends
    - _Requirements: 10.1, 10.2, 10.4, 10.5_

  - [x] 30.2 Create project health visualization component
    - Display health score with color coding (green/yellow/red)
    - Show health factors with impact indicators
    - _Requirements: 10.3_

  - [x] 30.3 Implement dashboard real-time updates
    - Use React Query for data fetching with auto-refresh
    - Show loading states during data fetch
    - _Requirements: 10.6_

- [ ] 31. Frontend - Project management pages
  - [x] 31.1 Create projects list page
    - Display projects in card or table view
    - Implement search and filtering
    - Show project status and key metrics
    - Add "Create Project" button (role-based visibility)
    - _Requirements: 3.1, 3.5_

  - [x] 31.2 Create project creation/edit form
    - Build form with all project fields
    - Implement validation with Zod
    - Handle form submission to API
    - Show success/error messages
    - _Requirements: 3.1, 3.4, 14.3_

  - [x] 31.3 Create project detail page
    - Display project information
    - Show tabs for: Kanban board, Work Items, Blockers, Risks, Agreements
    - Include project metrics summary
    - Add AI-powered report generation button
    - _Requirements: 3.1, 8.1_

  - [x] 31.4 Create Kanban board component
    - Display 5 columns with work items
    - Implement drag-and-drop for work item movement
    - Update work item status on column change
    - Show work item cards with key info (title, owner, priority, dates)
    - _Requirements: 3.3, 4.3_

  - [x] 31.5 Implement project archiving
    - Add archive button with confirmation dialog
    - Filter archived projects from main list
    - Allow viewing archived projects in separate view
    - _Requirements: 3.5_

- [ ] 32. Frontend - Work item management pages
  - [x] 32.1 Create work item list view
    - Display work items in table with sorting and filtering
    - Show status, priority, owner, dates
    - Highlight overdue items
    - Add "Create Work Item" button
    - _Requirements: 4.1, 4.5_

  - [x] 32.2 Create work item creation/edit form
    - Build form with all work item fields
    - Implement validation
    - Support AI-powered description suggestions
    - Handle form submission
    - _Requirements: 4.1, 4.4, 8.4_

  - [x] 32.3 Create work item detail modal/page
    - Display work item information
    - Show change history timeline
    - Display linked blockers and agreements
    - Add status change controls
    - _Requirements: 4.1, 4.6_

  - [x] 32.4 Implement work item status change
    - Create status dropdown or buttons
    - Update status via API
    - Show confirmation for status changes
    - Reflect changes in Kanban board
    - _Requirements: 4.3_

- [ ] 33. Frontend - Blocker, risk, and agreement pages
  - [ ] 33.1 Create blocker list and management
    - Display active blockers with severity indicators
    - Show blocker duration
    - Implement blocker creation form
    - Add resolve blocker functionality
    - Highlight critical blockers
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 33.2 Create risk list and management
    - Display risks sorted by risk level
    - Show risk matrix visualization (probability vs impact)
    - Implement risk creation/edit form
    - Add convert to blocker/work item actions
    - Add close risk functionality
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 33.3 Create agreement list and management
    - Display agreements with status
    - Show linked work items
    - Implement agreement creation/edit form
    - Add link work item functionality
    - Add progress notes section
    - Add complete agreement action
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 34. Frontend - AI assistant features
  - [ ] 34.1 Create AI report generation interface
    - Add "Generate Report" button in project detail
    - Show detail level selector (Executive, Detailed, Complete)
    - Display loading state during generation
    - Show generated report in modal or page
    - Add copy to clipboard functionality
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ] 34.2 Create AI project analysis interface
    - Add "Analyze Project" button
    - Display analysis results with suggestions
    - Show detected risks and overdue items
    - Allow user to act on suggestions (create blocker, adjust dates)
    - _Requirements: 9.1, 9.2_

  - [ ] 34.3 Implement AI text improvement features
    - Add "Improve with AI" button in text fields
    - Show improved text suggestions
    - Allow user to accept or reject suggestions
    - _Requirements: 8.4_

  - [ ] 34.4 Add AI loading and error states
    - Show loading spinner during AI requests
    - Display user-friendly error messages for AI failures
    - Handle guardrails violations gracefully
    - _Requirements: 9.3, 14.3_

- [ ] 35. Frontend - Export and notification features
  - [ ] 35.1 Create export functionality
    - Add "Export Project" button
    - Show export options dialog (detail level, sections to include)
    - Generate and download export file
    - Show success message
    - _Requirements: 11.1, 11.2, 11.5_

  - [ ] 35.2 Create notification message generation
    - Add "Generate Notification" button for critical items
    - Display generated message in modal
    - Add copy to clipboard functionality
    - Support email formatting
    - _Requirements: 12.1, 12.2, 12.3_

- [ ] 36. Frontend - User settings and preferences
  - [ ] 36.1 Create user settings page
    - Display user profile information
    - Add locale preference selector
    - Save preferences to database
    - _Requirements: 13.3, 13.4_

  - [ ] 36.2 Implement locale switching
    - Add language switcher in navigation
    - Update UI immediately on locale change
    - Persist preference for future sessions
    - _Requirements: 13.3, 13.4_

- [ ] 37. Checkpoint - Verify frontend implementation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 38. Error handling and logging
  - [ ] 38.1 Implement global error handler
    - Create error handler middleware for API routes
    - Map errors to appropriate HTTP status codes
    - Return standardized error responses
    - Log errors to CloudWatch (in production)
    - _Requirements: 14.3, 17.2_

  - [ ] 38.2 Create error logging service
    - Implement logger with Winston
    - Configure CloudWatch transport for production
    - Log errors with context (user, request, stack trace)
    - _Requirements: 17.2_

  - [ ]\* 38.3 Write property test for error logging
    - **Property 33: Registro de Errores del Sistema**
    - **Validates: Requirements 17.2**

  - [ ] 38.4 Implement audit logging for security events
    - Log authentication failures
    - Log authorization failures
    - Log sensitive operations (user creation, role changes)
    - _Requirements: 15.5_

  - [ ]\* 38.5 Write unit tests for error handling
    - Test error handler with different error types
    - Test error message localization
    - Test logging functionality
    - _Requirements: 14.3, 17.2_

- [ ] 39. Performance optimization
  - [ ] 39.1 Implement database query optimization
    - Add composite indexes for common queries
    - Implement MySQL connection pooling
    - Optimize N+1 queries with Prisma includes
    - _Requirements: 16.3_

  - [ ] 39.2 Implement caching strategy
    - Set up Redis for session and data caching (optional)
    - Cache AI analysis results in database
    - Implement cache invalidation on data changes
    - _Requirements: 9.4, 16.4_

  - [ ] 39.3 Optimize frontend performance
    - Implement code splitting for routes
    - Add image optimization with Next.js Image
    - Implement lazy loading for heavy components
    - Use React Query for efficient data fetching
    - _Requirements: 16.1_

  - [ ] 39.4 Add performance monitoring
    - Implement API response time tracking
    - Add custom CloudWatch metrics
    - Monitor database query performance
    - _Requirements: 17.1_

- [ ] 40. Security hardening
  - [ ] 40.1 Implement rate limiting
    - Add rate limiting middleware for API routes
    - Implement AI request rate limiting (10 requests/minute per user)
    - _Requirements: 9.5_

  - [ ] 40.2 Add input validation and sanitization
    - Implement Zod schemas for all API inputs
    - Sanitize user inputs to prevent XSS
    - Validate file uploads (if any)
    - _Requirements: 14.2_

  - [ ]\* 40.3 Write property test for required field validation
    - **Property 8: Validación de Campos Requeridos en Entidades**
    - **Validates: Requirements 3.1, 4.1, 5.1, 6.1, 7.1**

  - [ ] 40.4 Implement CSRF protection
    - Enable CSRF tokens for state-changing operations
    - Configure NextAuth CSRF protection
    - _Requirements: 15.2_

  - [ ] 40.5 Configure security headers
    - Set Content-Security-Policy headers
    - Enable HSTS, X-Frame-Options, X-Content-Type-Options
    - Configure CORS properly
    - _Requirements: 15.2_

  - [ ]\* 40.6 Write property test for password hashing
    - **Property 29: Hashing Seguro de Contraseñas**
    - **Validates: Requirements 15.3**

- [ ] 41. Testing - Property-based tests
  - [ ]\* 41.1 Set up fast-check and test infrastructure
    - Install fast-check library
    - Create custom generators for domain models
    - Configure property test settings (100+ runs per test)
    - _Requirements: All properties_

  - [ ]\* 41.2 Implement remaining property tests
    - Verify all 33 correctness properties have corresponding tests
    - Ensure each property test references the design property number
    - Run full property test suite
    - _Requirements: All properties_

- [ ] 42. Testing - Integration tests
  - [ ]\* 42.1 Set up integration test environment
    - Configure Testcontainers for MySQL
    - Create test database setup and teardown utilities
    - Implement test data factories
    - _Requirements: 16.6_

  - [ ]\* 42.2 Write integration tests for critical flows
    - Test complete project lifecycle (create, add work items, blockers, archive)
    - Test work item flow (create, update, change status, complete)
    - Test risk conversion to blocker/work item
    - Test dashboard metric calculations
    - _Requirements: 3.1, 4.1, 6.3, 10.2_

- [ ] 43. Testing - E2E tests
  - [ ]\* 43.1 Set up Playwright for E2E testing
    - Install and configure Playwright
    - Create test fixtures and helpers
    - Configure test environments (dev, staging)
    - _Requirements: 16.7_

  - [ ]\* 43.2 Write E2E tests for user workflows
    - Test PM workflow: sign in, create project, manage work items, generate report
    - Test consultant workflow: view projects, update own work items
    - Test executive workflow: view dashboard, filter projects, export reports
    - _Requirements: 2.1, 3.1, 4.1, 8.1, 10.1_

- [ ] 44. Checkpoint - Verify all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 45. AWS infrastructure setup
  - [ ] 45.1 Set up VPC and networking
    - Create VPC with public and private subnets across 2 AZs
    - Configure NAT Gateway for private subnet internet access
    - Set up security groups for EC2, RDS, ALB
    - _Requirements: 16.8_

  - [ ] 45.2 Configure existing RDS MySQL database
    - Use existing RDS MySQL 8.4 instance (db.t4g.micro, 20 GB, 3000 IOPS, us-east-1b)
    - Create new database 'saas_pm_app'
    - Configure connection pooling
    - Enable automated backups if not already enabled
    - Estimated cost: $0 (existing instance)
    - _Requirements: 16.3_

  - [ ] 45.3 Set up EC2 instances and Auto Scaling
    - Create EC2 launch template with Node.js 20
    - Configure Auto Scaling Group (min 2, max 4 instances)
    - Set up scaling policies based on CPU utilization
    - Configure user data script for application deployment
    - _Requirements: 16.8_

  - [ ] 45.4 Set up Application Load Balancer
    - Create ALB in public subnets
    - Configure target group for EC2 instances
    - Set up health checks on /api/health endpoint
    - Configure SSL/TLS with ACM certificate
    - Enable sticky sessions
    - _Requirements: 16.8_

  - [ ] 45.5 Set up S3 buckets
    - Create buckets for exports, assets, and backups
    - Configure lifecycle policies (30-day retention for exports)
    - Enable versioning and encryption
    - Set up CORS for asset bucket
    - _Requirements: 11.3_

  - [ ] 45.6 Configure AWS Secrets Manager
    - Store database credentials
    - Store JWT secret
    - Store Bedrock API credentials
    - Store NextAuth secret
    - _Requirements: 15.2_

  - [ ] 45.7 Set up CloudWatch monitoring
    - Create CloudWatch dashboard for key metrics
    - Configure alarms for CPU, memory, errors
    - Set up log groups for application logs
    - Configure log retention policies
    - _Requirements: 17.1_

  - [ ] 45.8 Configure AWS Bedrock access
    - Set up IAM role for Bedrock access
    - Configure guardrails for content filtering
    - Test Bedrock connectivity
    - _Requirements: 8.1, 9.3_

- [ ] 46. CI/CD pipeline setup
  - [ ] 46.1 Create GitHub Actions workflow for testing
    - Set up workflow to run on push and PR
    - Configure MySQL 8.4 service for tests
    - Run unit, property, and integration tests
    - Upload coverage reports
    - _Requirements: 16.6_

  - [ ] 46.2 Create GitHub Actions workflow for deployment
    - Set up workflow to deploy on main branch push
    - Build Next.js application
    - Create deployment package
    - Upload to S3
    - Deploy to EC2 via CodeDeploy or custom script
    - _Requirements: 16.8_

  - [ ] 46.3 Implement database migration strategy
    - Create migration script for production
    - Run Prisma migrations in deployment pipeline
    - Implement rollback strategy
    - _Requirements: 16.3_

  - [ ] 46.4 Set up blue-green deployment
    - Create deployment script for zero-downtime updates
    - Configure ALB to switch between target groups
    - Implement health checks before traffic switch
    - Keep old instances for 1 hour for rollback
    - _Requirements: 16.8_

- [ ] 47. Documentation and final polish
  - [ ] 47.1 Create API documentation
    - Document all API endpoints with request/response examples
    - Create OpenAPI/Swagger specification
    - Add authentication and authorization details
    - _Requirements: 14.1_

  - [ ] 47.2 Create user documentation
    - Write user guide for each role (Executive, Admin, PM, Consultant)
    - Document key workflows with screenshots
    - Create FAQ section
    - _Requirements: 14.1_

  - [ ] 47.3 Create deployment documentation
    - Document infrastructure setup steps
    - Create runbook for common operations
    - Document monitoring and alerting setup
    - _Requirements: 16.8_

  - [ ] 47.4 Create developer documentation
    - Document project structure and architecture
    - Create contribution guidelines
    - Document testing strategy
    - Add code examples for common tasks
    - _Requirements: 16.1_

  - [ ] 47.5 Implement health check endpoint
    - Create /api/health endpoint
    - Check database connectivity
    - Check Bedrock connectivity
    - Return service status
    - _Requirements: 17.1_

  - [ ] 47.6 Add accessibility improvements
    - Ensure all interactive elements are keyboard accessible
    - Add ARIA labels where needed
    - Test with screen readers
    - Ensure color contrast meets WCAG standards
    - _Requirements: 14.1_

- [ ] 48. Final checkpoint and production readiness
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all infrastructure is configured correctly
  - Run full E2E test suite against staging environment
  - Perform security audit
  - Review performance metrics
  - Confirm monitoring and alerting are working

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Integration tests validate multi-component interactions
- E2E tests validate complete user workflows
- Checkpoints ensure incremental validation and provide opportunities for user feedback
- The implementation follows a bottom-up approach: database → services → API → frontend
- All code should be written in TypeScript for type safety
- All user-facing text should be internationalized (Spanish and Portuguese)
- Security and performance are built in from the start, not added later

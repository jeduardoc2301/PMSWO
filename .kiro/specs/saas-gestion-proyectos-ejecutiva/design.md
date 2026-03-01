# Diseño Técnico: Plataforma SaaS de Gestión de Proyectos Ejecutiva

## Visión General

Esta plataforma es un sistema SaaS multi-tenant diseñado para optimizar la gestión de proyectos ejecutivos mediante metodología ágil Kanban, potenciado por IA para reducir la carga administrativa de Project Managers y consultores. El sistema proporciona visibilidad ejecutiva en tiempo real mientras mantiene la simplicidad operativa.

### Objetivos del Diseño

- Arquitectura multi-tenant escalable con aislamiento lógico de datos
- Integración nativa con AWS Bedrock para asistencia con IA
- Interfaz intuitiva que minimiza la curva de aprendizaje
- Performance optimizado para respuestas sub-2 segundos
- Seguridad empresarial con RBAC granular
- Preparación para internacionalización (i18n)

### Principios de Diseño

1. **Simplicidad primero**: Cada funcionalidad debe ser accesible en máximo 3 clics
2. **IA como asistente**: La IA sugiere, el usuario decide
3. **Datos aislados**: Separación estricta por organización
4. **Performance proactivo**: Caché inteligente y procesamiento asíncrono
5. **Seguridad por defecto**: Validación en cada capa

## Arquitectura

### Arquitectura General del Sistema

```mermaid
graph TB
    subgraph "Cliente"
        Browser[Navegador Web]
    end

    subgraph "AWS Cloud"
        subgraph "Application Layer"
            ALB[Application Load Balancer]
            Next[Next.js App<br/>EC2 Auto Scaling]
        end

        subgraph "Data Layer"
            RDS[(MySQL RDS<br/>(Existente))]
            S3[S3 Bucket<br/>Exports/Assets]
        end

        subgraph "AI Layer"
            Bedrock[AWS Bedrock<br/>Claude/Guardrails]
        end

        subgraph "Security"
            WAF[AWS WAF]
            Secrets[Secrets Manager]
        end
    end

    Browser -->|HTTPS| WAF
    WAF --> ALB
    ALB --> Next
    Next -->|SQL| RDS
    Next -->|Store/Retrieve| S3
    Next -->|AI Requests| Bedrock
    Next -->|Credentials| Secrets
```

### Arquitectura Multi-Tenant

El sistema implementa multi-tenancy mediante **separación lógica** (shared database, shared schema):

- Todas las tablas incluyen columna `organization_id`
- Multi-tenancy se implementa mediante filtros en Prisma y middleware de Next.js
- MySQL no tiene RLS nativo, pero el aislamiento se garantiza mediante:
  - Filtros automáticos en todas las queries con `organization_id`
  - Middleware que valida y aplica contexto de organización
  - Índices compuestos para performance
- Índices compuestos en `(organization_id, ...)` para performance

**Ventajas**:

- Costo-efectivo: Una sola base de datos para todas las organizaciones
- Mantenimiento simplificado: Actualizaciones y backups centralizados
- Escalabilidad: Agregar organizaciones no requiere provisioning
- Seguridad: Aislamiento garantizado a nivel de aplicación con validación estricta

### Stack Tecnológico

| Capa          | Tecnología                | Justificación                                                                 |
| ------------- | ------------------------- | ----------------------------------------------------------------------------- |
| Frontend      | Next.js 14+ (App Router)  | SSR, RSC, optimización automática, TypeScript nativo                          |
| Backend       | Next.js API Routes        | Unificación de stack, serverless-ready, TypeScript                            |
| Base de Datos | MySQL 8.4 (RDS Existente) | ACID, JSON nativo (8.0+), madurez empresarial, instancia existente (costo $0) |
| ORM           | Prisma                    | Type-safety, migraciones, multi-tenant patterns                               |
| Autenticación | NextAuth.js v5            | JWT, múltiples providers, session management                                  |
| IA            | AWS Bedrock (Claude 3)    | Guardrails nativos, escalabilidad, compliance                                 |
| UI            | Tailwind CSS + shadcn/ui  | Componentes accesibles, customización, DX                                     |
| i18n          | next-intl                 | App Router compatible, type-safe, SSR                                         |
| Estado        | Zustand + React Query     | Simple, performante, server state management                                  |
| Validación    | Zod                       | Type-safe, composable, error messages                                         |

## Componentes y Interfaces

### Arquitectura de Capas

```mermaid
graph LR
    subgraph "Presentation Layer"
        UI[React Components]
        Pages[Next.js Pages]
    end

    subgraph "Application Layer"
        API[API Routes]
        Services[Business Services]
        AIService[AI Service]
    end

    subgraph "Data Layer"
        Prisma[Prisma ORM]
        DB[(MySQL)]
    end

    UI --> Pages
    Pages --> API
    API --> Services
    Services --> AIService
    Services --> Prisma
    Prisma --> DB
```

### Componentes Principales

#### 1. Authentication & Authorization Module

**Responsabilidades**:

- Autenticación de usuarios con JWT
- Gestión de sesiones
- Validación de roles y permisos (RBAC)
- Middleware de protección de rutas

**Interfaces**:

```typescript
interface AuthService {
  signIn(email: string, password: string): Promise<Session>
  signOut(): Promise<void>
  getCurrentUser(): Promise<User | null>
  hasPermission(user: User, permission: Permission): boolean
  hasRole(user: User, role: Role): boolean
}

interface Session {
  user: User
  accessToken: string
  refreshToken: string
  expiresAt: Date
}
```

#### 2. Organization Management Module

**Responsabilidades**:

- Gestión de organizaciones (tenants)
- Configuración de organización
- Gestión de usuarios de la organización

**Interfaces**:

```typescript
interface OrganizationService {
  createOrganization(data: CreateOrganizationDTO): Promise<Organization>
  getOrganization(id: string): Promise<Organization>
  updateOrganization(id: string, data: UpdateOrganizationDTO): Promise<Organization>
  addUser(orgId: string, userId: string, roles: Role[]): Promise<void>
  removeUser(orgId: string, userId: string): Promise<void>
}
```

#### 3. Project Management Module

**Responsabilidades**:

- CRUD de proyectos
- Gestión de tableros Kanban
- Asignación de miembros del equipo
- Cálculo de métricas del proyecto

**Interfaces**:

```typescript
interface ProjectService {
  createProject(data: CreateProjectDTO): Promise<Project>
  getProject(id: string): Promise<Project>
  updateProject(id: string, data: UpdateProjectDTO): Promise<Project>
  archiveProject(id: string): Promise<void>
  getProjectMetrics(id: string): Promise<ProjectMetrics>
  getKanbanBoard(projectId: string): Promise<KanbanBoard>
}

interface KanbanBoard {
  columns: KanbanColumn[]
  workItems: WorkItem[]
}

interface KanbanColumn {
  id: string
  name: string
  order: number
  workItemIds: string[]
}
```

#### 4. Work Item Management Module

**Responsabilidades**:

- CRUD de work items
- Gestión de estados y transiciones
- Tracking de cambios (audit log)
- Detección de items atrasados

**Interfaces**:

```typescript
interface WorkItemService {
  createWorkItem(data: CreateWorkItemDTO): Promise<WorkItem>
  getWorkItem(id: string): Promise<WorkItem>
  updateWorkItem(id: string, data: UpdateWorkItemDTO): Promise<WorkItem>
  changeStatus(id: string, newStatus: WorkItemStatus): Promise<WorkItem>
  getWorkItemHistory(id: string): Promise<WorkItemChange[]>
  getOverdueWorkItems(projectId: string): Promise<WorkItem[]>
}

interface WorkItemChange {
  id: string
  workItemId: string
  field: string
  oldValue: any
  newValue: any
  changedBy: User
  changedAt: Date
}
```

#### 5. Blocker Management Module

**Responsabilidades**:

- Registro y seguimiento de blockers
- Cálculo de tiempo de bloqueo
- Identificación de blockers críticos
- Resolución de blockers

**Interfaces**:

```typescript
interface BlockerService {
  createBlocker(data: CreateBlockerDTO): Promise<Blocker>
  getBlocker(id: string): Promise<Blocker>
  resolveBlocker(id: string, resolution: string): Promise<Blocker>
  getActiveBlockers(projectId: string): Promise<Blocker[]>
  getCriticalBlockers(projectId: string): Promise<Blocker[]>
  getBlockerDuration(blockerId: string): Duration
}
```

#### 6. Risk Management Module

**Responsabilidades**:

- Gestión de riesgos del proyecto
- Cálculo de nivel de riesgo
- Conversión de riesgos a blockers/work items
- Seguimiento de mitigación

**Interfaces**:

```typescript
interface RiskService {
  createRisk(data: CreateRiskDTO): Promise<Risk>
  getRisk(id: string): Promise<Risk>
  updateRisk(id: string, data: UpdateRiskDTO): Promise<Risk>
  calculateRiskLevel(probability: number, impact: number): RiskLevel
  convertToBlocker(riskId: string): Promise<Blocker>
  convertToWorkItem(riskId: string): Promise<WorkItem>
  closeRisk(id: string, notes: string): Promise<Risk>
}

enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}
```

#### 7. Agreement Management Module

**Responsabilidades**:

- Registro de acuerdos y compromisos
- Asociación con work items
- Seguimiento de cumplimiento
- Historial de notas de progreso

**Interfaces**:

```typescript
interface AgreementService {
  createAgreement(data: CreateAgreementDTO): Promise<Agreement>
  getAgreement(id: string): Promise<Agreement>
  updateAgreement(id: string, data: UpdateAgreementDTO): Promise<Agreement>
  linkWorkItem(agreementId: string, workItemId: string): Promise<void>
  addProgressNote(agreementId: string, note: string): Promise<void>
  completeAgreement(id: string): Promise<Agreement>
  getProjectAgreements(projectId: string): Promise<Agreement[]>
}
```

#### 8. AI Assistant Module

**Responsabilidades**:

- Generación de reportes con IA
- Análisis proactivo de proyectos
- Sugerencias de redacción
- Gestión de caché de análisis
- Aplicación de guardrails

**Interfaces**:

```typescript
interface AIService {
  generateProjectReport(projectId: string, detailLevel: ReportDetailLevel): Promise<string>
  analyzeProject(projectId: string): Promise<AIAnalysis>
  suggestWorkItemDescription(context: string): Promise<string[]>
  improveText(text: string, purpose: TextPurpose): Promise<string>
  getCachedAnalysis(projectId: string): Promise<AIAnalysis | null>
  invalidateCache(projectId: string): Promise<void>
}

interface AIAnalysis {
  projectId: string
  analyzedAt: Date
  suggestions: AISuggestion[]
  detectedRisks: DetectedRisk[]
  overdueItems: OverdueItemSuggestion[]
}

interface AISuggestion {
  type: 'CREATE_BLOCKER' | 'ADJUST_DATES' | 'CREATE_RISK' | 'REASSIGN'
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
  description: string
  affectedEntityId: string
  suggestedAction: any
}

enum ReportDetailLevel {
  EXECUTIVE = 'EXECUTIVE',
  DETAILED = 'DETAILED',
  COMPLETE = 'COMPLETE',
}
```

#### 9. Dashboard & Analytics Module

**Responsabilidades**:

- Generación de dashboards ejecutivos
- Cálculo de métricas agregadas
- Filtrado y visualización de datos
- Actualización en tiempo real

**Interfaces**:

```typescript
interface DashboardService {
  getExecutiveDashboard(orgId: string, filters?: DashboardFilters): Promise<ExecutiveDashboard>
  getProjectHealth(projectId: string): Promise<ProjectHealth>
  getOrganizationMetrics(orgId: string): Promise<OrganizationMetrics>
}

interface ExecutiveDashboard {
  activeProjects: number
  projectsAtRisk: number
  criticalBlockers: number
  highRisks: number
  completionRate: number
  averageBlockerResolutionTime: Duration
  projects: ProjectSummary[]
}

interface ProjectHealth {
  status: 'HEALTHY' | 'AT_RISK' | 'CRITICAL'
  score: number
  factors: HealthFactor[]
}

interface HealthFactor {
  name: string
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL'
  description: string
}
```

#### 10. Export Module

**Responsabilidades**:

- Generación de reportes exportables
- Formateo de texto con estructura
- Integración con IA para narrativa
- Preparación de contenido para copiar/pegar

**Interfaces**:

```typescript
interface ExportService {
  exportProject(projectId: string, options: ExportOptions): Promise<ExportResult>
  generateNotificationMessage(
    type: NotificationType,
    entityId: string
  ): Promise<NotificationMessage>
  formatForEmail(content: string): Promise<string>
}

interface ExportOptions {
  detailLevel: ReportDetailLevel
  includeWorkItems: boolean
  includeBlockers: boolean
  includeRisks: boolean
  includeAgreements: boolean
  useAINarrative: boolean
}

interface ExportResult {
  content: string
  format: 'PLAIN_TEXT' | 'MARKDOWN'
  generatedAt: Date
}

interface NotificationMessage {
  subject: string
  body: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH'
}
```

#### 11. Internationalization (i18n) Module

**Responsabilidades**:

- Gestión de traducciones
- Detección y cambio de idioma
- Persistencia de preferencias
- Formateo de fechas y números por locale

**Interfaces**:

```typescript
interface I18nService {
  getCurrentLocale(): Locale
  setLocale(locale: Locale): Promise<void>
  translate(key: string, params?: Record<string, any>): string
  formatDate(date: Date, format: string): string
  formatNumber(num: number, options?: NumberFormatOptions): string
}

enum Locale {
  ES = 'es',
  PT = 'pt',
}
```

### API Design

#### RESTful API Structure

Base URL: `/api/v1`

**Convenciones**:

- Todos los endpoints requieren autenticación (excepto `/auth/*`)
- Todos los responses incluyen `organization_id` implícito del usuario
- Paginación estándar: `?page=1&limit=20`
- Filtrado: `?filter[field]=value`
- Ordenamiento: `?sort=field:asc`

#### Authentication Endpoints

```
POST   /api/v1/auth/signin              # Iniciar sesión
POST   /api/v1/auth/signout             # Cerrar sesión
POST   /api/v1/auth/refresh             # Refrescar token
GET    /api/v1/auth/me                  # Usuario actual
```

#### Organization Endpoints

```
GET    /api/v1/organizations/:id        # Obtener organización
PATCH  /api/v1/organizations/:id        # Actualizar organización
GET    /api/v1/organizations/:id/users  # Listar usuarios
POST   /api/v1/organizations/:id/users  # Agregar usuario
DELETE /api/v1/organizations/:id/users/:userId  # Remover usuario
```

#### Project Endpoints

```
GET    /api/v1/projects                 # Listar proyectos
POST   /api/v1/projects                 # Crear proyecto
GET    /api/v1/projects/:id             # Obtener proyecto
PATCH  /api/v1/projects/:id             # Actualizar proyecto
DELETE /api/v1/projects/:id             # Archivar proyecto
GET    /api/v1/projects/:id/kanban      # Obtener tablero Kanban
GET    /api/v1/projects/:id/metrics     # Obtener métricas
GET    /api/v1/projects/:id/health      # Obtener salud del proyecto
```

#### Work Item Endpoints

```
GET    /api/v1/projects/:projectId/work-items           # Listar work items
POST   /api/v1/projects/:projectId/work-items           # Crear work item
GET    /api/v1/work-items/:id                           # Obtener work item
PATCH  /api/v1/work-items/:id                           # Actualizar work item
PATCH  /api/v1/work-items/:id/status                    # Cambiar estado
GET    /api/v1/work-items/:id/history                   # Obtener historial
GET    /api/v1/projects/:projectId/work-items/overdue   # Items atrasados
```

#### Blocker Endpoints

```
GET    /api/v1/projects/:projectId/blockers             # Listar blockers
POST   /api/v1/projects/:projectId/blockers             # Crear blocker
GET    /api/v1/blockers/:id                             # Obtener blocker
PATCH  /api/v1/blockers/:id                             # Actualizar blocker
POST   /api/v1/blockers/:id/resolve                     # Resolver blocker
GET    /api/v1/projects/:projectId/blockers/critical    # Blockers críticos
```

#### Risk Endpoints

```
GET    /api/v1/projects/:projectId/risks                # Listar riesgos
POST   /api/v1/projects/:projectId/risks                # Crear riesgo
GET    /api/v1/risks/:id                                # Obtener riesgo
PATCH  /api/v1/risks/:id                                # Actualizar riesgo
POST   /api/v1/risks/:id/convert-to-blocker             # Convertir a blocker
POST   /api/v1/risks/:id/convert-to-work-item          # Convertir a work item
POST   /api/v1/risks/:id/close                          # Cerrar riesgo
```

#### Agreement Endpoints

```
GET    /api/v1/projects/:projectId/agreements           # Listar agreements
POST   /api/v1/projects/:projectId/agreements           # Crear agreement
GET    /api/v1/agreements/:id                           # Obtener agreement
PATCH  /api/v1/agreements/:id                           # Actualizar agreement
POST   /api/v1/agreements/:id/link-work-item            # Vincular work item
POST   /api/v1/agreements/:id/progress-notes            # Agregar nota
POST   /api/v1/agreements/:id/complete                  # Completar agreement
```

#### AI Assistant Endpoints

```
POST   /api/v1/ai/generate-report                       # Generar reporte
POST   /api/v1/ai/analyze-project                       # Analizar proyecto
POST   /api/v1/ai/suggest-description                   # Sugerir descripción
POST   /api/v1/ai/improve-text                          # Mejorar texto
GET    /api/v1/ai/cached-analysis/:projectId            # Obtener análisis cacheado
DELETE /api/v1/ai/cached-analysis/:projectId            # Invalidar caché
```

#### Dashboard Endpoints

```
GET    /api/v1/dashboard/executive                      # Dashboard ejecutivo
GET    /api/v1/dashboard/metrics                        # Métricas de organización
```

#### Export Endpoints

```
POST   /api/v1/export/project/:projectId                # Exportar proyecto
POST   /api/v1/export/notification                      # Generar mensaje de notificación
```

## Modelos de Datos

### Esquema de Base de Datos

```mermaid
erDiagram
    Organization ||--o{ User : has
    Organization ||--o{ Project : owns
    User ||--o{ WorkItem : owns
    User ||--o{ Blocker : reports
    User ||--o{ Risk : manages
    User ||--o{ Agreement : creates
    Project ||--o{ WorkItem : contains
    Project ||--o{ Blocker : has
    Project ||--o{ Risk : has
    Project ||--o{ Agreement : has
    Project ||--o{ KanbanColumn : has
    WorkItem ||--o{ Blocker : causes
    WorkItem ||--o{ WorkItemChange : tracks
    WorkItem }o--o{ Agreement : relates
    Risk ||--o| Blocker : converts_to
    Risk ||--o| WorkItem : converts_to

    Organization {
        uuid id PK
        string name
        jsonb settings
        timestamp created_at
        timestamp updated_at
    }

    User {
        uuid id PK
        uuid organization_id FK
        string email UK
        string password_hash
        string name
        enum roles
        string locale
        boolean active
        timestamp created_at
        timestamp updated_at
    }

    Project {
        uuid id PK
        uuid organization_id FK
        string name
        text description
        string client
        date start_date
        date estimated_end_date
        enum status
        boolean archived
        timestamp created_at
        timestamp updated_at
    }

    KanbanColumn {
        uuid id PK
        uuid project_id FK
        string name
        int order
        enum column_type
    }

    WorkItem {
        uuid id PK
        uuid organization_id FK
        uuid project_id FK
        uuid owner_id FK
        string title
        text description
        enum status
        enum priority
        date start_date
        date estimated_end_date
        date completed_at
        uuid kanban_column_id FK
        timestamp created_at
        timestamp updated_at
    }

    WorkItemChange {
        uuid id PK
        uuid work_item_id FK
        uuid changed_by_id FK
        string field
        jsonb old_value
        jsonb new_value
        timestamp changed_at
    }

    Blocker {
        uuid id PK
        uuid organization_id FK
        uuid project_id FK
        uuid work_item_id FK
        text description
        string blocked_by
        enum severity
        date start_date
        date resolved_at
        text resolution
        timestamp created_at
        timestamp updated_at
    }

    Risk {
        uuid id PK
        uuid organization_id FK
        uuid project_id FK
        uuid owner_id FK
        text description
        int probability
        int impact
        enum risk_level
        text mitigation_plan
        enum status
        date identified_at
        date closed_at
        text closure_notes
        timestamp created_at
        timestamp updated_at
    }

    Agreement {
        uuid id PK
        uuid organization_id FK
        uuid project_id FK
        uuid created_by_id FK
        text description
        date agreement_date
        text participants
        enum status
        date completed_at
        timestamp created_at
        timestamp updated_at
    }

    AgreementWorkItem {
        uuid agreement_id FK
        uuid work_item_id FK
    }

    AgreementNote {
        uuid id PK
        uuid agreement_id FK
        uuid created_by_id FK
        text note
        timestamp created_at
    }

    AIAnalysisCache {
        uuid id PK
        uuid project_id FK UK
        jsonb analysis_data
        timestamp analyzed_at
        timestamp expires_at
    }
```

### Definiciones de Tipos TypeScript

```typescript
// Enums
enum UserRole {
  EXECUTIVE = 'EXECUTIVE',
  ADMIN = 'ADMIN',
  PROJECT_MANAGER = 'PROJECT_MANAGER',
  INTERNAL_CONSULTANT = 'INTERNAL_CONSULTANT',
  EXTERNAL_CONSULTANT = 'EXTERNAL_CONSULTANT',
}

enum ProjectStatus {
  PLANNING = 'PLANNING',
  ACTIVE = 'ACTIVE',
  ON_HOLD = 'ON_HOLD',
  COMPLETED = 'COMPLETED',
  ARCHIVED = 'ARCHIVED',
}

enum WorkItemStatus {
  BACKLOG = 'BACKLOG',
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  DONE = 'DONE',
}

enum WorkItemPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

enum BlockerSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

enum RiskStatus {
  IDENTIFIED = 'IDENTIFIED',
  MONITORING = 'MONITORING',
  MITIGATING = 'MITIGATING',
  MATERIALIZED = 'MATERIALIZED',
  CLOSED = 'CLOSED',
}

enum AgreementStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

enum KanbanColumnType {
  BACKLOG = 'BACKLOG',
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  DONE = 'DONE',
  CUSTOM = 'CUSTOM',
}

// Core Models
interface Organization {
  id: string
  name: string
  settings: OrganizationSettings
  createdAt: Date
  updatedAt: Date
}

interface OrganizationSettings {
  defaultLocale: Locale
  blockerCriticalThresholdHours: number
  aiAnalysisCacheDurationHours: number
}

interface User {
  id: string
  organizationId: string
  email: string
  name: string
  roles: UserRole[]
  locale: Locale
  active: boolean
  createdAt: Date
  updatedAt: Date
}

interface Project {
  id: string
  organizationId: string
  name: string
  description: string
  client: string
  startDate: Date
  estimatedEndDate: Date
  status: ProjectStatus
  archived: boolean
  createdAt: Date
  updatedAt: Date
}

interface WorkItem {
  id: string
  organizationId: string
  projectId: string
  ownerId: string
  title: string
  description: string
  status: WorkItemStatus
  priority: WorkItemPriority
  startDate: Date
  estimatedEndDate: Date
  completedAt: Date | null
  kanbanColumnId: string
  createdAt: Date
  updatedAt: Date
}

interface Blocker {
  id: string
  organizationId: string
  projectId: string
  workItemId: string
  description: string
  blockedBy: string
  severity: BlockerSeverity
  startDate: Date
  resolvedAt: Date | null
  resolution: string | null
  createdAt: Date
  updatedAt: Date
}

interface Risk {
  id: string
  organizationId: string
  projectId: string
  ownerId: string
  description: string
  probability: number // 1-5
  impact: number // 1-5
  riskLevel: RiskLevel
  mitigationPlan: string
  status: RiskStatus
  identifiedAt: Date
  closedAt: Date | null
  closureNotes: string | null
  createdAt: Date
  updatedAt: Date
}

interface Agreement {
  id: string
  organizationId: string
  projectId: string
  createdById: string
  description: string
  agreementDate: Date
  participants: string
  status: AgreementStatus
  completedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
```

### Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model Organization {
  id        String   @id @default(uuid()) @db.Char(36)
  name      String
  settings  Json     @default("{}")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  users       User[]
  projects    Project[]
  workItems   WorkItem[]
  blockers    Blocker[]
  risks       Risk[]
  agreements  Agreement[]

  @@map("organizations")
}

model User {
  id             String   @id @default(uuid()) @db.Char(36)
  organizationId String   @map("organization_id") @db.Char(36)
  email          String   @unique
  passwordHash   String   @map("password_hash")
  name           String
  roles          String[] // Array of UserRole enums
  locale         String   @default("es")
  active         Boolean  @default(true)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  organization      Organization       @relation(fields: [organizationId], references: [id])
  ownedWorkItems    WorkItem[]         @relation("WorkItemOwner")
  ownedRisks        Risk[]             @relation("RiskOwner")
  createdAgreements Agreement[]        @relation("AgreementCreator")
  workItemChanges   WorkItemChange[]

  @@index([organizationId])
  @@map("users")
}

model Project {
  id               String   @id @default(uuid()) @db.Char(36)
  organizationId   String   @map("organization_id") @db.Char(36)
  name             String
  description      String   @db.Text
  client           String
  startDate        DateTime @map("start_date") @db.Date
  estimatedEndDate DateTime @map("estimated_end_date") @db.Date
  status           String   @default("PLANNING")
  archived         Boolean  @default(false)
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  organization   Organization     @relation(fields: [organizationId], references: [id])
  workItems      WorkItem[]
  blockers       Blocker[]
  risks          Risk[]
  agreements     Agreement[]
  kanbanColumns  KanbanColumn[]
  aiAnalysisCache AIAnalysisCache?

  @@index([organizationId])
  @@index([organizationId, archived])
  @@map("projects")
}

model KanbanColumn {
  id          String   @id @default(uuid()) @db.Char(36)
  projectId   String   @map("project_id") @db.Char(36)
  name        String
  order       Int
  columnType  String   @map("column_type")

  project     Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  workItems   WorkItem[]

  @@unique([projectId, order])
  @@index([projectId])
  @@map("kanban_columns")
}

model WorkItem {
  id               String    @id @default(uuid()) @db.Char(36)
  organizationId   String    @map("organization_id") @db.Char(36)
  projectId        String    @map("project_id") @db.Char(36)
  ownerId          String    @map("owner_id") @db.Char(36)
  title            String
  description      String    @db.Text
  status           String
  priority         String
  startDate        DateTime  @map("start_date") @db.Date
  estimatedEndDate DateTime  @map("estimated_end_date") @db.Date
  completedAt      DateTime? @map("completed_at")
  kanbanColumnId   String    @map("kanban_column_id") @db.Char(36)
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  organization Organization       @relation(fields: [organizationId], references: [id])
  project      Project            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  owner        User               @relation("WorkItemOwner", fields: [ownerId], references: [id])
  kanbanColumn KanbanColumn       @relation(fields: [kanbanColumnId], references: [id])
  blockers     Blocker[]
  changes      WorkItemChange[]
  agreements   AgreementWorkItem[]

  @@index([organizationId, projectId])
  @@index([ownerId])
  @@index([status])
  @@map("work_items")
}

model WorkItemChange {
  id         String   @id @default(uuid()) @db.Char(36)
  workItemId String   @map("work_item_id") @db.Char(36)
  changedById String  @map("changed_by_id") @db.Char(36)
  field      String
  oldValue   Json?    @map("old_value")
  newValue   Json?    @map("new_value")
  changedAt  DateTime @default(now()) @map("changed_at")

  workItem  WorkItem @relation(fields: [workItemId], references: [id], onDelete: Cascade)
  changedBy User     @relation(fields: [changedById], references: [id])

  @@index([workItemId])
  @@map("work_item_changes")
}

model Blocker {
  id             String    @id @default(uuid()) @db.Char(36)
  organizationId String    @map("organization_id") @db.Char(36)
  projectId      String    @map("project_id") @db.Char(36)
  workItemId     String    @map("work_item_id") @db.Char(36)
  description    String    @db.Text
  blockedBy      String    @map("blocked_by")
  severity       String
  startDate      DateTime  @map("start_date") @db.Date
  resolvedAt     DateTime? @map("resolved_at")
  resolution     String?   @db.Text
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id])
  project      Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  workItem     WorkItem     @relation(fields: [workItemId], references: [id], onDelete: Cascade)

  @@index([organizationId, projectId])
  @@index([workItemId])
  @@index([resolvedAt])
  @@map("blockers")
}cade)

  @@index([organizationId, projectId])
  @@index([workItemId])
  @@index([resolvedAt])
  @@map("blockers")
}

model Risk {
  id             String    @id @default(uuid()) @db.Char(36)
  organizationId String    @map("organization_id") @db.Char(36)
  projectId      String    @map("project_id") @db.Char(36)
  ownerId        String    @map("owner_id") @db.Char(36)
  description    String    @db.Text
  probability    Int
  impact         Int
  riskLevel      String    @map("risk_level")
  mitigationPlan String    @map("mitigation_plan") @db.Text
  status         String
  identifiedAt   DateTime  @map("identified_at") @db.Date
  closedAt       DateTime? @map("closed_at") @db.Date
  closureNotes   String?   @map("closure_notes") @db.Text
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id])
  project      Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  owner        User         @relation("RiskOwner", fields: [ownerId], references: [id])

  @@index([organizationId, projectId])
  @@index([riskLevel])
  @@index([status])
  @@map("risks")
}

model Agreement {
  id            String    @id @default(uuid()) @db.Char(36)
  organizationId String   @map("organization_id") @db.Char(36)
  projectId     String    @map("project_id") @db.Char(36)
  createdById   String    @map("created_by_id") @db.Char(36)
  description   String    @db.Text
  agreementDate DateTime  @map("agreement_date") @db.Date
  participants  String    @db.Text
  status        String
  completedAt   DateTime? @map("completed_at")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  organization Organization        @relation(fields: [organizationId], references: [id])
  project      Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdBy    User                @relation("AgreementCreator", fields: [createdById], references: [id])
  workItems    AgreementWorkItem[]
  notes        AgreementNote[]

  @@index([organizationId, projectId])
  @@index([status])
  @@map("agreements")
}

model AgreementWorkItem {
  agreementId String @map("agreement_id") @db.Char(36)
  workItemId  String @map("work_item_id") @db.Char(36)

  agreement Agreement @relation(fields: [agreementId], references: [id], onDelete: Cascade)
  workItem  WorkItem  @relation(fields: [workItemId], references: [id], onDelete: Cascade)

  @@id([agreementId, workItemId])
  @@map("agreement_work_items")
}

model AgreementNote {
  id          String   @id @default(uuid()) @db.Char(36)
  agreementId String   @map("agreement_id") @db.Char(36)
  createdById String   @map("created_by_id") @db.Char(36)
  note        String   @db.Text
  createdAt   DateTime @default(now()) @map("created_at")

  agreement Agreement @relation(fields: [agreementId], references: [id], onDelete: Cascade)

  @@index([agreementId])
  @@map("agreement_notes")
}

model AIAnalysisCache {
  id           String   @id @default(uuid()) @db.Char(36)
  projectId    String   @unique @map("project_id") @db.Char(36)
  analysisData Json     @map("analysis_data")
  analyzedAt   DateTime @map("analyzed_at")
  expiresAt    DateTime @map("expires_at")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([expiresAt])
  @@map("ai_analysis_cache")
}
```

### Índices y Optimizaciones de Base de Datos

**Índices Compuestos Críticos**:

```sql
-- Multi-tenancy: Todas las consultas filtran por organization_id
CREATE INDEX idx_work_items_org_project ON work_items(organization_id, project_id);
CREATE INDEX idx_blockers_org_project ON blockers(organization_id, project_id);
CREATE INDEX idx_risks_org_project ON risks(organization_id, project_id);
CREATE INDEX idx_agreements_org_project ON agreements(organization_id, project_id);

-- Consultas frecuentes
CREATE INDEX idx_work_items_status ON work_items(status) WHERE status != 'DONE';
CREATE INDEX idx_blockers_unresolved ON blockers(project_id, severity) WHERE resolved_at IS NULL;
CREATE INDEX idx_risks_active ON risks(project_id, risk_level) WHERE status != 'CLOSED';

-- Performance de dashboards
CREATE INDEX idx_projects_active ON projects(organization_id, status) WHERE archived = false;
```

## Integración con IA (AWS Bedrock)

### Arquitectura de IA

```mermaid
graph LR
    subgraph "Application"
        API[API Route]
        AIService[AI Service]
        Cache[Redis/DB Cache]
    end

    subgraph "AWS Bedrock"
        Guardrails[Bedrock Guardrails]
        Claude[Claude 3 Model]
    end

    API --> AIService
    AIService --> Cache
    Cache -->|Cache Miss| AIService
    AIService --> Guardrails
    Guardrails --> Claude
    Claude --> Guardrails
    Guardrails --> AIService
    AIService --> Cache
```

### Configuración de AWS Bedrock

**Modelo Seleccionado**: Claude 3 Sonnet (balance entre costo y calidad)

**Configuración de Guardrails**:

```typescript
const guardrailsConfig = {
  guardrailIdentifier: process.env.BEDROCK_GUARDRAIL_ID,
  guardrailVersion: 'DRAFT',
  filters: [
    {
      type: 'CONTENT_POLICY',
      inputStrength: 'MEDIUM',
      outputStrength: 'HIGH',
      // Prevenir contenido inapropiado
    },
    {
      type: 'SENSITIVE_INFORMATION',
      inputStrength: 'HIGH',
      outputStrength: 'HIGH',
      // Detectar y bloquear PII
    },
    {
      type: 'CONTEXTUAL_GROUNDING',
      inputStrength: 'HIGH',
      outputStrength: 'HIGH',
      // Asegurar que las respuestas estén basadas en datos del proyecto
    },
  ],
  topicPolicies: [
    {
      name: 'ProjectDataOnly',
      definition: 'Only discuss project management topics and data provided',
      action: 'BLOCK',
    },
  ],
}
```

### Casos de Uso de IA

#### 1. Generación de Reportes

**Prompt Template**:

```typescript
const generateReportPrompt = (project: Project, detailLevel: ReportDetailLevel) => `
Eres un asistente de gestión de proyectos. Genera un reporte ${detailLevel} del siguiente proyecto:

Proyecto: ${project.name}
Cliente: ${project.client}
Fecha inicio: ${project.startDate}
Fecha fin estimada: ${project.estimatedEndDate}

Work Items:
${formatWorkItems(project.workItems)}

Blockers Activos:
${formatBlockers(project.blockers)}

Riesgos:
${formatRisks(project.risks)}

Agreements:
${formatAgreements(project.agreements)}

Genera un reporte profesional en español que incluya:
1. Resumen ejecutivo del estado del proyecto
2. Progreso de work items (completados vs pendientes)
3. Análisis de blockers críticos y su impacto
4. Evaluación de riesgos activos
5. Estado de agreements y compromisos

Formato: Texto con estructura clara, bullets y alineaciones.
`
```

#### 2. Análisis Proactivo

**Prompt Template**:

```typescript
const analyzeProjectPrompt = (project: Project) => `
Analiza el siguiente proyecto y proporciona sugerencias proactivas:

Proyecto: ${project.name}
Work Items: ${formatWorkItems(project.workItems)}
Blockers: ${formatBlockers(project.blockers)}
Riesgos: ${formatRisks(project.risks)}

Identifica:
1. Work items atrasados que deberían convertirse en blockers
2. Patrones que sugieren riesgos potenciales
3. Dependencias que podrían causar problemas
4. Recomendaciones para mejorar el flujo

Responde en formato JSON:
{
  "suggestions": [
    {
      "type": "CREATE_BLOCKER" | "ADJUST_DATES" | "CREATE_RISK" | "REASSIGN",
      "priority": "LOW" | "MEDIUM" | "HIGH",
      "description": "...",
      "affectedEntityId": "...",
      "suggestedAction": {...}
    }
  ],
  "detectedRisks": [...],
  "overdueItems": [...]
}
`
```

#### 3. Mejora de Texto

**Prompt Template**:

```typescript
const improveTextPrompt = (text: string, purpose: TextPurpose) => `
Mejora el siguiente texto para ${purpose}:

"${text}"

Requisitos:
- Mantener el significado original
- Usar lenguaje profesional pero accesible
- Ser conciso y claro
- Formato apropiado para comunicación con clientes

Responde solo con el texto mejorado, sin explicaciones adicionales.
`
```

### Estrategia de Caché

**Reglas de Caché**:

1. Análisis de proyecto: Caché por 24 horas
2. Reportes generados: No cachear (pueden requerir personalización)
3. Sugerencias de texto: Caché por 1 hora por contexto similar

**Implementación**:

```typescript
class AIService {
  async analyzeProject(projectId: string): Promise<AIAnalysis> {
    // Verificar caché
    const cached = await this.getCachedAnalysis(projectId)
    if (cached && !this.isCacheExpired(cached)) {
      return cached.analysisData
    }

    // Ejecutar análisis
    const analysis = await this.executeBedrockAnalysis(projectId)

    // Guardar en caché
    await this.cacheAnalysis(projectId, analysis, 24 * 60 * 60 * 1000) // 24h

    return analysis
  }

  private isCacheExpired(cache: AIAnalysisCache): boolean {
    return new Date() > cache.expiresAt
  }
}
```

### Manejo de Errores de IA

```typescript
class AIService {
  async executeBedrockRequest<T>(prompt: string, options: BedrockOptions): Promise<T> {
    try {
      const response = await this.bedrockClient.invokeModel({
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: options.maxTokens || 4096,
          messages: [{ role: 'user', content: prompt }],
          temperature: options.temperature || 0.7,
        }),
        guardrailIdentifier: this.guardrailsConfig.guardrailIdentifier,
        guardrailVersion: this.guardrailsConfig.guardrailVersion,
      })

      return this.parseResponse<T>(response)
    } catch (error) {
      if (error.name === 'GuardrailsException') {
        throw new AIGuardrailsError('Content blocked by guardrails')
      }
      if (error.name === 'ThrottlingException') {
        // Retry con backoff exponencial
        return this.retryWithBackoff(() => this.executeBedrockRequest(prompt, options))
      }
      throw new AIServiceError('Failed to execute AI request', error)
    }
  }
}
```

### Límites y Cuotas

- **Rate Limiting**: 10 requests/minuto por usuario
- **Token Limits**: 4096 tokens por request
- **Timeout**: 30 segundos por request
- **Retry Policy**: 3 intentos con backoff exponencial (1s, 2s, 4s)

## Seguridad y RBAC

### Modelo de Permisos

```typescript
// Definición de permisos
enum Permission {
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

// Mapeo de roles a permisos
const rolePermissions: Record<UserRole, Permission[]> = {
  [UserRole.EXECUTIVE]: [
    Permission.ORG_VIEW,
    Permission.USER_VIEW,
    Permission.PROJECT_VIEW,
    Permission.WORK_ITEM_VIEW,
    Permission.BLOCKER_VIEW,
    Permission.RISK_VIEW,
    Permission.AGREEMENT_VIEW,
    Permission.DASHBOARD_EXECUTIVE,
    Permission.EXPORT_PROJECT,
  ],

  [UserRole.ADMIN]: [
    Permission.ORG_MANAGE,
    Permission.USER_CREATE,
    Permission.USER_UPDATE,
    Permission.USER_DELETE,
    Permission.USER_VIEW,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_DELETE,
    Permission.PROJECT_VIEW,
    Permission.PROJECT_ARCHIVE,
    Permission.WORK_ITEM_CREATE,
    Permission.WORK_ITEM_UPDATE,
    Permission.WORK_ITEM_DELETE,
    Permission.WORK_ITEM_VIEW,
    Permission.BLOCKER_CREATE,
    Permission.BLOCKER_UPDATE,
    Permission.BLOCKER_RESOLVE,
    Permission.BLOCKER_VIEW,
    Permission.RISK_CREATE,
    Permission.RISK_UPDATE,
    Permission.RISK_DELETE,
    Permission.RISK_VIEW,
    Permission.AGREEMENT_CREATE,
    Permission.AGREEMENT_UPDATE,
    Permission.AGREEMENT_DELETE,
    Permission.AGREEMENT_VIEW,
    Permission.AI_USE,
    Permission.DASHBOARD_EXECUTIVE,
    Permission.DASHBOARD_PROJECT,
    Permission.EXPORT_PROJECT,
  ],

  [UserRole.PROJECT_MANAGER]: [
    Permission.USER_VIEW,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_VIEW,
    Permission.PROJECT_ARCHIVE,
    Permission.WORK_ITEM_CREATE,
    Permission.WORK_ITEM_UPDATE,
    Permission.WORK_ITEM_VIEW,
    Permission.BLOCKER_CREATE,
    Permission.BLOCKER_UPDATE,
    Permission.BLOCKER_RESOLVE,
    Permission.BLOCKER_VIEW,
    Permission.RISK_CREATE,
    Permission.RISK_UPDATE,
    Permission.RISK_VIEW,
    Permission.AGREEMENT_CREATE,
    Permission.AGREEMENT_UPDATE,
    Permission.AGREEMENT_VIEW,
    Permission.AI_USE,
    Permission.DASHBOARD_PROJECT,
    Permission.EXPORT_PROJECT,
  ],

  [UserRole.INTERNAL_CONSULTANT]: [
    Permission.PROJECT_VIEW,
    Permission.WORK_ITEM_UPDATE_OWN,
    Permission.WORK_ITEM_VIEW,
    Permission.BLOCKER_CREATE,
    Permission.BLOCKER_VIEW,
    Permission.RISK_VIEW,
    Permission.AGREEMENT_VIEW,
    Permission.AI_USE,
    Permission.DASHBOARD_PROJECT,
  ],

  [UserRole.EXTERNAL_CONSULTANT]: [
    Permission.PROJECT_VIEW,
    Permission.WORK_ITEM_VIEW,
    Permission.BLOCKER_VIEW,
    Permission.RISK_VIEW,
    Permission.AGREEMENT_VIEW,
    Permission.DASHBOARD_PROJECT,
  ],
}
```

### Middleware de Autorización

```typescript
// Middleware para Next.js API Routes
export function withAuth(
  handler: NextApiHandler,
  requiredPermissions: Permission[]
): NextApiHandler {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // 1. Verificar token JWT
      const token = req.headers.authorization?.replace('Bearer ', '')
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      // 2. Validar y decodificar token
      const session = await verifyToken(token)
      if (!session) {
        return res.status(401).json({ error: 'Invalid token' })
      }

      // 3. Obtener usuario con roles
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        include: { organization: true },
      })

      if (!user || !user.active) {
        return res.status(401).json({ error: 'User not found or inactive' })
      }

      // 4. Verificar permisos
      const hasPermission = requiredPermissions.every((permission) =>
        hasUserPermission(user, permission)
      )

      if (!hasPermission) {
        return res.status(403).json({ error: 'Forbidden' })
      }

      // 5. Agregar contexto al request
      req.user = user
      req.organizationId = user.organizationId

      return handler(req, res)
    } catch (error) {
      console.error('Auth middleware error:', error)
      return res.status(500).json({ error: 'Internal server error' })
    }
  }
}

function hasUserPermission(user: User, permission: Permission): boolean {
  return user.roles.some((role) => rolePermissions[role as UserRole]?.includes(permission))
}
```

### Autenticación con NextAuth.js

```typescript
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcrypt'

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { organization: true },
        })

        if (!user || !user.active) {
          return null
        }

        const isValid = await compare(credentials.password, user.passwordHash)
        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: user.organizationId,
          roles: user.roles,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id
        token.organizationId = user.organizationId
        token.roles = user.roles
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.userId
      session.user.organizationId = token.organizationId
      session.user.roles = token.roles
      return session
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 horas
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
```

### Seguridad de Datos

**Encriptación**:

- TLS 1.3 para datos en tránsito
- Encriptación at-rest en RDS (AES-256)
- Secrets Manager para credenciales sensibles

**Validación de Entrada**:

```typescript
// Uso de Zod para validación
import { z } from 'zod'

const createWorkItemSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000),
    ownerId: z.string().uuid(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    startDate: z.string().datetime(),
    estimatedEndDate: z.string().datetime(),
  })
  .refine((data) => new Date(data.estimatedEndDate) > new Date(data.startDate), {
    message: 'End date must be after start date',
  })

// En API route
export async function POST(req: Request) {
  const body = await req.json()
  const validated = createWorkItemSchema.parse(body) // Throws si inválido
  // ... procesar
}
```

**Auditoría**:

- Todos los cambios en work items se registran en `work_item_changes`
- Logs de acceso a nivel de aplicación
- CloudWatch Logs para monitoreo de seguridad

## Internacionalización (i18n)

### Configuración con next-intl

```typescript
// i18n/config.ts
export const locales = ['es', 'pt'] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'es'

export const localeNames: Record<Locale, string> = {
  es: 'Español',
  pt: 'Português',
}
```

### Estructura de Traducciones

```
messages/
├── es/
│   ├── common.json
│   ├── projects.json
│   ├── work-items.json
│   ├── blockers.json
│   ├── risks.json
│   ├── agreements.json
│   ├── dashboard.json
│   └── errors.json
└── pt/
    ├── common.json
    ├── projects.json
    └── ...
```

**Ejemplo de archivo de traducción**:

```json
// messages/es/projects.json
{
  "title": "Proyectos",
  "create": "Crear Proyecto",
  "edit": "Editar Proyecto",
  "archive": "Archivar Proyecto",
  "status": {
    "planning": "Planificación",
    "active": "Activo",
    "on_hold": "En Espera",
    "completed": "Completado",
    "archived": "Archivado"
  },
  "fields": {
    "name": "Nombre",
    "description": "Descripción",
    "client": "Cliente",
    "startDate": "Fecha de Inicio",
    "estimatedEndDate": "Fecha de Fin Estimada"
  },
  "validation": {
    "nameRequired": "El nombre es requerido",
    "endDateAfterStart": "La fecha de fin debe ser posterior a la fecha de inicio"
  }
}
```

### Uso en Componentes

```typescript
// app/[locale]/projects/page.tsx
import { useTranslations } from 'next-intl'

export default function ProjectsPage() {
  const t = useTranslations('projects')

  return (
    <div>
      <h1>{t('title')}</h1>
      <button>{t('create')}</button>
    </div>
  )
}
```

### Formateo de Fechas y Números

```typescript
import { useFormatter } from 'next-intl'

function ProjectCard({ project }) {
  const format = useFormatter()

  return (
    <div>
      <p>{format.dateTime(project.startDate, { dateStyle: 'medium' })}</p>
      <p>{format.number(project.completionRate, { style: 'percent' })}</p>
    </div>
  )
}
```

## Deployment en AWS

### Arquitectura de Infraestructura

```mermaid
graph TB
    subgraph "Route 53"
        DNS[DNS]
    end

    subgraph "CloudFront"
        CDN[CDN Distribution]
    end

    subgraph "VPC"
        subgraph "Public Subnets"
            ALB[Application Load Balancer]
            NAT[NAT Gateway]
        end

        subgraph "Private Subnets - AZ1"
            EC2_1[EC2 Instance]
            RDS_1[(RDS MySQL<br/>Existente)]
        end

        subgraph "Private Subnets - AZ2"
            EC2_2[EC2 Instance]
        end
    end

    subgraph "AWS Services"
        S3[S3 Bucket]
        Bedrock[AWS Bedrock]
        Secrets[Secrets Manager]
        CloudWatch[CloudWatch]
    end

    DNS --> CDN
    CDN --> ALB
    ALB --> EC2_1
    ALB --> EC2_2
    EC2_1 --> RDS_1
    EC2_2 --> RDS_1
    EC2_1 --> S3
    EC2_2 --> S3
    EC2_1 --> Bedrock
    EC2_2 --> Bedrock
    EC2_1 --> Secrets
    EC2_2 --> Secrets
    EC2_1 --> CloudWatch
    EC2_2 --> CloudWatch
```

### Recursos de AWS

#### Compute (EC2)

**Configuración**:

- Tipo de instancia: t3.medium (2 vCPU, 4 GB RAM) para inicio
- Auto Scaling Group: Min 2, Max 4 instancias
- AMI: Amazon Linux 2023 con Node.js 20
- User Data script para deployment automático

**Auto Scaling Policies**:

- Scale up: CPU > 70% por 5 minutos
- Scale down: CPU < 30% por 10 minutos

#### Database (RDS MySQL)

**Configuración**:

- Engine: MySQL Community 8.4.8
- Instancia: db.t4g.micro (2 vCPU, 1 GB RAM)
- Storage: 20 GB GP3, 3000 IOPS
- Deployment: Single-AZ (us-east-1b)
- Backup: Automático diario, retención 7 días
- Encryption: Habilitado (AES-256)
- Instancia existente: Costo $0 adicional

**Connection Pooling**:

```typescript
// Configuración de Prisma para connection pooling
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// En producción con connection pooling
DATABASE_URL="mysql://user:pass@rds-endpoint:3306/saas_pm_app?connection_limit=20&pool_timeout=30"
```

#### Storage (S3)

**Buckets**:

- `app-exports-{env}`: Reportes exportados (lifecycle: 30 días)
- `app-assets-{env}`: Assets estáticos
- `app-backups-{env}`: Backups de base de datos

**Configuración**:

- Versioning: Habilitado
- Encryption: SSE-S3
- Lifecycle policies: Transición a Glacier después de 90 días

#### Load Balancer (ALB)

**Configuración**:

- Scheme: Internet-facing
- Target Groups: EC2 instances en puerto 3000
- Health Check: `/api/health` cada 30 segundos
- SSL/TLS: Certificate Manager (ACM)
- Sticky Sessions: Habilitado (cookie-based)

#### CDN (CloudFront)

**Configuración**:

- Origin: ALB
- Cache Behavior:
  - Static assets (`/_next/static/*`): Cache 1 año
  - API routes (`/api/*`): No cache
  - Pages: Cache 5 minutos con revalidación
- Compression: Habilitado (gzip, brotli)
- SSL: TLS 1.2 mínimo

#### Secrets Manager

**Secrets almacenados**:

- `prod/db/credentials`: Credenciales de RDS
- `prod/jwt/secret`: Secret para JWT
- `prod/bedrock/api-key`: Credenciales de Bedrock
- `prod/nextauth/secret`: Secret de NextAuth

#### CloudWatch

**Métricas monitoreadas**:

- EC2: CPU, Memory, Disk, Network
- RDS: Connections, CPU, Storage, Replication Lag
- ALB: Request Count, Target Response Time, HTTP Errors
- Custom: API Response Times, AI Request Count, Cache Hit Rate

**Alarmas**:

- CPU > 80% por 10 minutos
- RDS connections > 80% del máximo
- HTTP 5xx errors > 10 en 5 minutos
- AI request failures > 5 en 5 minutos

### Estrategia de Deployment

#### CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build application
        run: npm run build

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Create deployment package
        run: |
          zip -r deploy.zip .next node_modules package.json prisma

      - name: Upload to S3
        run: |
          aws s3 cp deploy.zip s3://deployments-bucket/deploy-${{ github.sha }}.zip

      - name: Deploy to EC2 via CodeDeploy
        run: |
          aws deploy create-deployment \
            --application-name saas-pm-app \
            --deployment-group-name production \
            --s3-location bucket=deployments-bucket,key=deploy-${{ github.sha }}.zip,bundleType=zip
```

#### Blue-Green Deployment

1. Crear nuevo Target Group con nuevas instancias
2. Desplegar nueva versión en nuevas instancias
3. Ejecutar health checks
4. Cambiar tráfico del ALB al nuevo Target Group
5. Mantener instancias antiguas por 1 hora para rollback
6. Terminar instancias antiguas

#### Database Migrations

```typescript
// Script de migración seguro
import { PrismaClient } from '@prisma/client'

async function migrate() {
  const prisma = new PrismaClient()

  try {
    console.log('Starting migration...')

    // Ejecutar migraciones de Prisma
    await prisma.$executeRaw`SELECT 1` // Health check

    // Las migraciones se ejecutan automáticamente en deployment
    // via: npx prisma migrate deploy

    console.log('Migration completed successfully')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

migrate()
```

### Monitoreo y Observabilidad

**Logs**:

- Application logs → CloudWatch Logs
- Access logs → S3
- Error tracking → CloudWatch Insights

**Dashboards**:

- Dashboard ejecutivo de infraestructura
- Métricas de aplicación en tiempo real
- Costos por servicio

**Alertas**:

- PagerDuty para incidentes críticos
- Email para warnings
- Slack para notificaciones informativas

## Correctness Properties

_Una propiedad es una característica o comportamiento que debe ser verdadero en todas las ejecuciones válidas de un sistema - esencialmente, una declaración formal sobre lo que el sistema debe hacer. Las propiedades sirven como puente entre las especificaciones legibles por humanos y las garantías de correctitud verificables por máquinas._

### Reflexión sobre Propiedades

Después de analizar todos los criterios de aceptación, he identificado las siguientes áreas donde las propiedades pueden consolidarse para evitar redundancia:

**Consolidaciones realizadas**:

1. Múltiples criterios sobre aislamiento multi-tenant (1.1-1.4) se consolidan en propiedades de aislamiento de datos
2. Criterios sobre permisos por rol (2.2-2.5) se consolidan en una propiedad general de RBAC
3. Criterios sobre campos requeridos en diferentes entidades se consolidan en propiedades de validación por tipo
4. Criterios sobre auditoría y tracking se consolidan en una propiedad general de trazabilidad
5. Criterios sobre caché de IA (9.1, 9.4) se consolidan en una propiedad de gestión de caché

### Property 1: Aislamiento de Datos Multi-Tenant

_Para cualquier_ usuario autenticado y cualquier consulta de datos, el sistema debe retornar únicamente registros que pertenezcan a la organización del usuario (organization_id coincidente).

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Asignación Automática de Organization ID

_Para cualquier_ registro creado por un usuario autenticado, el sistema debe asignar automáticamente el organization_id del usuario al nuevo registro.

**Validates: Requirements 1.4**

### Property 3: Control de Acceso Basado en Roles (RBAC)

_Para cualquier_ usuario con un conjunto de roles y cualquier acción que requiera permisos específicos, el sistema debe permitir la acción si y solo si al menos uno de los roles del usuario tiene los permisos necesarios.

**Validates: Requirements 2.1, 2.2**

### Property 4: Revocación de Acceso al Desactivar Usuario

_Para cualquier_ usuario desactivado, cualquier intento de autenticación debe ser rechazado inmediatamente.

**Validates: Requirements 2.6**

### Property 5: Creación Automática de Tablero Kanban

_Para cualquier_ proyecto creado, el sistema debe crear automáticamente un tablero Kanban con exactamente 5 columnas en el orden: Backlog, To Do, In Progress, Blockers, Done.

**Validates: Requirements 3.2**

### Property 6: Sincronización de Work Items con Columnas Kanban

_Para cualquier_ work item, su ubicación en el tablero Kanban (kanban_column_id) debe corresponder a una columna cuyo tipo coincida con el estado actual del work item.

**Validates: Requirements 3.3, 4.3**

### Property 7: Persistencia de Proyectos Archivados

_Para cualquier_ proyecto archivado, todos sus datos relacionados (work items, blockers, risks, agreements) deben permanecer en la base de datos, pero el proyecto no debe aparecer en consultas de proyectos activos.

**Validates: Requirements 3.5**

### Property 8: Validación de Campos Requeridos en Entidades

_Para cualquier_ intento de crear una entidad (Project, WorkItem, Blocker, Risk, Agreement), el sistema debe rechazar la creación si falta algún campo marcado como requerido en el esquema.

**Validates: Requirements 3.1, 4.1, 5.1, 6.1, 7.1**

### Property 9: Auditoría de Cambios en Work Items

_Para cualquier_ actualización de un work item, el sistema debe crear un registro en work_item_changes que incluya: el campo modificado, valor anterior, valor nuevo, usuario que realizó el cambio, y timestamp.

**Validates: Requirements 4.2, 4.6**

### Property 10: Detección de Work Items Atrasados

_Para cualquier_ work item con estado diferente de DONE, si la fecha actual es posterior a estimated_end_date, el sistema debe marcarlo como atrasado.

**Validates: Requirements 4.5**

### Property 11: Cálculo de Duración de Blockers

_Para cualquier_ blocker activo (resolved_at es null), el sistema debe calcular la duración como la diferencia entre la fecha actual y start_date.

**Validates: Requirements 5.2**

### Property 12: Movimiento de Work Item al Resolver Blocker

_Para cualquier_ blocker que se resuelve, si el work item asociado está en la columna "Blockers", el sistema debe moverlo a la columna correspondiente a su estado actual (diferente de BLOCKED).

**Validates: Requirements 5.3**

### Property 13: Escalación Automática de Severidad de Blockers

_Para cualquier_ blocker activo, si la duración supera el umbral configurado en organization settings (blockerCriticalThresholdHours), el sistema debe actualizar su severidad a CRITICAL.

**Validates: Requirements 5.5**

### Property 14: Cálculo de Nivel de Riesgo

_Para cualquier_ riesgo, el nivel de riesgo (risk_level) debe calcularse como el producto de probability × impact, mapeado a: LOW (1-5), MEDIUM (6-12), HIGH (13-20), CRITICAL (21-25).

**Validates: Requirements 6.2**

### Property 15: Conversión de Riesgo a Blocker o Work Item

_Para cualquier_ riesgo que se convierte a blocker o work item, el sistema debe crear la nueva entidad con datos derivados del riesgo (descripción, responsable, proyecto) y mantener el riesgo original con referencia a la entidad creada.

**Validates: Requirements 6.3**

### Property 16: Ordenamiento de Riesgos por Nivel

_Para cualquier_ consulta de riesgos activos de un proyecto, los resultados deben estar ordenados por risk_level en orden descendente (CRITICAL, HIGH, MEDIUM, LOW).

**Validates: Requirements 6.4**

### Property 17: Asociación de Agreements con Work Items

_Para cualquier_ agreement asociado con work items, la relación debe ser bidireccional: desde el agreement se pueden obtener sus work items, y desde cada work item se pueden obtener sus agreements.

**Validates: Requirements 7.2, 7.3**

### Property 18: Contenido Completo en Reportes de IA

_Para cualquier_ reporte generado por IA, el contenido debe incluir secciones para: progreso de work items, blockers activos, riesgos, y agreements pendientes (aunque alguna sección pueda estar vacía si no hay datos).

**Validates: Requirements 8.3**

### Property 19: Rate Limiting de Análisis de IA

_Para cualquier_ proyecto, si se solicita un análisis de IA y existe un análisis cacheado con menos de 24 horas de antigüedad, el sistema debe retornar el análisis cacheado sin ejecutar una nueva llamada a Bedrock.

**Validates: Requirements 9.1, 9.4**

### Property 20: Sugerencias Proactivas para Work Items Atrasados

_Para cualquier_ análisis de IA de un proyecto, si existen work items atrasados (fecha fin pasada y estado != DONE), el análisis debe incluir al menos una sugerencia de tipo CREATE_BLOCKER o ADJUST_DATES para cada work item atrasado.

**Validates: Requirements 9.2**

### Property 21: Cálculo de Métricas Agregadas en Dashboard

_Para cualquier_ dashboard ejecutivo, las métricas agregadas (% completado, tiempo promedio de resolución, proyectos en riesgo) deben calcularse correctamente basándose en todos los proyectos activos de la organización.

**Validates: Requirements 10.2**

### Property 22: Filtrado de Dashboard

_Para cualquier_ dashboard con filtros aplicados (fecha, cliente, PM), solo deben mostrarse proyectos que cumplan todos los criterios de filtro especificados.

**Validates: Requirements 10.5**

### Property 23: Contenido Completo en Exportaciones

_Para cualquier_ exportación de proyecto, el documento generado debe incluir todas las secciones especificadas: resumen ejecutivo, work items por estatus, blockers activos, riesgos, y agreements.

**Validates: Requirements 11.2**

### Property 24: Niveles de Detalle en Exportación

_Para cualquier_ exportación, el nivel de detalle seleccionado (EXECUTIVE, DETAILED, COMPLETE) debe afectar la cantidad de información incluida, donde COMPLETE ⊇ DETAILED ⊇ EXECUTIVE.

**Validates: Requirements 11.5**

### Property 25: Generación de Mensajes de Notificación

_Para cualquier_ proyecto con blockers de severidad CRITICAL o riesgos de nivel HIGH/CRITICAL, el sistema debe poder generar un mensaje de notificación que incluya: asunto, cuerpo, y datos relevantes de los elementos críticos.

**Validates: Requirements 12.1, 12.3**

### Property 26: Persistencia de Preferencia de Idioma

_Para cualquier_ usuario que cambia su preferencia de idioma, la nueva preferencia debe guardarse en la base de datos y aplicarse automáticamente en futuras sesiones.

**Validates: Requirements 13.4**

### Property 27: Mensajes de Error Comprensibles

_Para cualquier_ error de validación o error de negocio, el sistema debe retornar un mensaje de error en el idioma del usuario que describa el problema sin exponer detalles técnicos de implementación.

**Validates: Requirements 14.3**

### Property 28: Autenticación con JWT

_Para cualquier_ usuario que se autentica exitosamente, el sistema debe generar un token JWT válido que incluya: user_id, organization_id, roles, y tiempo de expiración.

**Validates: Requirements 15.1**

### Property 29: Hashing Seguro de Contraseñas

_Para cualquier_ contraseña almacenada en la base de datos, debe estar hasheada usando bcrypt con un salt factor mínimo de 10, nunca en texto plano.

**Validates: Requirements 15.3**

### Property 30: Validación de Token en Cada Request

_Para cualquier_ request a un endpoint protegido sin un token JWT válido, el sistema debe rechazar la request con código de estado 401 (Unauthorized).

**Validates: Requirements 15.4**

### Property 31: Auditoría de Intentos de Acceso No Autorizado

_Para cualquier_ intento de acceso no autorizado (autenticación fallida o acceso sin permisos), el sistema debe crear un registro en los logs que incluya: timestamp, usuario intentado, acción intentada, y razón del rechazo.

**Validates: Requirements 15.5**

### Property 32: Procesamiento Asíncrono de IA

_Para cualquier_ llamada a AWS Bedrock, la ejecución debe ser asíncrona (retornar una Promise) para no bloquear el event loop de Node.js.

**Validates: Requirements 16.5**

### Property 33: Registro de Errores del Sistema

_Para cualquier_ error no manejado o error crítico, el sistema debe registrar el error en CloudWatch Logs con información de contexto: timestamp, stack trace, usuario afectado, y request que causó el error.

**Validates: Requirements 17.2**

## Error Handling

### Estrategia de Manejo de Errores

El sistema implementa una estrategia de manejo de errores en capas con los siguientes principios:

1. **Fail Fast**: Validar entradas lo antes posible
2. **Error Boundaries**: Contener errores en su contexto
3. **Logging Comprehensivo**: Registrar todos los errores con contexto
4. **Mensajes User-Friendly**: Nunca exponer detalles técnicos al usuario
5. **Graceful Degradation**: El sistema debe continuar funcionando parcialmente ante fallos

### Jerarquía de Errores

```typescript
// Base error class
class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public isOperational: boolean = true
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

// Errores de validación
class ValidationError extends AppError {
  constructor(
    message: string,
    public fields?: Record<string, string>
  ) {
    super(message, 'VALIDATION_ERROR', 400)
  }
}

// Errores de autenticación
class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401)
  }
}

// Errores de autorización
class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403)
  }
}

// Errores de recursos no encontrados
class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, 'NOT_FOUND', 404)
  }
}

// Errores de conflicto (ej: duplicados)
class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409)
  }
}

// Errores de servicios externos (IA, AWS)
class ExternalServiceError extends AppError {
  constructor(service: string, originalError: Error) {
    super(`External service ${service} failed`, 'EXTERNAL_SERVICE_ERROR', 503, false)
    this.stack = originalError.stack
  }
}

// Errores de IA específicos
class AIGuardrailsError extends AppError {
  constructor(message: string = 'Content blocked by AI guardrails') {
    super(message, 'AI_GUARDRAILS_ERROR', 400)
  }
}

class AIServiceError extends ExternalServiceError {
  constructor(message: string, originalError: Error) {
    super('AWS Bedrock', originalError)
    this.message = message
  }
}
```

### Middleware de Manejo de Errores

```typescript
// Global error handler para API routes
export function errorHandler(error: Error, req: NextApiRequest, res: NextApiResponse) {
  // Log del error
  logger.error('API Error', {
    error: error.message,
    stack: error.stack,
    path: req.url,
    method: req.method,
    userId: req.user?.id,
    organizationId: req.organizationId,
  })

  // Si es un error operacional conocido
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: translateError(error.message, req.user?.locale),
        ...(error instanceof ValidationError && { fields: error.fields }),
      },
    })
  }

  // Error no manejado - no exponer detalles
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: translateError('An unexpected error occurred', req.user?.locale),
    },
  })
}

// Wrapper para async handlers
export function asyncHandler(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await handler(req, res)
    } catch (error) {
      errorHandler(error as Error, req, res)
    }
  }
}
```

### Manejo de Errores en Servicios

```typescript
class WorkItemService {
  async createWorkItem(data: CreateWorkItemDTO): Promise<WorkItem> {
    // Validación con Zod
    try {
      createWorkItemSchema.parse(data)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Invalid work item data', error.flatten().fieldErrors)
      }
      throw error
    }

    // Verificar que el proyecto existe
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
    })
    if (!project) {
      throw new NotFoundError('Project', data.projectId)
    }

    // Verificar que el owner existe y pertenece a la organización
    const owner = await prisma.user.findFirst({
      where: {
        id: data.ownerId,
        organizationId: project.organizationId,
      },
    })
    if (!owner) {
      throw new ValidationError('Owner must belong to the same organization')
    }

    // Crear work item
    try {
      const workItem = await prisma.workItem.create({
        data: {
          ...data,
          organizationId: project.organizationId,
        },
      })
      return workItem
    } catch (error) {
      if (error.code === 'P2002') {
        // Unique constraint violation
        throw new ConflictError('Work item with this title already exists')
      }
      throw error
    }
  }
}
```

### Manejo de Errores de IA

```typescript
class AIService {
  async executeBedrockRequest<T>(prompt: string, options: BedrockOptions): Promise<T> {
    try {
      const response = await this.bedrockClient.invokeModel({
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: options.maxTokens || 4096,
          messages: [{ role: 'user', content: prompt }],
        }),
        guardrailIdentifier: this.guardrailsConfig.guardrailIdentifier,
        guardrailVersion: this.guardrailsConfig.guardrailVersion,
      })

      return this.parseResponse<T>(response)
    } catch (error) {
      // Guardrails bloquearon el contenido
      if (error.name === 'GuardrailsException') {
        throw new AIGuardrailsError('The content was blocked by AI safety guardrails')
      }

      // Rate limiting
      if (error.name === 'ThrottlingException') {
        logger.warn('Bedrock throttling, retrying...', { error })
        await this.sleep(1000)
        return this.retryWithBackoff(() => this.executeBedrockRequest(prompt, options))
      }

      // Timeout
      if (error.name === 'TimeoutError') {
        throw new AIServiceError('AI request timed out', error)
      }

      // Otros errores de Bedrock
      throw new AIServiceError('Failed to execute AI request', error)
    }
  }

  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn()
      } catch (error) {
        if (i === maxRetries - 1) throw error
        const delay = baseDelay * Math.pow(2, i)
        await this.sleep(delay)
      }
    }
    throw new Error('Max retries exceeded')
  }
}
```

### Error Boundaries en Frontend

```typescript
// app/error.tsx - Error boundary para App Router
'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')

  useEffect(() => {
    // Log error to monitoring service
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h2 className="text-2xl font-bold mb-4">{t('somethingWentWrong')}</h2>
      <p className="text-gray-600 mb-4">{t('errorMessage')}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        {t('tryAgain')}
      </button>
    </div>
  )
}
```

### Logging y Monitoreo

```typescript
// logger.ts
import winston from 'winston'
import CloudWatchTransport from 'winston-cloudwatch'

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'saas-pm-app',
    environment: process.env.NODE_ENV,
  },
  transports: [
    // Console en desarrollo
    ...(process.env.NODE_ENV === 'development'
      ? [
          new winston.transports.Console({
            format: winston.format.simple(),
          }),
        ]
      : []),

    // CloudWatch en producción
    ...(process.env.NODE_ENV === 'production'
      ? [
          new CloudWatchTransport({
            logGroupName: '/aws/ec2/saas-pm-app',
            logStreamName: `${process.env.INSTANCE_ID}-${new Date().toISOString().split('T')[0]}`,
            awsRegion: process.env.AWS_REGION,
          }),
        ]
      : []),
  ],
})

export default logger
```

### Respuestas de Error Estandarizadas

Todas las respuestas de error siguen este formato:

```typescript
interface ErrorResponse {
  error: {
    code: string // Código de error máquina-legible
    message: string // Mensaje traducido user-friendly
    fields?: Record<string, string> // Errores de validación por campo
    requestId?: string // ID para tracking
  }
}
```

**Ejemplos**:

```json
// Error de validación
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los datos proporcionados son inválidos",
    "fields": {
      "title": "El título es requerido",
      "estimatedEndDate": "La fecha de fin debe ser posterior a la fecha de inicio"
    }
  }
}

// Error de autorización
{
  "error": {
    "code": "AUTHORIZATION_ERROR",
    "message": "No tienes permisos para realizar esta acción"
  }
}

// Error de servicio externo
{
  "error": {
    "code": "EXTERNAL_SERVICE_ERROR",
    "message": "El servicio de IA no está disponible temporalmente. Por favor intenta más tarde."
  }
}
```

## Testing Strategy

### Enfoque Dual de Testing

El sistema implementa una estrategia de testing comprehensiva que combina:

1. **Unit Tests**: Verifican ejemplos específicos, casos edge, y condiciones de error
2. **Property-Based Tests**: Verifican propiedades universales a través de múltiples inputs generados

Ambos tipos de tests son complementarios y necesarios:

- **Unit tests** capturan bugs concretos y validan comportamientos específicos
- **Property tests** verifican correctitud general y descubren casos edge inesperados

### Stack de Testing

| Tipo                   | Herramienta             | Propósito                                          |
| ---------------------- | ----------------------- | -------------------------------------------------- |
| Unit Testing           | Vitest                  | Tests rápidos de funciones y componentes           |
| Property-Based Testing | fast-check              | Generación de inputs y verificación de propiedades |
| Integration Testing    | Vitest + Testcontainers | Tests con base de datos real                       |
| E2E Testing            | Playwright              | Tests de flujos completos de usuario               |
| API Testing            | Supertest               | Tests de endpoints REST                            |
| Component Testing      | React Testing Library   | Tests de componentes UI                            |

### Configuración de Property-Based Testing

**Biblioteca**: fast-check (JavaScript/TypeScript)

**Configuración estándar**:

```typescript
import fc from 'fast-check'

// Configuración global para property tests
const propertyTestConfig = {
  numRuns: 100, // Mínimo 100 iteraciones por test
  verbose: true, // Mostrar casos que fallan
  seed: Date.now(), // Seed para reproducibilidad
  endOnFailure: false, // Ejecutar todas las iteraciones
}
```

**Generadores Personalizados**:

```typescript
// Generador de Organization
const arbOrganization = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  settings: fc.record({
    defaultLocale: fc.constantFrom('es', 'pt'),
    blockerCriticalThresholdHours: fc.integer({ min: 1, max: 168 }),
    aiAnalysisCacheDurationHours: fc.integer({ min: 1, max: 72 }),
  }),
})

// Generador de User
const arbUser = (organizationId: string) =>
  fc.record({
    id: fc.uuid(),
    organizationId: fc.constant(organizationId),
    email: fc.emailAddress(),
    name: fc.string({ minLength: 1, maxLength: 100 }),
    roles: fc.array(
      fc.constantFrom(
        'EXECUTIVE',
        'ADMIN',
        'PROJECT_MANAGER',
        'INTERNAL_CONSULTANT',
        'EXTERNAL_CONSULTANT'
      ),
      { minLength: 1, maxLength: 3 }
    ),
    locale: fc.constantFrom('es', 'pt'),
    active: fc.boolean(),
  })

// Generador de Project
const arbProject = (organizationId: string) =>
  fc
    .record({
      id: fc.uuid(),
      organizationId: fc.constant(organizationId),
      name: fc.string({ minLength: 1, maxLength: 200 }),
      description: fc.string({ maxLength: 5000 }),
      client: fc.string({ minLength: 1, maxLength: 200 }),
      startDate: fc.date(),
      estimatedEndDate: fc.date(),
      status: fc.constantFrom('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'),
      archived: fc.boolean(),
    })
    .filter((p) => p.estimatedEndDate > p.startDate)

// Generador de WorkItem
const arbWorkItem = (organizationId: string, projectId: string) =>
  fc
    .record({
      id: fc.uuid(),
      organizationId: fc.constant(organizationId),
      projectId: fc.constant(projectId),
      ownerId: fc.uuid(),
      title: fc.string({ minLength: 1, maxLength: 200 }),
      description: fc.string({ maxLength: 5000 }),
      status: fc.constantFrom('BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'),
      priority: fc.constantFrom('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
      startDate: fc.date(),
      estimatedEndDate: fc.date(),
    })
    .filter((wi) => wi.estimatedEndDate > wi.startDate)
```

### Property Tests por Propiedad de Diseño

#### Property 1: Aislamiento de Datos Multi-Tenant

```typescript
describe('Property 1: Multi-Tenant Data Isolation', () => {
  it('should only return records belonging to user organization', async () => {
    // Feature: saas-gestion-proyectos-ejecutiva, Property 1: Para cualquier usuario autenticado y cualquier consulta de datos, el sistema debe retornar únicamente registros que pertenezcan a la organización del usuario

    await fc.assert(
      fc.asyncProperty(
        fc.array(arbOrganization, { minLength: 2, maxLength: 5 }),
        fc.array(arbProject, { minLength: 5, maxLength: 20 }),
        async (organizations, projects) => {
          // Setup: Crear organizaciones y proyectos
          await setupTestData(organizations, projects)

          // Para cada organización
          for (const org of organizations) {
            const user = await createTestUser(org.id)
            const results = await projectService.getProjects(user)

            // Verificar que todos los proyectos pertenecen a la organización del usuario
            expect(results.every((p) => p.organizationId === org.id)).toBe(true)

            // Verificar que no hay proyectos de otras organizaciones
            const otherOrgProjects = projects.filter((p) => p.organizationId !== org.id)
            expect(results.some((p) => otherOrgProjects.some((op) => op.id === p.id))).toBe(false)
          }
        }
      ),
      propertyTestConfig
    )
  })
})
```

#### Property 8: Validación de Campos Requeridos

```typescript
describe('Property 8: Required Fields Validation', () => {
  it('should reject creation of entities with missing required fields', async () => {
    // Feature: saas-gestion-proyectos-ejecutiva, Property 8: Para cualquier intento de crear una entidad, el sistema debe rechazar la creación si falta algún campo requerido

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.option(fc.string(), { nil: undefined }),
          description: fc.option(fc.string(), { nil: undefined }),
          client: fc.option(fc.string(), { nil: undefined }),
          startDate: fc.option(fc.date(), { nil: undefined }),
          estimatedEndDate: fc.option(fc.date(), { nil: undefined }),
        }),
        async (partialProject) => {
          const requiredFields = ['name', 'description', 'client', 'startDate', 'estimatedEndDate']
          const missingFields = requiredFields.filter((f) => !partialProject[f])

          if (missingFields.length > 0) {
            // Debe lanzar ValidationError
            await expect(projectService.createProject(partialProject as any)).rejects.toThrow(
              ValidationError
            )
          }
        }
      ),
      propertyTestConfig
    )
  })
})
```

#### Property 14: Cálculo de Nivel de Riesgo

```typescript
describe('Property 14: Risk Level Calculation', () => {
  it('should correctly calculate risk level from probability and impact', async () => {
    // Feature: saas-gestion-proyectos-ejecutiva, Property 14: Para cualquier riesgo, el nivel de riesgo debe calcularse como el producto de probability × impact

    await fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }), // probability
        fc.integer({ min: 1, max: 5 }), // impact
        (probability, impact) => {
          const score = probability * impact
          const expectedLevel =
            score <= 5 ? 'LOW' : score <= 12 ? 'MEDIUM' : score <= 20 ? 'HIGH' : 'CRITICAL'

          const calculatedLevel = riskService.calculateRiskLevel(probability, impact)

          expect(calculatedLevel).toBe(expectedLevel)
        }
      ),
      propertyTestConfig
    )
  })
})
```

#### Property 19: Rate Limiting de Análisis de IA

```typescript
describe('Property 19: AI Analysis Rate Limiting', () => {
  it('should return cached analysis if less than 24 hours old', async () => {
    // Feature: saas-gestion-proyectos-ejecutiva, Property 19: Para cualquier proyecto, si existe un análisis cacheado con menos de 24 horas, debe retornar el análisis cacheado

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // projectId
        fc.integer({ min: 0, max: 48 }), // hours since last analysis
        async (projectId, hoursSinceAnalysis) => {
          // Setup: Crear análisis cacheado
          const analyzedAt = new Date(Date.now() - hoursSinceAnalysis * 60 * 60 * 1000)
          await createCachedAnalysis(projectId, analyzedAt)

          // Mock de Bedrock para contar llamadas
          const bedrockCallCount = { count: 0 }
          jest.spyOn(aiService, 'executeBedrockRequest').mockImplementation(async () => {
            bedrockCallCount.count++
            return mockAnalysis
          })

          // Ejecutar análisis
          await aiService.analyzeProject(projectId)

          // Verificar
          if (hoursSinceAnalysis < 24) {
            // Debe usar caché, no llamar a Bedrock
            expect(bedrockCallCount.count).toBe(0)
          } else {
            // Debe llamar a Bedrock
            expect(bedrockCallCount.count).toBe(1)
          }
        }
      ),
      propertyTestConfig
    )
  })
})
```

### Unit Tests Complementarios

Los unit tests se enfocan en:

1. **Ejemplos específicos de comportamiento esperado**

```typescript
describe('ProjectService', () => {
  it('should create a project with default Kanban board', async () => {
    const project = await projectService.createProject({
      name: 'Test Project',
      description: 'Test',
      client: 'Test Client',
      startDate: new Date('2024-01-01'),
      estimatedEndDate: new Date('2024-12-31'),
    })

    const kanbanBoard = await projectService.getKanbanBoard(project.id)

    expect(kanbanBoard.columns).toHaveLength(5)
    expect(kanbanBoard.columns.map((c) => c.name)).toEqual([
      'Backlog',
      'To Do',
      'In Progress',
      'Blockers',
      'Done',
    ])
  })
})
```

2. **Casos edge específicos**

```typescript
describe('WorkItemService', () => {
  it('should handle work item with same start and end date', async () => {
    const date = new Date('2024-01-01')

    await expect(
      workItemService.createWorkItem({
        title: 'Test',
        startDate: date,
        estimatedEndDate: date,
        // ... otros campos
      })
    ).rejects.toThrow('End date must be after start date')
  })

  it('should mark work item as overdue when end date is in the past', async () => {
    const workItem = await createWorkItem({
      estimatedEndDate: new Date('2020-01-01'),
      status: 'IN_PROGRESS',
    })

    const isOverdue = workItemService.isOverdue(workItem)
    expect(isOverdue).toBe(true)
  })
})
```

3. **Condiciones de error**

```typescript
describe('AuthService', () => {
  it('should reject authentication with invalid credentials', async () => {
    await expect(authService.signIn('user@example.com', 'wrongpassword')).rejects.toThrow(
      AuthenticationError
    )
  })

  it('should reject authentication for inactive user', async () => {
    const user = await createUser({ active: false })

    await expect(authService.signIn(user.email, 'correctpassword')).rejects.toThrow(
      AuthenticationError
    )
  })
})
```

### Integration Tests

```typescript
describe('Project Management Integration', () => {
  let testDb: TestDatabase

  beforeAll(async () => {
    testDb = await TestDatabase.create()
  })

  afterAll(async () => {
    await testDb.teardown()
  })

  it('should handle complete project lifecycle', async () => {
    // Crear organización y usuario
    const org = await testDb.createOrganization()
    const pm = await testDb.createUser(org.id, ['PROJECT_MANAGER'])

    // Crear proyecto
    const project = await projectService.createProject({
      name: 'Integration Test Project',
      // ... otros campos
    })

    // Verificar tablero Kanban creado
    const board = await projectService.getKanbanBoard(project.id)
    expect(board.columns).toHaveLength(5)

    // Crear work item
    const workItem = await workItemService.createWorkItem({
      projectId: project.id,
      title: 'Test Task',
      // ... otros campos
    })

    // Verificar que aparece en el tablero
    const updatedBoard = await projectService.getKanbanBoard(project.id)
    expect(updatedBoard.workItems).toContainEqual(expect.objectContaining({ id: workItem.id }))

    // Crear blocker
    const blocker = await blockerService.createBlocker({
      workItemId: workItem.id,
      description: 'Test blocker',
      // ... otros campos
    })

    // Verificar que work item se movió a columna Blockers
    const boardWithBlocker = await projectService.getKanbanBoard(project.id)
    const blockerColumn = boardWithBlocker.columns.find((c) => c.name === 'Blockers')
    expect(blockerColumn?.workItemIds).toContain(workItem.id)
  })
})
```

### E2E Tests

```typescript
import { test, expect } from '@playwright/test'

test.describe('Project Management Flow', () => {
  test('PM can create project and manage work items', async ({ page }) => {
    // Login como PM
    await page.goto('/auth/signin')
    await page.fill('[name="email"]', 'pm@example.com')
    await page.fill('[name="password"]', 'password')
    await page.click('button[type="submit"]')

    // Crear proyecto
    await page.click('text=Crear Proyecto')
    await page.fill('[name="name"]', 'E2E Test Project')
    await page.fill('[name="client"]', 'Test Client')
    await page.click('button:has-text("Guardar")')

    // Verificar que aparece en la lista
    await expect(page.locator('text=E2E Test Project')).toBeVisible()

    // Abrir proyecto
    await page.click('text=E2E Test Project')

    // Verificar tablero Kanban
    await expect(page.locator('text=Backlog')).toBeVisible()
    await expect(page.locator('text=To Do')).toBeVisible()
    await expect(page.locator('text=In Progress')).toBeVisible()

    // Crear work item
    await page.click('text=Nuevo Work Item')
    await page.fill('[name="title"]', 'Test Task')
    await page.click('button:has-text("Crear")')

    // Verificar que aparece en el tablero
    await expect(page.locator('text=Test Task')).toBeVisible()
  })
})
```

### Coverage Goals

- **Unit Tests**: 80% code coverage mínimo
- **Property Tests**: 100% de propiedades de diseño implementadas
- **Integration Tests**: Flujos críticos de negocio cubiertos
- **E2E Tests**: Happy paths de cada rol de usuario

### CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      mysql:
        image: mysql:8.4
        env:
          MYSQL_ROOT_PASSWORD: test
          MYSQL_DATABASE: test
        options: >-
          --health-cmd "mysqladmin ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 3306:3306

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run property tests
        run: npm run test:property

      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: mysql://root:test@localhost:3306/test

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

### Test Organization

```
tests/
├── unit/
│   ├── services/
│   │   ├── project.service.test.ts
│   │   ├── work-item.service.test.ts
│   │   ├── blocker.service.test.ts
│   │   └── ai.service.test.ts
│   ├── utils/
│   └── validators/
├── property/
│   ├── multi-tenant.property.test.ts
│   ├── rbac.property.test.ts
│   ├── validation.property.test.ts
│   ├── risk-calculation.property.test.ts
│   └── ai-caching.property.test.ts
├── integration/
│   ├── project-lifecycle.test.ts
│   ├── work-item-flow.test.ts
│   └── dashboard.test.ts
├── e2e/
│   ├── pm-workflow.spec.ts
│   ├── consultant-workflow.spec.ts
│   └── executive-dashboard.spec.ts
└── helpers/
    ├── generators.ts
    ├── test-database.ts
    └── fixtures.ts
```

---

## Resumen del Diseño

Este diseño técnico proporciona una arquitectura completa para una plataforma SaaS de gestión de proyectos ejecutiva con las siguientes características clave:

- **Multi-tenancy seguro** con aislamiento lógico de datos
- **Integración nativa con IA** (AWS Bedrock) con guardrails de seguridad
- **RBAC granular** con 5 roles diferentes
- **Arquitectura escalable** en AWS con auto-scaling
- **33 propiedades de correctitud** verificables mediante property-based testing
- **Manejo robusto de errores** con logging comprehensivo
- **Internacionalización** lista para Español y Portugués
- **API RESTful** bien documentada
- **Estrategia de testing dual** (unit + property tests)

El sistema está diseñado para ser simple de usar, rápido, seguro, y preparado para escalar conforme crece el negocio.

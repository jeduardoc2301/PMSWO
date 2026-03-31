# Design Document: Activity Templates Management

## Overview

The Activity Templates Management feature enables users to create, manage, and apply reusable activity templates to projects. This feature addresses the common scenario where consulting projects (such as AWS MAP Assessments) share 90% identical activities across different clients, significantly reducing project setup time.

### Key Capabilities

- Template creation and management with phases and activities
- Organization-level template storage with multi-tenant isolation
- Role-based access control (ADMIN and PROJECT_MANAGER roles)
- Template application to projects with activity selection and date assignment
- Batch work item creation from templates
- Template categorization and usage tracking
- Multi-language support (Spanish and Portuguese)

### Design Goals

1. **Reusability**: Enable efficient reuse of standard activity structures across projects
2. **Flexibility**: Allow customization during template application (activity selection, date assignment)
3. **Data Integrity**: Ensure multi-tenant isolation and proper validation
4. **User Experience**: Provide intuitive interfaces for both management and application
5. **Integration**: Seamlessly integrate with existing work items, projects, and RBAC systems

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                          │
├─────────────────────────────────────────────────────────────┤
│  Template Management Page    │  Template Application Dialog │
│  - Template List             │  - Template Selection        │
│  - Template Create/Edit      │  - Activity Selection        │
│  - Template Preview          │  - Date Assignment           │
│  - Category Management       │  - Preview & Confirm         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Layer                              │
├─────────────────────────────────────────────────────────────┤
│  /api/v1/templates                                          │
│  /api/v1/templates/:id                                      │
│  /api/v1/template-categories                                │
│  /api/v1/projects/:id/apply-template                        │
│  /api/v1/templates/:id/preview                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                            │
├─────────────────────────────────────────────────────────────┤
│  TemplateService         │  WorkItemService                 │
│  - CRUD operations       │  - Batch creation                │
│  - Validation            │  - Date calculation              │
│  - Usage tracking        │  - Transaction management        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Layer (Prisma)                       │
├─────────────────────────────────────────────────────────────┤
│  Template  │  TemplatePhase  │  TemplateActivity            │
│  TemplateCategory  │  TemplateUsage  │  WorkItem            │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Template Creation Flow
```
User Input → Validation → Template Service → Database
                ↓
         Category Assignment
                ↓
         Phase & Activity Creation
```

#### Template Application Flow
```
Template Selection → Activity Selection → Date Assignment → Preview
                                                              ↓
                                                    Batch Work Item Creation
                                                              ↓
                                                    Usage Tracking Update
```

## Components and Interfaces

### Frontend Components

#### 1. Template Management Page (`/[locale]/templates`)

**Purpose**: Main interface for template CRUD operations

**Component Hierarchy**:
```
TemplatesPage
├── TemplateList
│   ├── TemplateCard
│   ├── TemplateFilters (category, search)
│   └── TemplateSortOptions
├── CreateTemplateDialog
│   ├── TemplateBasicInfo
│   ├── PhaseManager
│   │   └── ActivityManager
│   └── CategorySelector
├── EditTemplateDialog (same structure as Create)
├── DeleteTemplateDialog
└── TemplatePreviewDialog
```

**Key Features**:
- List view with filtering by category and search
- Sorting by name, modification date, usage count
- Create/Edit dialogs with phase and activity management
- Delete confirmation with cascade warning
- Preview modal showing full template structure

#### 2. Template Application Dialog (within Project Detail)

**Purpose**: Interface for applying templates to projects

**Component Hierarchy**:
```
ApplyTemplateDialog
├── TemplateSelectionStep
│   ├── TemplateList (filtered)
│   └── TemplatePreview
├── ActivitySelectionStep
│   ├── PhaseAccordion
│   │   └── ActivityCheckboxList
│   └── SelectionSummary
├── DateAssignmentStep
│   ├── StartDatePicker
│   └── CalculatedDatesPreview
└── FinalPreviewStep
    ├── SelectedActivitiesTable
    └── ConfirmationActions
```

**Key Features**:
- Multi-step wizard interface
- Template search and filtering
- Selective activity inclusion
- Automatic date calculation based on estimated durations
- Final preview before batch creation

### API Endpoints

#### Template Management Endpoints

**GET /api/v1/templates**
- Purpose: List all templates for organization
- Query params: `category`, `search`, `sortBy`, `sortOrder`
- Auth: Requires authentication
- Returns: Array of template summaries with usage stats

**POST /api/v1/templates**
- Purpose: Create new template
- Auth: Requires ADMIN or PROJECT_MANAGER role
- Body: Template data with phases and activities
- Returns: Created template with ID

**GET /api/v1/templates/:id**
- Purpose: Get template details
- Auth: Requires authentication
- Returns: Full template with phases and activities

**PATCH /api/v1/templates/:id**
- Purpose: Update template
- Auth: Requires ADMIN or PROJECT_MANAGER role
- Body: Partial template data
- Returns: Updated template

**DELETE /api/v1/templates/:id**
- Purpose: Delete template
- Auth: Requires ADMIN or PROJECT_MANAGER role
- Returns: Success confirmation

**GET /api/v1/templates/:id/preview**
- Purpose: Get template preview with calculated metrics
- Auth: Requires authentication
- Returns: Template with total duration, activity count

#### Category Management Endpoints

**GET /api/v1/template-categories**
- Purpose: List all categories for organization
- Auth: Requires authentication
- Returns: Array of categories

**POST /api/v1/template-categories**
- Purpose: Create new category
- Auth: Requires ADMIN or PROJECT_MANAGER role
- Body: `{ name: string }`
- Returns: Created category

#### Template Application Endpoints

**POST /api/v1/projects/:id/apply-template**
- Purpose: Apply template to project (batch create work items)
- Auth: Requires WORK_ITEM_CREATE permission
- Body: `{ templateId, selectedActivityIds, startDate }`
- Returns: Array of created work items
- Side effects: Increments template usage count

## Data Models

### Prisma Schema Extensions

```prisma
model Template {
  id             String   @id @default(uuid()) @db.Char(36)
  organizationId String   @map("organization_id") @db.Char(36)
  name           String   @db.VarChar(255)
  description    String   @db.Text
  categoryId     String?  @map("category_id") @db.Char(36)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  organization Organization       @relation(fields: [organizationId], references: [id])
  category     TemplateCategory?  @relation(fields: [categoryId], references: [id])
  phases       TemplatePhase[]
  usageRecords TemplateUsage[]

  @@index([organizationId])
  @@index([categoryId])
  @@index([organizationId, categoryId])
  @@map("templates")
}

model TemplateCategory {
  id             String   @id @default(uuid()) @db.Char(36)
  organizationId String   @map("organization_id") @db.Char(36)
  name           String   @db.VarChar(100)
  createdAt      DateTime @default(now()) @map("created_at")

  organization Organization @relation(fields: [organizationId], references: [id])
  templates    Template[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("template_categories")
}

model TemplatePhase {
  id         String   @id @default(uuid()) @db.Char(36)
  templateId String   @map("template_id") @db.Char(36)
  name       String   @db.VarChar(255)
  order      Int
  createdAt  DateTime @default(now()) @map("created_at")

  template   Template           @relation(fields: [templateId], references: [id], onDelete: Cascade)
  activities TemplateActivity[]

  @@unique([templateId, order])
  @@index([templateId])
  @@map("template_phases")
}

model TemplateActivity {
  id                String   @id @default(uuid()) @db.Char(36)
  phaseId           String   @map("phase_id") @db.Char(36)
  title             String   @db.VarChar(255)
  description       String   @db.Text
  priority          String   // LOW, MEDIUM, HIGH, CRITICAL
  estimatedDuration Int      @map("estimated_duration") // in hours
  order             Int
  createdAt         DateTime @default(now()) @map("created_at")

  phase TemplatePhase @relation(fields: [phaseId], references: [id], onDelete: Cascade)

  @@unique([phaseId, order])
  @@index([phaseId])
  @@map("template_activities")
}

model TemplateUsage {
  id         String   @id @default(uuid()) @db.Char(36)
  templateId String   @map("template_id") @db.Char(36)
  projectId  String   @map("project_id") @db.Char(36)
  userId     String   @map("user_id") @db.Char(36)
  appliedAt  DateTime @default(now()) @map("applied_at")

  template Template @relation(fields: [templateId], references: [id], onDelete: Cascade)
  project  Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id])

  @@index([templateId])
  @@index([projectId])
  @@index([userId])
  @@map("template_usage")
}
```

### TypeScript Types

```typescript
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
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Before defining the correctness properties, I need to analyze the acceptance criteria for testability.


### Property Reflection

After analyzing all acceptance criteria, I've identified the following redundancies and consolidations:

**Redundant Properties:**
- 2.4, 16.4 (both test cross-org edit prevention) → Consolidate into one property
- 2.5, 16.5 (both test cross-org delete prevention) → Consolidate into one property
- 6.1, 16.2 (both test multi-tenant listing isolation) → Consolidate into one property
- 3.7, 18.4 (both test priority validation) → Consolidate into one property
- 13.1, 13.4 (duplicate - both about creating categories) → Keep only one

**Properties that can be combined:**
- 1.2, 1.6, 1.9 (all test 255 character limits) → Combine into one property about field length validation
- 1.3, 1.4, 1.7, 1.10, 1.12, 1.13, 1.14, 1.15 (all test structural requirements) → Combine into one property about data structure completeness
- 2.3, 2.4, 2.5 (all test multi-tenant isolation for CRUD) → Combine into one comprehensive property
- 12.3, 12.4, 12.5, 12.6 (all test work item field assignment) → Combine into one property about correct work item creation
- 16.1, 16.3, 16.4, 16.5, 16.6 (all test multi-tenant isolation) → Combine into comprehensive multi-tenant property

**Properties that subsume others:**
- 11.3 subsumes 11.4 (sequential date calculation is part of overall date calculation)
- 12.1 subsumes 12.2 (creating work items with correct fields is part of creating work items)
- 18.1 and 18.2 can be combined (both test order uniqueness)

After reflection, the unique testable properties are:

1. Template field validation (name, phase name, activity title length limits)
2. Template structure validation (phases, activities, required fields)
3. Multi-tenant isolation (all CRUD operations respect organization boundaries)
4. Access control (only authorized roles can manage templates)
5. Template creation with valid data succeeds
6. Invalid data is rejected with validation errors
7. Template updates modify data and timestamps correctly
8. Template deletion removes template and cascades correctly
9. Template listing respects filters and search
10. Template sorting works correctly
11. Template preview calculates metrics correctly
12. Activity selection validation (must select at least one)
13. Date calculation for sequential activities
14. Batch work item creation with correct field mapping
15. Transaction atomicity (all-or-nothing work item creation)
16. Usage tracking increments on successful application
17. Category name validation
18. Category deletion prevention when in use
19. Phase and activity order uniqueness
20. Estimated duration positive validation
21. Template data language preservation

### Correctness Properties

### Property 1: Field Length Validation

*For any* template, phase, or activity, when a name or title field exceeds 255 characters, the system should reject the submission with a validation error.

**Validates: Requirements 1.2, 1.6, 1.9, 3.3**

### Property 2: Template Structure Completeness

*For any* successfully created template, the template should include all required fields: unique ID, organization ID, name, description, category field (nullable), at least one phase, creation timestamp, and modification timestamp. Each phase should include name, order, and at least one activity. Each activity should include title, description, priority, estimated duration, and order.

**Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.7, 1.8, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15**

### Property 3: Multi-Tenant Isolation

*For any* user and any template operation (create, read, update, delete, list, apply), the system should only allow access to templates and projects that belong to the user's organization. Attempts to access resources from other organizations should result in a not found error.

**Validates: Requirements 2.3, 2.4, 2.5, 6.1, 8.4, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6**

### Property 4: Role-Based Access Control

*For any* user without ADMIN or PROJECT_MANAGER role, attempts to access template management operations (create, update, delete) should be denied with an authorization error.

**Validates: Requirements 2.2**

### Property 5: Valid Template Creation

*For any* authorized user and valid template data (with name, description, at least one phase with at least one activity), the system should successfully create the template in the user's organization.

**Validates: Requirements 3.1**

### Property 6: Invalid Data Rejection

*For any* template submission with invalid data (missing required fields, invalid priority values, negative durations), the system should reject the submission with specific validation errors and not save the template.

**Validates: Requirements 3.7, 18.3, 18.4, 18.6**

### Property 7: Template Update Correctness

*For any* authorized user and valid template modifications, the system should update the template data and automatically update the modification timestamp.

**Validates: Requirements 4.2, 4.4**

### Property 8: Template Deletion Cascade

*For any* template deletion, the system should permanently remove the template and all associated phases and activities, and the template should no longer appear in any template lists.

**Validates: Requirements 5.2, 5.4**

### Property 9: Template Filtering

*For any* category filter or search term, the system should return only templates that match the filter criteria (category ID matches or name contains search text).

**Validates: Requirements 6.3, 6.4**

### Property 10: Template Sorting

*For any* sort parameter (name, updated_at, usage_count, last_used_at), the system should return templates ordered according to the specified sort field and direction.

**Validates: Requirements 6.5, 6.6**

### Property 11: Template Preview Metrics

*For any* template, the preview should correctly calculate the total number of activities (sum across all phases) and total estimated duration (sum of all activity durations).

**Validates: Requirements 7.6, 7.7**

### Property 12: Phase and Activity Ordering

*For any* template preview, phases should be displayed in ascending order by their order field, and activities within each phase should be displayed in ascending order by their order field.

**Validates: Requirements 7.3, 7.4**

### Property 13: Activity Display Completeness

*For any* template preview, each activity should display its title, description, priority, and estimated duration.

**Validates: Requirements 7.5**

### Property 14: Activity Selection Count

*For any* set of selected activities, the system should correctly calculate and display the count of selected activities and the sum of their estimated durations.

**Validates: Requirements 10.6, 10.7, 17.5, 17.6**

### Property 15: Sequential Date Calculation

*For any* start date and set of selected activities with estimated durations, the system should calculate end dates by adding duration hours to start dates, and calculate subsequent activity start dates as the previous activity's end date, sequentially within each phase.

**Validates: Requirements 11.3, 11.4**

### Property 16: Work Item Creation Mapping

*For any* template application with selected activities, the system should create work items with fields correctly mapped from template activities: title, description, priority from activity; start date and estimated end date from calculations; project ID from target project; organization ID from user's organization; owner ID from applying user; status set to BACKLOG.

**Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6**

### Property 17: Batch Creation Atomicity

*For any* template application, if work item creation fails for any activity, the system should roll back all work item creations, ensuring either all work items are created or none are created.

**Validates: Requirements 12.8**

### Property 18: Usage Tracking

*For any* successful template application, the system should increment the template's usage count and record the application timestamp.

**Validates: Requirements 19.1, 19.2**

### Property 19: Order Uniqueness

*For any* template, all phase order values should be unique within the template, and all activity order values should be unique within each phase.

**Validates: Requirements 18.1, 18.2**

### Property 20: Category Deletion Prevention

*For any* category that is assigned to one or more templates, attempts to delete the category should be rejected with an error indicating the category is in use.

**Validates: Requirements 13.6**

### Property 21: Template Data Language Preservation

*For any* template data (names, descriptions, activity details) entered in a specific language, the data should be stored and displayed exactly as entered, regardless of the viewing user's language preference.

**Validates: Requirements 15.4, 15.5**

## Error Handling

### Validation Errors

The system implements comprehensive validation at multiple layers:

**Frontend Validation**:
- Real-time field validation with immediate user feedback
- Form-level validation before submission
- Clear, field-specific error messages

**API Validation**:
- Request body schema validation
- Business rule validation (e.g., phase must have activities)
- Data type and format validation

**Database Validation**:
- Constraint enforcement (unique, foreign key, not null)
- Transaction rollback on constraint violations

### Error Response Format

```typescript
interface ErrorResponse {
  error: string // Error code (e.g., 'VALIDATION_ERROR', 'NOT_FOUND')
  message: string // Human-readable error message
  fields?: Record<string, string> // Field-specific errors for validation
}
```

### Error Categories

**Validation Errors (400)**:
- Missing required fields
- Invalid field values (length, format, enum)
- Business rule violations (empty phases, duplicate orders)

**Authentication Errors (401)**:
- Missing or invalid authentication token
- Expired session

**Authorization Errors (403)**:
- Insufficient permissions for operation
- Role-based access denial

**Not Found Errors (404)**:
- Template not found
- Template belongs to different organization (multi-tenant isolation)
- Category not found

**Conflict Errors (409)**:
- Attempting to delete category in use
- Duplicate template name (if enforced)

**Server Errors (500)**:
- Database connection failures
- Unexpected exceptions
- Transaction rollback failures

### Error Handling Strategies

**Transactional Operations**:
- Use database transactions for batch operations
- Implement rollback on any failure
- Log detailed error information for debugging

**User Feedback**:
- Display field-level errors for validation failures
- Show generic messages for server errors (don't expose internals)
- Provide actionable guidance (e.g., "Template name must be 255 characters or less")
- Auto-dismiss success messages after 5 seconds
- Require user action to dismiss error messages

**Logging**:
- Log all errors with context (user ID, organization ID, operation)
- Include stack traces for server errors
- Track error rates for monitoring

## Testing Strategy

### Dual Testing Approach

The testing strategy employs both unit tests and property-based tests to ensure comprehensive coverage:

**Unit Tests**: Focus on specific examples, edge cases, and integration points
**Property Tests**: Verify universal properties across all inputs through randomization

### Property-Based Testing Configuration

**Library**: Use `fast-check` for TypeScript/JavaScript property-based testing

**Configuration**:
- Minimum 100 iterations per property test
- Each test tagged with reference to design property
- Tag format: `Feature: activity-templates, Property {number}: {property_text}`

**Example Property Test Structure**:
```typescript
import fc from 'fast-check'

describe('Feature: activity-templates, Property 3: Multi-Tenant Isolation', () => {
  it('should only allow access to templates from user organization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          userId: fc.uuid(),
          userOrgId: fc.uuid(),
          templateOrgId: fc.uuid(),
        }),
        async ({ userId, userOrgId, templateOrgId }) => {
          // Assume: user belongs to userOrgId, template belongs to templateOrgId
          const canAccess = await checkTemplateAccess(userId, templateId)
          
          // Property: access granted only if organizations match
          expect(canAccess).toBe(userOrgId === templateOrgId)
        }
      ),
      { numRuns: 100 }
    )
  })
})
```

### Unit Testing Focus Areas

**Specific Examples**:
- Template creation with valid data
- Template application with selected activities
- Category assignment during creation

**Edge Cases**:
- Template name exactly 255 characters
- Category name exactly 100 characters
- Empty activity selection (should be rejected)
- Single activity template
- Template with many phases (performance)

**Integration Points**:
- Work item service integration for batch creation
- RBAC integration for permission checks
- i18n integration for multi-language support
- Navigation integration for menu items

**Error Conditions**:
- Missing required fields
- Invalid priority values
- Negative estimated durations
- Cross-organization access attempts
- Category deletion with templates

### Test Coverage Goals

- **Unit Test Coverage**: Minimum 80% code coverage
- **Property Test Coverage**: All 21 correctness properties implemented
- **Integration Test Coverage**: All API endpoints tested
- **E2E Test Coverage**: Critical user flows (create template, apply template)

### Testing Pyramid

```
        E2E Tests (5%)
       /            \
      /  Integration  \
     /   Tests (15%)   \
    /                   \
   /   Unit Tests (50%)  \
  /                       \
 / Property Tests (30%)    \
---------------------------
```

## Performance Considerations

### Database Optimization

**Indexes**:
- `templates(organization_id)` - Fast organization filtering
- `templates(organization_id, category_id)` - Fast category filtering
- `template_phases(template_id)` - Fast phase lookup
- `template_activities(phase_id)` - Fast activity lookup
- `template_usage(template_id)` - Fast usage count aggregation

**Query Optimization**:
- Use `include` for eager loading phases and activities
- Implement pagination for template lists (default 20 per page)
- Cache template preview calculations
- Use database aggregation for usage counts

### Batch Operations

**Work Item Creation**:
- Use Prisma `createMany` for batch inserts
- Wrap in transaction for atomicity
- Limit batch size to 100 work items per transaction
- Implement progress feedback for large batches

### Caching Strategy

**Template List Cache**:
- Cache organization template lists for 5 minutes
- Invalidate on template CRUD operations
- Use Redis for distributed caching (future enhancement)

**Template Preview Cache**:
- Cache calculated metrics (total duration, activity count)
- Invalidate on template updates
- Store in database as computed columns (future enhancement)

### Frontend Performance

**Component Optimization**:
- Use React.memo for template cards
- Implement virtual scrolling for large template lists
- Debounce search input (300ms)
- Lazy load template preview dialog

**Data Fetching**:
- Implement SWR for client-side caching
- Prefetch template data on hover
- Use optimistic updates for better UX

## Security Considerations

### Multi-Tenant Isolation

- All queries filtered by organization ID
- Middleware validates organization membership
- Database-level row security (future enhancement)

### Input Validation

- Sanitize all user input to prevent XSS
- Validate field lengths to prevent DoS
- Escape special characters in search queries

### Authorization

- Role-based access control for all operations
- Permission checks at API layer
- Frontend hides unauthorized actions (defense in depth)

### Audit Logging

- Log all template CRUD operations
- Track template application events
- Include user ID, organization ID, timestamp
- Store in separate audit table (future enhancement)

## Migration Strategy

### Database Migration

```sql
-- Create template_categories table
CREATE TABLE template_categories (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  UNIQUE KEY unique_org_category (organization_id, name),
  INDEX idx_org (organization_id)
);

-- Create templates table
CREATE TABLE templates (
  id CHAR(36) PRIMARY KEY,
  organization_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category_id CHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (category_id) REFERENCES template_categories(id),
  INDEX idx_org (organization_id),
  INDEX idx_category (category_id),
  INDEX idx_org_category (organization_id, category_id)
);

-- Create template_phases table
CREATE TABLE template_phases (
  id CHAR(36) PRIMARY KEY,
  template_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  `order` INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
  UNIQUE KEY unique_template_order (template_id, `order`),
  INDEX idx_template (template_id)
);

-- Create template_activities table
CREATE TABLE template_activities (
  id CHAR(36) PRIMARY KEY,
  phase_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL,
  estimated_duration INT NOT NULL,
  `order` INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (phase_id) REFERENCES template_phases(id) ON DELETE CASCADE,
  UNIQUE KEY unique_phase_order (phase_id, `order`),
  INDEX idx_phase (phase_id)
);

-- Create template_usage table
CREATE TABLE template_usage (
  id CHAR(36) PRIMARY KEY,
  template_id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_template (template_id),
  INDEX idx_project (project_id),
  INDEX idx_user (user_id)
);
```

### Rollback Plan

- Keep migration scripts versioned
- Test rollback on staging environment
- Document data dependencies
- Plan for zero-downtime deployment

## Future Enhancements

### Phase 2 Features

1. **Template Versioning**: Track template changes over time
2. **Template Sharing**: Share templates across organizations (marketplace)
3. **Template Import/Export**: JSON/YAML format for portability
4. **Activity Dependencies**: Define dependencies between activities
5. **Resource Assignment**: Assign resources to template activities
6. **Cost Estimation**: Add cost fields to activities
7. **Template Analytics**: Track which templates are most effective

### Technical Improvements

1. **GraphQL API**: Alternative to REST for flexible queries
2. **Real-time Collaboration**: Multiple users editing templates simultaneously
3. **Advanced Search**: Full-text search with Elasticsearch
4. **Template Recommendations**: AI-powered template suggestions
5. **Bulk Operations**: Apply templates to multiple projects at once

## Appendix

### API Request/Response Examples

#### Create Template

**Request**:
```json
POST /api/v1/templates
{
  "name": "AWS MAP Assessment",
  "description": "Standard AWS Migration Acceleration Program assessment template",
  "categoryId": "cat-123",
  "phases": [
    {
      "name": "Discovery",
      "order": 1,
      "activities": [
        {
          "title": "Infrastructure Assessment",
          "description": "Assess current infrastructure and dependencies",
          "priority": "HIGH",
          "estimatedDuration": 40,
          "order": 1
        },
        {
          "title": "Application Portfolio Analysis",
          "description": "Analyze application portfolio for migration readiness",
          "priority": "HIGH",
          "estimatedDuration": 32,
          "order": 2
        }
      ]
    },
    {
      "name": "Planning",
      "order": 2,
      "activities": [
        {
          "title": "Migration Strategy Definition",
          "description": "Define migration strategy and approach",
          "priority": "CRITICAL",
          "estimatedDuration": 24,
          "order": 1
        }
      ]
    }
  ]
}
```

**Response**:
```json
{
  "template": {
    "id": "tpl-456",
    "organizationId": "org-789",
    "name": "AWS MAP Assessment",
    "description": "Standard AWS Migration Acceleration Program assessment template",
    "categoryId": "cat-123",
    "phases": [
      {
        "id": "phase-111",
        "templateId": "tpl-456",
        "name": "Discovery",
        "order": 1,
        "activities": [
          {
            "id": "act-222",
            "phaseId": "phase-111",
            "title": "Infrastructure Assessment",
            "description": "Assess current infrastructure and dependencies",
            "priority": "HIGH",
            "estimatedDuration": 40,
            "order": 1,
            "createdAt": "2024-01-15T10:00:00Z"
          },
          {
            "id": "act-333",
            "phaseId": "phase-111",
            "title": "Application Portfolio Analysis",
            "description": "Analyze application portfolio for migration readiness",
            "priority": "HIGH",
            "estimatedDuration": 32,
            "order": 2,
            "createdAt": "2024-01-15T10:00:00Z"
          }
        ],
        "createdAt": "2024-01-15T10:00:00Z"
      },
      {
        "id": "phase-444",
        "templateId": "tpl-456",
        "name": "Planning",
        "order": 2,
        "activities": [
          {
            "id": "act-555",
            "phaseId": "phase-444",
            "title": "Migration Strategy Definition",
            "description": "Define migration strategy and approach",
            "priority": "CRITICAL",
            "estimatedDuration": 24,
            "order": 1,
            "createdAt": "2024-01-15T10:00:00Z"
          }
        ],
        "createdAt": "2024-01-15T10:00:00Z"
      }
    ],
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z"
  }
}
```

#### Apply Template

**Request**:
```json
POST /api/v1/projects/proj-999/apply-template
{
  "templateId": "tpl-456",
  "selectedActivityIds": ["act-222", "act-333", "act-555"],
  "startDate": "2024-02-01"
}
```

**Response**:
```json
{
  "workItems": [
    {
      "id": "wi-001",
      "projectId": "proj-999",
      "organizationId": "org-789",
      "ownerId": "user-123",
      "title": "Infrastructure Assessment",
      "description": "Assess current infrastructure and dependencies",
      "status": "BACKLOG",
      "priority": "HIGH",
      "startDate": "2024-02-01",
      "estimatedEndDate": "2024-02-06",
      "kanbanColumnId": "col-backlog",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    },
    {
      "id": "wi-002",
      "projectId": "proj-999",
      "organizationId": "org-789",
      "ownerId": "user-123",
      "title": "Application Portfolio Analysis",
      "description": "Analyze application portfolio for migration readiness",
      "status": "BACKLOG",
      "priority": "HIGH",
      "startDate": "2024-02-06",
      "estimatedEndDate": "2024-02-10",
      "kanbanColumnId": "col-backlog",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    },
    {
      "id": "wi-003",
      "projectId": "proj-999",
      "organizationId": "org-789",
      "ownerId": "user-123",
      "title": "Migration Strategy Definition",
      "description": "Define migration strategy and approach",
      "status": "BACKLOG",
      "priority": "CRITICAL",
      "startDate": "2024-02-10",
      "estimatedEndDate": "2024-02-13",
      "kanbanColumnId": "col-backlog",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "createdCount": 3
}
```

### Component File Structure

```
app/
├── [locale]/
│   └── templates/
│       ├── page.tsx                    # Templates list page
│       ├── templates-client.tsx        # Client component
│       └── layout.tsx                  # Templates layout

components/
├── templates/
│   ├── template-list.tsx               # Template list with filters
│   ├── template-card.tsx               # Individual template card
│   ├── template-filters.tsx            # Category and search filters
│   ├── create-template-dialog.tsx      # Create template dialog
│   ├── edit-template-dialog.tsx        # Edit template dialog
│   ├── delete-template-dialog.tsx      # Delete confirmation
│   ├── template-preview-dialog.tsx     # Template preview
│   ├── phase-manager.tsx               # Phase CRUD within template
│   ├── activity-manager.tsx            # Activity CRUD within phase
│   ├── apply-template-dialog.tsx       # Multi-step application wizard
│   ├── template-selection-step.tsx     # Step 1: Select template
│   ├── activity-selection-step.tsx     # Step 2: Select activities
│   ├── date-assignment-step.tsx        # Step 3: Assign dates
│   └── final-preview-step.tsx          # Step 4: Preview and confirm

app/api/v1/
├── templates/
│   ├── route.ts                        # GET, POST /templates
│   ├── [id]/
│   │   ├── route.ts                    # GET, PATCH, DELETE /templates/:id
│   │   └── preview/
│   │       └── route.ts                # GET /templates/:id/preview
├── template-categories/
│   └── route.ts                        # GET, POST /template-categories
└── projects/
    └── [id]/
        └── apply-template/
            └── route.ts                # POST /projects/:id/apply-template

services/
├── template.service.ts                 # Template business logic
└── template-application.service.ts     # Template application logic

lib/
└── validators/
    └── template.validator.ts           # Template validation schemas

messages/
├── es/
│   └── templates.json                  # Spanish translations
└── pt/
    └── templates.json                  # Portuguese translations
```

### Translation Keys

```json
{
  "templates": {
    "title": "Plantillas de Actividades",
    "createTemplate": "Crear Plantilla",
    "editTemplate": "Editar Plantilla",
    "deleteTemplate": "Eliminar Plantilla",
    "applyTemplate": "Aplicar Plantilla",
    "templateName": "Nombre de la Plantilla",
    "templateDescription": "Descripción",
    "category": "Categoría",
    "phases": "Fases",
    "activities": "Actividades",
    "totalDuration": "Duración Total",
    "usageCount": "Veces Utilizada",
    "lastUsed": "Última Utilización",
    "validation": {
      "nameRequired": "El nombre es obligatorio",
      "nameTooLong": "El nombre debe tener 255 caracteres o menos",
      "descriptionRequired": "La descripción es obligatoria",
      "categoryRequired": "La categoría es obligatoria",
      "atLeastOnePhase": "Debe haber al menos una fase",
      "atLeastOneActivity": "Cada fase debe tener al menos una actividad",
      "invalidPriority": "Prioridad inválida",
      "durationRequired": "La duración estimada es obligatoria",
      "durationPositive": "La duración debe ser un número positivo"
    },
    "errors": {
      "createFailed": "Error al crear la plantilla",
      "updateFailed": "Error al actualizar la plantilla",
      "deleteFailed": "Error al eliminar la plantilla",
      "applyFailed": "Error al aplicar la plantilla",
      "notFound": "Plantilla no encontrada",
      "unauthorized": "No tiene permisos para esta operación"
    },
    "success": {
      "created": "Plantilla creada exitosamente",
      "updated": "Plantilla actualizada exitosamente",
      "deleted": "Plantilla eliminada exitosamente",
      "applied": "Plantilla aplicada exitosamente. Se crearon {count} actividades."
    }
  }
}
```

---

**Document Version**: 1.0  
**Last Updated**: 2024-01-15  
**Author**: Kiro AI Assistant  
**Status**: Ready for Review

# Services

This directory contains the business logic layer of the application.

## Service Modules

- `auth.service.ts` - Authentication and authorization
- `organization.service.ts` - Organization management
- `user.service.ts` - User management
- `project.service.ts` - Project CRUD and Kanban board
- `work-item.service.ts` - Work item management and tracking
- `blocker.service.ts` - Blocker management and resolution
- `risk.service.ts` - Risk assessment and management
- `agreement.service.ts` - Agreement tracking
- `ai.service.ts` - AWS Bedrock integration
- `dashboard.service.ts` - Dashboard metrics and analytics
- `export.service.ts` - Report generation and export
- `i18n.service.ts` - Internationalization

## Design Principles

- Each service is responsible for a specific domain
- Services use Prisma for database access
- Services implement business logic and validation
- Services are stateless and can be easily tested
- Services throw typed errors for error handling

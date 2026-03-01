# Authentication Middleware

This directory contains the authentication middleware for protecting API routes in the SaaS platform.

## Overview

The `withAuth` Higher-Order Function (HOF) provides:

- **JWT Token Validation**: Validates JWT tokens from NextAuth.js sessions
- **User Session Extraction**: Extracts user information from the session
- **Organization Context**: Sets organization context for multi-tenant data isolation
- **Permission Checking**: Optionally validates user permissions using RBAC
- **Error Handling**: Handles authentication errors (401, 403) consistently

## Usage

### Basic Authentication

Protect a route with authentication only (no permission check):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware/withAuth'

export const GET = withAuth(async (request, { params }, authContext) => {
  // authContext contains: userId, organizationId, roles, locale, email, name
  
  // Use organizationId for multi-tenant queries
  const projects = await prisma.project.findMany({
    where: {
      organizationId: authContext.organizationId,
    },
  })

  return NextResponse.json({ projects })
})
```

### With Permission Check (OR mode)

Require at least ONE of the specified permissions:

```typescript
import { withAuth } from '@/lib/middleware/withAuth'
import { Permission } from '@/types'

export const GET = withAuth(
  async (request, { params }, authContext) => {
    // Handler code
    return NextResponse.json({ data: 'protected' })
  },
  {
    requiredPermissions: [Permission.PROJECT_VIEW, Permission.PROJECT_UPDATE],
    // User needs PROJECT_VIEW OR PROJECT_UPDATE
  }
)
```

### With Permission Check (AND mode)

Require ALL of the specified permissions:

```typescript
import { withAuth } from '@/lib/middleware/withAuth'
import { Permission } from '@/types'

export const DELETE = withAuth(
  async (request, { params }, authContext) => {
    // Handler code
    return NextResponse.json({ success: true })
  },
  {
    requiredPermissions: [Permission.PROJECT_DELETE, Permission.PROJECT_VIEW],
    requireAllPermissions: true,
    // User needs BOTH PROJECT_DELETE AND PROJECT_VIEW
  }
)
```

### Accessing Organization Context

The `authContext` parameter provides organization context for multi-tenant queries:

```typescript
export const POST = withAuth(async (request, { params }, authContext) => {
  const body = await request.json()

  // Automatically scope to user's organization
  const project = await prisma.project.create({
    data: {
      ...body,
      organizationId: authContext.organizationId, // Multi-tenant isolation
    },
  })

  return NextResponse.json({ project })
})
```

### Using Route Parameters

The middleware preserves route parameters:

```typescript
// app/api/v1/projects/[id]/route.ts
export const GET = withAuth(
  async (request, { params }, authContext) => {
    const projectId = params.id

    // Ensure project belongs to user's organization
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: authContext.organizationId,
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ project })
  },
  { requiredPermissions: [Permission.PROJECT_VIEW] }
)
```

## AuthContext

The `authContext` object passed to your handler contains:

```typescript
interface AuthContext {
  userId: string           // User's unique ID
  organizationId: string   // Organization ID for multi-tenant queries
  roles: string[]          // User's roles (e.g., ['ADMIN', 'PROJECT_MANAGER'])
  locale: string           // User's preferred locale (e.g., 'es', 'pt')
  email: string            // User's email address
  name: string             // User's display name
}
```

## Error Responses

The middleware returns standardized error responses:

### 401 Unauthorized

Returned when:
- No session exists
- Session is invalid or expired
- Required session data is missing

```json
{
  "error": "Unauthorized",
  "message": "Authentication required. Please sign in."
}
```

### 403 Forbidden

Returned when:
- User lacks required permissions

```json
{
  "error": "Forbidden",
  "message": "You do not have permission to access this resource."
}
```

### 500 Internal Server Error

Returned when:
- An unexpected error occurs during authentication

```json
{
  "error": "Internal Server Error",
  "message": "An error occurred while processing your request."
}
```

## Multi-Tenant Data Isolation

The middleware ensures multi-tenant data isolation by:

1. Extracting `organizationId` from the authenticated user's session
2. Passing it to your handler via `authContext`
3. Allowing you to scope all database queries to the user's organization

**Always use `authContext.organizationId` in your queries** to ensure data isolation:

```typescript
// ✅ CORRECT - Scoped to user's organization
const projects = await prisma.project.findMany({
  where: {
    organizationId: authContext.organizationId,
  },
})

// ❌ WRONG - Not scoped, violates multi-tenancy
const projects = await prisma.project.findMany()
```

## Testing

See `__tests__/withAuth.test.ts` for comprehensive test examples covering:

- Authentication validation
- Permission checking (OR and AND modes)
- Organization context
- Error handling
- Inactive user handling

## Related Files

- `lib/auth.ts` - NextAuth.js configuration
- `lib/rbac.ts` - RBAC permission system
- `types/index.ts` - Permission and Role enums

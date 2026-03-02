# Error Handling Integration Examples

This document shows how to integrate the error handling and logging system into existing API routes.

## Example 1: Simple API Route with Error Handling

**Before:**

```typescript
// app/api/v1/projects/[projectId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  
  const project = await prisma.project.findUnique({
    where: { id: projectId }
  })
  
  if (!project) {
    return NextResponse.json(
      { error: 'Project not found' },
      { status: 404 }
    )
  }
  
  return NextResponse.json({ project })
}
```

**After:**

```typescript
// app/api/v1/projects/[projectId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { asyncHandlerWithParams } from '@/lib/middleware'
import { NotFoundError } from '@/lib/errors'
import prisma from '@/lib/prisma'

export const GET = asyncHandlerWithParams(
  async (req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) => {
    const { projectId } = await params
    
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    })
    
    if (!project) {
      throw new NotFoundError('Project')
    }
    
    return NextResponse.json({ project })
  }
)
```

## Example 2: Protected Route with Auth and Error Handling

**Before:**

```typescript
// app/api/v1/projects/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware'
import { Permission } from '@/types'
import prisma from '@/lib/prisma'

export const GET = withAuth(
  async (req: NextRequest, context: any, authContext: any) => {
    try {
      const projects = await prisma.project.findMany({
        where: { organizationId: authContext.organizationId }
      })
      
      return NextResponse.json({ projects })
    } catch (error) {
      console.error('Error fetching projects:', error)
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  },
  { requiredPermissions: [Permission.PROJECT_VIEW] }
)
```

**After:**

```typescript
// app/api/v1/projects/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, asyncHandler } from '@/lib/middleware'
import { Permission } from '@/types'
import prisma from '@/lib/prisma'

export const GET = withAuth(
  asyncHandler(async (req: NextRequest, context: any, authContext: any) => {
    const projects = await prisma.project.findMany({
      where: { organizationId: authContext.organizationId }
    })
    
    return NextResponse.json({ projects })
  }),
  { requiredPermissions: [Permission.PROJECT_VIEW] }
)
```

## Example 3: Adding Audit Logging to Authentication

**Before:**

```typescript
// app/api/auth/signin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { signIn } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  
  const result = await signIn('credentials', {
    email,
    password,
    redirect: false
  })
  
  if (result?.error) {
    return NextResponse.json(
      { error: 'Invalid credentials' },
      { status: 401 }
    )
  }
  
  return NextResponse.json({ success: true })
}
```

**After:**

```typescript
// app/api/auth/signin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { asyncHandler } from '@/lib/middleware'
import { AuthenticationError } from '@/lib/errors'
import AuditLogger from '@/lib/services/audit-logger'
import { signIn } from '@/lib/auth'

export const POST = asyncHandler(async (req: NextRequest) => {
  const { email, password } = await req.json()
  
  const result = await signIn('credentials', {
    email,
    password,
    redirect: false
  })
  
  if (result?.error) {
    // Log authentication failure
    AuditLogger.logAuthFailure(email, 'Invalid credentials', {
      ipAddress: req.headers.get('x-forwarded-for') || req.ip,
      userAgent: req.headers.get('user-agent') || undefined,
    })
    
    throw new AuthenticationError('Invalid credentials')
  }
  
  // Log successful authentication
  AuditLogger.logAuthSuccess(result.user.id, {
    organizationId: result.user.organizationId,
    ipAddress: req.headers.get('x-forwarded-for') || req.ip,
    userAgent: req.headers.get('user-agent') || undefined,
  })
  
  return NextResponse.json({ success: true })
})
```

## Example 4: Adding Audit Logging to User Management

**Before:**

```typescript
// app/api/v1/users/[userId]/roles/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware'
import { Permission } from '@/types'
import prisma from '@/lib/prisma'

export const PATCH = withAuth(
  async (req: NextRequest, context: any, authContext: any) => {
    const { userId } = await context.params
    const { roles } = await req.json()
    
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }
    
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { roles }
    })
    
    return NextResponse.json({ user: updatedUser })
  },
  { requiredPermissions: [Permission.USER_MANAGE] }
)
```

**After:**

```typescript
// app/api/v1/users/[userId]/roles/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, asyncHandlerWithParams } from '@/lib/middleware'
import { NotFoundError } from '@/lib/errors'
import AuditLogger from '@/lib/services/audit-logger'
import { Permission } from '@/types'
import prisma from '@/lib/prisma'

export const PATCH = withAuth(
  asyncHandlerWithParams(
    async (req: NextRequest, { params }: { params: Promise<{ userId: string }> }, authContext: any) => {
      const { userId } = await params
      const { roles } = await req.json()
      
      const user = await prisma.user.findUnique({
        where: { id: userId }
      })
      
      if (!user) {
        throw new NotFoundError('User')
      }
      
      const oldRoles = user.roles
      
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { roles }
      })
      
      // Log role change
      AuditLogger.logUserRoleChanged(
        userId,
        authContext.userId,
        oldRoles,
        roles,
        {
          organizationId: authContext.organizationId,
          requestId: crypto.randomUUID(),
        }
      )
      
      return NextResponse.json({ user: updatedUser })
    }
  ),
  { requiredPermissions: [Permission.USER_MANAGE] }
)
```

## Example 5: Logging Authorization Failures

You can also add audit logging to the `withAuth` middleware itself to automatically log authorization failures:

```typescript
// lib/middleware/withAuth.ts (modification)
import AuditLogger from '@/lib/services/audit-logger'

// Inside withAuth, when permission check fails:
if (!hasAllPermissions && !hasAnyPermission) {
  // Log authorization failure
  AuditLogger.logAuthorizationFailure(
    session.user.id,
    req.url,
    requiredPermissions || [],
    {
      organizationId: session.user.organizationId,
      ipAddress: req.headers.get('x-forwarded-for') || req.ip,
      requestId: crypto.randomUUID(),
    }
  )
  
  return createAuthResponse(403, 'Insufficient permissions')
}
```

## Key Benefits

1. **Consistent Error Responses**: All errors follow the same format
2. **Automatic Logging**: Errors are automatically logged with context
3. **CloudWatch Integration**: Production logs go to CloudWatch
4. **Audit Trail**: Security events are tracked for compliance
5. **Less Boilerplate**: No need for try-catch in every handler
6. **Type Safety**: Typed error classes prevent mistakes

## Example 6: Adding Performance Monitoring

**Before:**

```typescript
// app/api/v1/dashboard/executive/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/middleware'
import { Permission } from '@/types'
import { dashboardService } from '@/services/dashboard.service'

export const GET = withAuth(
  async (req: NextRequest, context: any, authContext: any) => {
    const dashboard = await dashboardService.getExecutiveDashboard(
      authContext.organizationId
    )
    
    return NextResponse.json({ dashboard })
  },
  { requiredPermissions: [Permission.DASHBOARD_EXECUTIVE] }
)
```

**After:**

```typescript
// app/api/v1/dashboard/executive/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withAuth, asyncHandler } from '@/lib/middleware'
import { withPerformanceTrackingAuth } from '@/lib/middleware/performance-middleware'
import { Permission } from '@/types'
import { dashboardService } from '@/services/dashboard.service'

export const GET = withAuth(
  withPerformanceTrackingAuth(
    asyncHandler(async (req: NextRequest, context: any, authContext: any) => {
      const dashboard = await dashboardService.getExecutiveDashboard(
        authContext.organizationId
      )
      
      return NextResponse.json({ dashboard })
    })
  ),
  { requiredPermissions: [Permission.DASHBOARD_EXECUTIVE] }
)
```

**For non-authenticated routes:**

```typescript
// app/api/v1/health/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withPerformanceTracking } from '@/lib/middleware/performance-middleware'

export const GET = withPerformanceTracking(async (req: NextRequest) => {
  return NextResponse.json({ status: 'ok' })
})
```

## Example 7: Tracking AI Service Performance

**In AI Service:**

```typescript
// lib/services/ai-service.ts
import { PerformanceMonitor } from '@/lib/monitoring/performance-monitor'

async generateProjectReport(projectId: string): Promise<string> {
  const startTime = Date.now()
  
  try {
    const response = await this.bedrockClient.send(command)
    const duration = Date.now() - startTime
    
    // Track Bedrock call performance
    await PerformanceMonitor.trackBedrockCall(
      duration,
      this.modelId,
      response.usage?.inputTokens || 0,
      response.usage?.outputTokens || 0
    )
    
    return response.content
  } catch (error) {
    const duration = Date.now() - startTime
    
    // Track failed call
    await PerformanceMonitor.trackBedrockCall(
      duration,
      this.modelId,
      0,
      0
    )
    
    throw error
  }
}
```

## Example 8: Tracking Cache Performance

**In Cache Service:**

```typescript
// lib/services/cache-service.ts
import { PerformanceMonitor } from '@/lib/monitoring/performance-monitor'

async getCachedAnalysis(projectId: string): Promise<AIAnalysis | null> {
  const cached = await prisma.aIAnalysisCache.findUnique({
    where: { projectId }
  })
  
  if (cached && cached.expiresAt > new Date()) {
    // Cache hit
    await PerformanceMonitor.trackCacheHit('ai-analysis', true)
    return cached.analysisData as AIAnalysis
  }
  
  // Cache miss
  await PerformanceMonitor.trackCacheHit('ai-analysis', false)
  return null
}
```

## Migration Checklist

When migrating existing routes:

- [ ] Replace `async function` with `asyncHandler` or `asyncHandlerWithParams`
- [ ] Replace manual error responses with typed error classes
- [ ] Remove try-catch blocks (unless you need custom error handling)
- [ ] Add audit logging for security-sensitive operations
- [ ] Add performance tracking with `withPerformanceTracking` or `withPerformanceTrackingAuth`
- [ ] Track AI service calls with `PerformanceMonitor.trackBedrockCall`
- [ ] Track cache hits/misses with `PerformanceMonitor.trackCacheHit`
- [ ] Test error scenarios to ensure proper error responses
- [ ] Verify logs appear in CloudWatch (production) or console (development)
- [ ] Verify metrics appear in CloudWatch Metrics (production)

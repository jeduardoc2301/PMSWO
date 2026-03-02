# Error Handling and Logging System

This document describes the error handling and logging infrastructure for the SaaS PM application.

## Overview

The system implements a comprehensive error handling strategy with:

1. **Global Error Handler** - Catches and standardizes all API errors
2. **Winston Logger** - Structured logging with CloudWatch integration
3. **Audit Logger** - Security event tracking for compliance

## Components

### 1. Error Handler Middleware (`error-handler.ts`)

Provides global error handling for API routes with standardized error responses.

#### Features

- Maps errors to appropriate HTTP status codes
- Returns standardized error responses
- Logs errors to CloudWatch (in production)
- Extracts user context for logging
- Generates unique request IDs for tracking

#### Usage

**Basic async handler:**

```typescript
import { asyncHandler } from '@/lib/middleware'

export const GET = asyncHandler(async (req: NextRequest) => {
  // Your handler code
  const data = await someOperation()
  return NextResponse.json({ data })
})
```

**With dynamic params:**

```typescript
import { asyncHandlerWithParams } from '@/lib/middleware'

export const GET = asyncHandlerWithParams(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params
    const data = await getById(id)
    return NextResponse.json({ data })
  }
)
```

**Manual error handling:**

```typescript
import { handleError } from '@/lib/middleware'

export async function GET(req: NextRequest) {
  try {
    // Your code
  } catch (error) {
    return handleError(error, req)
  }
}
```

#### Error Response Format

All errors follow this standardized format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "requestId": "uuid-for-tracking",
    "details": {
      // Optional additional details
    }
  }
}
```

### 2. Logger Service (`logger.ts`)

Winston-based logging service with CloudWatch integration for production.

#### Features

- Structured JSON logging
- Multiple log levels (error, warn, info, http, debug)
- Console output in development
- CloudWatch transport in production
- Automatic error stack trace capture

#### Configuration

Set these environment variables for CloudWatch logging:

```env
NODE_ENV=production
AWS_REGION=us-east-1
CLOUDWATCH_LOG_GROUP=/aws/ec2/saas-pm-app
INSTANCE_ID=i-1234567890abcdef0
```

#### Usage

**Basic logging:**

```typescript
import { logger } from '@/lib/logger'

logger.info('User logged in', { userId: '123', organizationId: '456' })
logger.warn('Rate limit approaching', { userId: '123', remaining: 10 })
logger.error('Database connection failed', { error: err.message })
```

**Helper functions:**

```typescript
import { logError, logWarning, logInfo, logDebug } from '@/lib/logger'

logError('Failed to process request', error, {
  userId: '123',
  requestId: 'abc-def',
  path: '/api/v1/projects',
})

logWarning('Slow query detected', { query: 'SELECT ...', duration: 5000 })
logInfo('Cache hit', { key: 'project:123' })
logDebug('Processing item', { itemId: '456' })
```

#### Log Levels

- **error** (0): Error conditions that need immediate attention
- **warn** (1): Warning conditions that should be reviewed
- **info** (2): Informational messages about normal operations
- **http** (3): HTTP request/response logging
- **debug** (4): Detailed debugging information (development only)

### 3. Audit Logger (`audit-logger.ts`)

Specialized logging for security-sensitive events.

#### Features

- Tracks authentication events (login, logout, failures)
- Tracks authorization failures
- Tracks sensitive operations (user creation, role changes)
- Severity levels (INFO, WARNING, CRITICAL)
- Automatic CloudWatch integration via Winston

#### Usage

**Authentication events:**

```typescript
import AuditLogger from '@/lib/services/audit-logger'

// Successful login
AuditLogger.logAuthSuccess(userId, {
  organizationId,
  ipAddress: req.ip,
  userAgent: req.headers.get('user-agent'),
})

// Failed login
AuditLogger.logAuthFailure(email, 'Invalid password', {
  ipAddress: req.ip,
  userAgent: req.headers.get('user-agent'),
})

// Logout
AuditLogger.logLogout(userId, {
  organizationId,
  ipAddress: req.ip,
})
```

**Authorization events:**

```typescript
// Access denied
AuditLogger.logAuthorizationFailure(
  userId,
  'projects:123',
  ['PROJECT_UPDATE'],
  {
    organizationId,
    requestId,
  }
)
```

**User management events:**

```typescript
// User created
AuditLogger.logUserCreated(newUserId, creatorUserId, ['PROJECT_MANAGER'], {
  organizationId,
  requestId,
})

// Role changed
AuditLogger.logUserRoleChanged(
  targetUserId,
  adminUserId,
  ['CONSULTANT'],
  ['ADMIN', 'PROJECT_MANAGER'],
  { organizationId, requestId }
)

// User deactivated
AuditLogger.logUserStatusChanged(targetUserId, adminUserId, false, {
  organizationId,
  requestId,
})
```

**Organization events:**

```typescript
// User added to organization
AuditLogger.logOrgUserAdded(
  organizationId,
  newUserId,
  adminUserId,
  ['CONSULTANT'],
  { requestId }
)

// User removed from organization
AuditLogger.logOrgUserRemoved(organizationId, userId, adminUserId, {
  requestId,
})

// Settings changed
AuditLogger.logOrgSettingsChanged(
  organizationId,
  adminUserId,
  { defaultLocale: 'es', blockerThreshold: 48 },
  { requestId }
)
```

**Password events:**

```typescript
// Password changed
AuditLogger.logPasswordChanged(userId, {
  ipAddress: req.ip,
  requestId,
})

// Password reset requested
AuditLogger.logPasswordResetRequested(email, {
  ipAddress: req.ip,
  requestId,
})

// Password reset completed
AuditLogger.logPasswordResetCompleted(userId, {
  ipAddress: req.ip,
  requestId,
})
```

## Error Classes

The system uses typed error classes from `lib/errors.ts`:

- **AppError** - Base error class with code and status
- **ValidationError** - Input validation errors (400)
- **AuthenticationError** - Authentication failures (401)
- **AuthorizationError** - Permission denied (403)
- **NotFoundError** - Resource not found (404)
- **ConflictError** - Resource conflicts (409)
- **AIServiceError** - AI service failures (500)
- **AIGuardrailsError** - AI guardrails blocked content (400)

## Best Practices

### 1. Always Use Error Handler

Wrap all API route handlers with `asyncHandler` or `asyncHandlerWithParams`:

```typescript
// ✅ Good
export const GET = asyncHandler(async (req) => {
  // Your code
})

// ❌ Bad - errors won't be caught
export async function GET(req: NextRequest) {
  // Your code
}
```

### 2. Throw Typed Errors

Use specific error classes instead of generic Error:

```typescript
import { NotFoundError, ValidationError } from '@/lib/errors'

// ✅ Good
if (!project) {
  throw new NotFoundError('Project')
}

// ❌ Bad
if (!project) {
  throw new Error('Project not found')
}
```

### 3. Log Security Events

Always log security-sensitive operations:

```typescript
// User login
AuditLogger.logAuthSuccess(userId, context)

// Permission denied
AuditLogger.logAuthorizationFailure(userId, resource, permissions, context)

// Role change
AuditLogger.logUserRoleChanged(targetUserId, adminUserId, oldRoles, newRoles, context)
```

### 4. Include Context in Logs

Provide rich context for debugging:

```typescript
logger.error('Failed to create project', {
  error: err.message,
  userId,
  organizationId,
  requestId,
  projectData: { name, client },
})
```

### 5. Use Appropriate Log Levels

- **error**: Failures that need immediate attention
- **warn**: Issues that should be reviewed but don't break functionality
- **info**: Normal operations (user actions, state changes)
- **debug**: Detailed information for debugging (development only)

## CloudWatch Integration

### Production Setup

1. Set environment variables:

```env
NODE_ENV=production
AWS_REGION=us-east-1
CLOUDWATCH_LOG_GROUP=/aws/ec2/saas-pm-app
INSTANCE_ID=i-1234567890abcdef0
```

2. Ensure EC2 instance has IAM role with CloudWatch permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

### Log Structure

Logs are sent to CloudWatch with this structure:

```json
{
  "timestamp": "2024-03-01T12:34:56.789Z",
  "level": "error",
  "message": "API Error",
  "service": "saas-pm-app",
  "environment": "production",
  "requestId": "uuid",
  "error": {
    "name": "NotFoundError",
    "code": "NOT_FOUND",
    "message": "Project not found",
    "stack": "..."
  },
  "request": {
    "method": "GET",
    "url": "https://...",
    "path": "/api/v1/projects/123"
  },
  "user": {
    "userId": "user-123",
    "organizationId": "org-456"
  }
}
```

## Testing

### Unit Tests

Test error handling in your route handlers:

```typescript
import { describe, it, expect } from 'vitest'
import { GET } from './route'
import { NotFoundError } from '@/lib/errors'

describe('GET /api/v1/projects/:id', () => {
  it('should return 404 for non-existent project', async () => {
    const req = new NextRequest('http://localhost/api/v1/projects/invalid')
    const response = await GET(req, { params: Promise.resolve({ id: 'invalid' }) })

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error.code).toBe('NOT_FOUND')
  })
})
```

### Audit Log Testing

Verify audit logs are created:

```typescript
import { describe, it, expect, vi } from 'vitest'
import AuditLogger from '@/lib/services/audit-logger'
import { logger } from '@/lib/logger'

vi.mock('@/lib/logger')

describe('AuditLogger', () => {
  it('should log authentication failure', () => {
    AuditLogger.logAuthFailure('user@example.com', 'Invalid password', {
      ipAddress: '127.0.0.1',
    })

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Login failed'),
      expect.objectContaining({
        audit: true,
        eventType: 'AUTH_LOGIN_FAILURE',
      })
    )
  })
})
```

## Troubleshooting

### CloudWatch Logs Not Appearing

1. Check environment variables are set correctly
2. Verify IAM role has CloudWatch permissions
3. Check CloudWatch log group exists
4. Review application logs for CloudWatch errors

### Error Handler Not Catching Errors

1. Ensure route handler is wrapped with `asyncHandler`
2. Check error is being thrown (not returned)
3. Verify error handler middleware is imported correctly

### Audit Logs Missing

1. Verify logger is configured correctly
2. Check audit log calls are in the right places
3. Review CloudWatch for audit events (filter by `audit: true`)

## Requirements Mapping

- **Requirement 14.3**: Global error handler with standardized responses
- **Requirement 17.2**: Error logging to CloudWatch with context
- **Requirement 15.5**: Audit logging for security events

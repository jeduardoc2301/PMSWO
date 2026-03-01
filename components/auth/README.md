# Authentication Components

This directory contains components and utilities for protecting routes and pages in the application.

## Components

### ProtectedRoute (Client-side)

A client component that wraps pages requiring authentication and/or specific permissions. Use this for client components that need dynamic protection.

**Features:**
- Checks authentication status via API call
- Redirects unauthenticated users to sign-in page
- Checks user permissions and roles
- Shows loading state during authentication check
- Shows unauthorized message for users without required permissions
- Preserves callback URL for post-login redirect

**Usage:**

```tsx
'use client'

import { ProtectedRoute } from '@/components/auth'
import { Permission, UserRole } from '@/types'

// Basic authentication only
export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  )
}

// With required permissions
export default function ProjectsPage() {
  return (
    <ProtectedRoute requiredPermissions={[Permission.PROJECT_VIEW]}>
      <ProjectsList />
    </ProtectedRoute>
  )
}

// With required roles
export default function AdminPage() {
  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <AdminPanel />
    </ProtectedRoute>
  )
}

// With custom redirect and loading
export default function CustomPage() {
  return (
    <ProtectedRoute
      redirectTo="/custom-signin"
      loadingComponent={<CustomLoader />}
      unauthorizedComponent={<CustomUnauthorized />}
    >
      <PageContent />
    </ProtectedRoute>
  )
}
```

### ProtectedPage (Server-side)

A server component that checks authentication and permissions during SSR. More efficient than client-side protection as it happens before the page is sent to the client.

**Features:**
- Server-side authentication check (faster, no API call needed)
- Automatic redirect for unauthenticated users
- Permission and role checking
- Shows unauthorized message for users without required permissions

**Usage:**

```tsx
// In a server component (page.tsx)
import { ProtectedPage } from '@/components/auth'
import { Permission, UserRole } from '@/types'

// Basic authentication only
export default async function DashboardPage() {
  return (
    <ProtectedPage>
      <DashboardContent />
    </ProtectedPage>
  )
}

// With required permissions
export default async function ProjectsPage() {
  return (
    <ProtectedPage requiredPermissions={[Permission.PROJECT_VIEW]}>
      <ProjectsList />
    </ProtectedPage>
  )
}

// With required roles
export default async function AdminPage() {
  return (
    <ProtectedPage requiredRoles={[UserRole.ADMIN, UserRole.PROJECT_MANAGER]}>
      <AdminPanel />
    </ProtectedPage>
  )
}
```

## Utility Functions

### getCurrentUser()

Get the current authenticated user in server components.

```tsx
import { getCurrentUser } from '@/components/auth'

export default async function MyPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/auth/signin')
  }
  
  return <div>Welcome, {user.name}</div>
}
```

### checkPermission(permission)

Check if the current user has a specific permission.

```tsx
import { checkPermission } from '@/components/auth'
import { Permission } from '@/types'

export default async function MyPage() {
  const canCreateProject = await checkPermission(Permission.PROJECT_CREATE)
  
  return (
    <div>
      {canCreateProject && <CreateProjectButton />}
    </div>
  )
}
```

### checkRole(role)

Check if the current user has a specific role.

```tsx
import { checkRole } from '@/components/auth'
import { UserRole } from '@/types'

export default async function MyPage() {
  const isAdmin = await checkRole(UserRole.ADMIN)
  
  return (
    <div>
      {isAdmin && <AdminControls />}
    </div>
  )
}
```

## Middleware

The application uses Next.js middleware to protect routes at the edge. Protected routes are defined in `middleware.ts`:

```typescript
const protectedRoutes = [
  '/dashboard',
  '/projects',
  '/work-items',
  '/blockers',
  '/risks',
  '/agreements',
  '/settings',
]
```

The middleware:
1. Checks if the route requires authentication
2. Redirects unauthenticated users to sign-in page
3. Preserves the callback URL for post-login redirect
4. Applies internationalization middleware

## Best Practices

### When to use ProtectedRoute vs ProtectedPage

- **Use ProtectedPage (server-side)** when:
  - You're working with server components (default in Next.js 14+)
  - You want better performance (no client-side API call)
  - You want to protect the entire page
  - You don't need dynamic client-side state

- **Use ProtectedRoute (client-side)** when:
  - You're working with client components ('use client')
  - You need access to client-side hooks (useState, useEffect, etc.)
  - You want to show custom loading/unauthorized components
  - You need dynamic permission checks based on client state

### Combining with Middleware

The middleware provides the first layer of protection at the edge. Use ProtectedPage or ProtectedRoute for additional permission/role checks:

```tsx
// middleware.ts protects /dashboard route
// ProtectedPage adds permission check
export default async function DashboardPage() {
  return (
    <ProtectedPage requiredPermissions={[Permission.DASHBOARD_EXECUTIVE]}>
      <ExecutiveDashboard />
    </ProtectedPage>
  )
}
```

### Error Handling

Both components handle errors gracefully:
- Network errors during authentication check → redirect to sign-in
- Invalid session data → redirect to sign-in
- Missing permissions → show unauthorized message
- Missing roles → show unauthorized message

## Testing

See `__tests__/protected-route.test.tsx` and `__tests__/protected-page.test.tsx` for test examples.

## Requirements

This implementation satisfies:
- **Requirement 15.4**: Token validation and authentication middleware
- **Requirement 2.1**: RBAC permission checking for routes

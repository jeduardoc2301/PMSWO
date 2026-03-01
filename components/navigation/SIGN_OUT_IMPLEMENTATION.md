# Sign-Out Functionality Implementation

This document explains how the sign-out functionality is implemented in the application.

## Overview

The sign-out functionality allows authenticated users to securely log out of the application. When a user signs out:

1. The NextAuth session is cleared
2. Session cookies are removed
3. The user is redirected to the sign-in page

## Components

### 1. Client-Side Sign-Out Utility (`lib/auth-client.ts`)

The `signOut` function wraps NextAuth's `signOut` functionality:

```typescript
import { signOut } from '@/lib/auth-client'

// Sign out with current locale
await signOut('es')

// Sign out with default locale (Spanish)
await signOut()
```

**Features:**
- Calls NextAuth's `signOut` with proper redirect URL
- Handles errors gracefully by redirecting to sign-in page
- Supports internationalization (locale-aware redirects)

### 2. MainNav Component (`components/navigation/main-nav.tsx`)

The navigation component includes a sign-out button in the user profile dropdown:

```typescript
<button onClick={onSignOut}>
  {t('nav.signOut')}
</button>
```

**Props:**
- `onSignOut: () => void` - Callback function to handle sign-out

### 3. MainNavWrapper Component (`components/navigation/main-nav-wrapper.tsx`)

A wrapper component that connects MainNav with authentication:

```typescript
import { MainNavWrapper } from '@/components/navigation/main-nav-wrapper'

export default function DashboardLayout({ children }) {
  return (
    <div>
      <MainNavWrapper />
      <main>{children}</main>
    </div>
  )
}
```

**Features:**
- Fetches current session using `useSession`
- Provides sign-out handler to MainNav
- Handles locale changes
- Shows loading state while session is being fetched
- Redirects to sign-in if not authenticated

### 4. API Route (`app/api/v1/auth/signout/route.ts`)

Server-side endpoint that clears session cookies:

```
POST /api/v1/auth/signout
```

**Response:**
```json
{
  "message": "Signed out successfully"
}
```

**Note:** This endpoint is called automatically by NextAuth's `signOut` function. You don't need to call it directly from client code.

## Usage Examples

### Basic Usage in a Layout

```typescript
// app/[locale]/dashboard/layout.tsx
import { MainNavWrapper } from '@/components/navigation/main-nav-wrapper'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex">
      <MainNavWrapper />
      <main className="flex-1 ml-64 p-8">
        {children}
      </main>
    </div>
  )
}
```

### Custom Sign-Out Handler

If you need a custom sign-out handler (e.g., for a different button):

```typescript
'use client'

import { useLocale } from 'next-intl'
import { signOut } from '@/lib/auth-client'
import { Locale } from '@/types'

export function CustomSignOutButton() {
  const locale = useLocale() as Locale

  const handleSignOut = async () => {
    // Optional: Show confirmation dialog
    if (confirm('Are you sure you want to sign out?')) {
      await signOut(locale)
    }
  }

  return (
    <button onClick={handleSignOut}>
      Sign Out
    </button>
  )
}
```

### Sign-Out with Analytics

```typescript
'use client'

import { useLocale } from 'next-intl'
import { signOut } from '@/lib/auth-client'
import { Locale } from '@/types'

export function AnalyticsSignOutButton() {
  const locale = useLocale() as Locale

  const handleSignOut = async () => {
    // Track sign-out event
    analytics.track('user_signed_out', {
      timestamp: new Date().toISOString(),
    })

    // Perform sign-out
    await signOut(locale)
  }

  return (
    <button onClick={handleSignOut}>
      Sign Out
    </button>
  )
}
```

## Security Considerations

1. **JWT Tokens**: Since we use JWT tokens (stateless), tokens cannot be truly "invalidated" server-side. They will expire based on the configured `maxAge` (30 days by default).

2. **Cookie Clearing**: The sign-out process clears all NextAuth cookies, preventing the token from being used in subsequent requests.

3. **Redirect**: After sign-out, users are immediately redirected to the sign-in page, preventing access to protected routes.

4. **Error Handling**: If sign-out fails for any reason, the user is still redirected to the sign-in page as a fallback.

## Testing

Tests are provided for all components:

- `lib/__tests__/auth-client.test.ts` - Tests for the sign-out utility
- `components/navigation/__tests__/main-nav-wrapper.test.tsx` - Tests for the wrapper component
- `components/navigation/__tests__/main-nav.test.tsx` - Tests for the navigation component
- `app/api/v1/auth/signout/__tests__/route.test.ts` - Tests for the API route

Run tests with:

```bash
npm test
```

## Internationalization

The sign-out functionality supports multiple locales:

- Spanish (es): Redirects to `/es/auth/signin`
- Portuguese (pt): Redirects to `/pt/auth/signin`

Translation keys used:
- `nav.signOut` - Sign-out button text in navigation

## Requirements Satisfied

This implementation satisfies **Requirement 15.1**:
- ✅ Users can sign in and sign out
- ✅ Session is cleared on sign-out
- ✅ User is redirected to sign-in page after sign-out
- ✅ Proper error handling
- ✅ Internationalization support

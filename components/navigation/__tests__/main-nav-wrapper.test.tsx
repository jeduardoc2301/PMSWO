import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MainNavWrapper } from '../main-nav-wrapper'
import { UserRole, Locale } from '@/types'
import * as NextAuthReact from 'next-auth/react'
import * as NextNavigation from 'next/navigation'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

// Mock next-intl
vi.mock('next-intl', () => ({
  useLocale: vi.fn(() => 'es'),
  useTranslations: vi.fn(() => (key: string) => key),
}))

// Mock MainNav component
vi.mock('../main-nav', () => ({
  MainNav: vi.fn(({ user, onSignOut, onLocaleChange }) => (
    <div data-testid="main-nav">
      <div>{user.name}</div>
      <div>{user.email}</div>
      <button onClick={onSignOut}>Sign Out</button>
      <button onClick={() => onLocaleChange('pt')}>Change Locale</button>
    </div>
  )),
}))

// Mock auth-client
vi.mock('@/lib/auth-client', () => ({
  signOut: vi.fn(),
}))

describe('MainNavWrapper', () => {
  const mockPush = vi.fn()
  const mockRefresh = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(NextNavigation.useRouter).mockReturnValue({
      push: mockPush,
      refresh: mockRefresh,
    } as any)
  })

  it('shows loading state while session is loading', () => {
    vi.mocked(NextAuthReact.useSession).mockReturnValue({
      data: null,
      status: 'loading',
      update: vi.fn(),
    })

    render(<MainNavWrapper />)

    // Check for loading spinner
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('redirects to sign-in when unauthenticated', () => {
    vi.mocked(NextAuthReact.useSession).mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: vi.fn(),
    })

    render(<MainNavWrapper />)

    expect(mockPush).toHaveBeenCalledWith('/es/auth/signin')
  })

  it('renders MainNav when authenticated', () => {
    vi.mocked(NextAuthReact.useSession).mockReturnValue({
      data: {
        user: {
          id: '1',
          name: 'John Doe',
          email: 'john@example.com',
          organizationId: 'org-1',
          roles: [UserRole.PROJECT_MANAGER],
          locale: 'es',
        },
        expires: '2024-12-31',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    render(<MainNavWrapper />)

    expect(screen.getByTestId('main-nav')).toBeInTheDocument()
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('john@example.com')).toBeInTheDocument()
  })

  it('calls signOut with correct locale when sign out is clicked', async () => {
    const { signOut } = await import('@/lib/auth-client')
    
    vi.mocked(NextAuthReact.useSession).mockReturnValue({
      data: {
        user: {
          id: '1',
          name: 'John Doe',
          email: 'john@example.com',
          organizationId: 'org-1',
          roles: [UserRole.PROJECT_MANAGER],
          locale: 'es',
        },
        expires: '2024-12-31',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    render(<MainNavWrapper />)

    const signOutButton = screen.getByText('Sign Out')
    signOutButton.click()

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith('es')
    })
  })

  it('handles locale change correctly', async () => {
    // Mock window.location
    delete (window as any).location
    window.location = { pathname: '/es/dashboard' } as any

    vi.mocked(NextAuthReact.useSession).mockReturnValue({
      data: {
        user: {
          id: '1',
          name: 'John Doe',
          email: 'john@example.com',
          organizationId: 'org-1',
          roles: [UserRole.PROJECT_MANAGER],
          locale: 'es',
        },
        expires: '2024-12-31',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    render(<MainNavWrapper />)

    const changeLocaleButton = screen.getByText('Change Locale')
    changeLocaleButton.click()

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/pt/dashboard')
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('redirects to sign-in when session user is null', () => {
    vi.mocked(NextAuthReact.useSession).mockReturnValue({
      data: {
        user: null as any,
        expires: '2024-12-31',
      },
      status: 'authenticated',
      update: vi.fn(),
    })

    render(<MainNavWrapper />)

    expect(mockPush).toHaveBeenCalledWith('/es/auth/signin')
  })
})

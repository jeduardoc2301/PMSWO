import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
// El componente guarda el idioma elegido llamando a la interfaz de programación. Sin simular
// `fetch`, la prueba intenta salir a la red de verdad contra un servidor que no está levantado.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  // El componente resalta la sección activa, así que necesita saber en qué ruta está. La
  // simulación se había quedado solo con el enrutador.
  usePathname: vi.fn(() => '/es/dashboard'),
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

  /**
   * El cambio de idioma dejó de navegar con el enrutador y ahora recarga la página entera
   * (`window.location.href`). No es un detalle: los mensajes se cargan en el servidor según el
   * prefijo de idioma de la ruta, y una navegación del lado del cliente conserva los que ya estaban
   * en memoria. Recargar es lo que garantiza que el idioma cambie de verdad.
   */
  it('handles locale change correctly', async () => {
    // Mock window.location
    delete (window as any).location
    window.location = { pathname: '/es/dashboard', href: '/es/dashboard' } as any

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
      expect(window.location.href).toBe('/pt/dashboard')
    })
    expect(mockPush).not.toHaveBeenCalledWith('/pt/dashboard')
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

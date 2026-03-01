import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import SignInPage from '../page'

// Mock dependencies
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: vi.fn(),
}))

describe('SignInPage', () => {
  const mockPush = vi.fn()
  const mockRefresh = vi.fn()
  const mockT = vi.fn((key: string) => {
    const translations: Record<string, string> = {
      'common.appName': 'Gestión de Proyectos Ejecutiva',
      'auth.signIn': 'Iniciar Sesión',
      'auth.email': 'Correo Electrónico',
      'auth.password': 'Contraseña',
      'auth.invalidCredentials': 'Credenciales inválidas',
      'common.loading': 'Cargando...',
      'errors.generic': 'Algo salió mal',
    }
    return translations[key] || key
  })

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useRouter as any).mockReturnValue({
      push: mockPush,
      refresh: mockRefresh,
    })
    ;(useTranslations as any).mockReturnValue(mockT)
  })

  it('renders sign-in form with all fields', () => {
    render(<SignInPage />)

    expect(screen.getByText('Gestión de Proyectos Ejecutiva')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Iniciar Sesión' })).toBeInTheDocument()
    expect(screen.getByLabelText('Correo Electrónico')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Iniciar Sesión' })).toBeInTheDocument()
  })

  it('validates email format', async () => {
    render(<SignInPage />)

    const emailInput = screen.getByLabelText('Correo Electrónico')
    const passwordInput = screen.getByLabelText('Contraseña')
    const form = emailInput.closest('form')!

    fireEvent.change(emailInput, { target: { value: 'invalid-email' } })
    fireEvent.change(passwordInput, { target: { value: 'password' } })
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Invalid email format')).toBeInTheDocument()
    })

    expect(signIn).not.toHaveBeenCalled()
  })

  it('validates password is required', async () => {
    render(<SignInPage />)

    const emailInput = screen.getByLabelText('Correo Electrónico')
    const form = emailInput.closest('form')!

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Password is required')).toBeInTheDocument()
    })

    expect(signIn).not.toHaveBeenCalled()
  })

  it('submits form with valid credentials', async () => {
    ;(signIn as any).mockResolvedValue({ ok: true, error: null })

    render(<SignInPage />)

    const emailInput = screen.getByLabelText('Correo Electrónico')
    const passwordInput = screen.getByLabelText('Contraseña')
    const submitButton = screen.getByRole('button', { name: 'Iniciar Sesión' })

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('credentials', {
        email: 'user@example.com',
        password: 'password123',
        redirect: false,
      })
    })

    expect(mockPush).toHaveBeenCalledWith('/dashboard')
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('displays error message for invalid credentials', async () => {
    ;(signIn as any).mockResolvedValue({ ok: false, error: 'CredentialsSignin' })

    render(<SignInPage />)

    const emailInput = screen.getByLabelText('Correo Electrónico')
    const passwordInput = screen.getByLabelText('Contraseña')
    const submitButton = screen.getByRole('button', { name: 'Iniciar Sesión' })

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('Credenciales inválidas')).toBeInTheDocument()
    })

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows loading state during submission', async () => {
    ;(signIn as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 100))
    )

    render(<SignInPage />)

    const emailInput = screen.getByLabelText('Correo Electrónico')
    const passwordInput = screen.getByLabelText('Contraseña')
    const submitButton = screen.getByRole('button', { name: 'Iniciar Sesión' })

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    expect(screen.getByRole('button', { name: 'Cargando...' })).toBeInTheDocument()
    expect(submitButton).toBeDisabled()

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('clears field errors when user starts typing', async () => {
    render(<SignInPage />)

    const emailInput = screen.getByLabelText('Correo Electrónico')
    const form = emailInput.closest('form')!

    // Trigger validation error
    fireEvent.change(emailInput, { target: { value: 'invalid' } })
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Invalid email format')).toBeInTheDocument()
    })

    // Start typing to clear error
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })

    await waitFor(() => {
      expect(screen.queryByText('Invalid email format')).not.toBeInTheDocument()
    })
  })

  it('disables form inputs during submission', async () => {
    ;(signIn as any).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 100))
    )

    render(<SignInPage />)

    const emailInput = screen.getByLabelText('Correo Electrónico')
    const passwordInput = screen.getByLabelText('Contraseña')
    const submitButton = screen.getByRole('button', { name: 'Iniciar Sesión' })

    fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    expect(emailInput).toBeDisabled()
    expect(passwordInput).toBeDisabled()
    expect(submitButton).toBeDisabled()

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })
})

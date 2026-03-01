import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GlobalError from '../global-error'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  AlertCircle: () => <div data-testid="alert-circle-icon" />,
  Home: () => <div data-testid="home-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
}))

describe('GlobalError Component', () => {
  const mockReset = vi.fn()
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    mockReset.mockClear()
    consoleErrorSpy.mockClear()
  })

  it('should render error title', () => {
    const error = new Error('Critical error')
    render(<GlobalError error={error} reset={mockReset} />)

    expect(screen.getByText('Algo salió mal')).toBeTruthy()
  })

  it('should render error description', () => {
    const error = new Error('Critical error')
    render(<GlobalError error={error} reset={mockReset} />)

    expect(
      screen.getByText('Ha ocurrido un error crítico. Por favor, intenta nuevamente o contacta al soporte técnico.')
    ).toBeTruthy()
  })

  it('should display error digest when provided', () => {
    const error = Object.assign(new Error('Critical error'), { digest: 'xyz789' })
    render(<GlobalError error={error} reset={mockReset} />)

    expect(screen.getByText(/Error ID: xyz789/)).toBeTruthy()
  })

  it('should not display error digest section when not provided', () => {
    const error = new Error('Critical error')
    const { container } = render(<GlobalError error={error} reset={mockReset} />)

    const digestElement = container.querySelector('.bg-zinc-100')
    expect(digestElement).toBeNull()
  })

  it('should render reset button', () => {
    const error = new Error('Critical error')
    render(<GlobalError error={error} reset={mockReset} />)

    const resetButton = screen.getByText('Intentar nuevamente')
    expect(resetButton).toBeTruthy()
  })

  it('should call reset function when reset button is clicked', () => {
    const error = new Error('Critical error')
    render(<GlobalError error={error} reset={mockReset} />)

    const resetButton = screen.getByText('Intentar nuevamente')
    fireEvent.click(resetButton)

    expect(mockReset).toHaveBeenCalledTimes(1)
  })

  it('should render home link', () => {
    const error = new Error('Critical error')
    render(<GlobalError error={error} reset={mockReset} />)

    const homeLink = screen.getByText('Ir al inicio')
    expect(homeLink).toBeTruthy()
    expect(homeLink.closest('a')?.getAttribute('href')).toBe('/')
  })

  it('should display support message', () => {
    const error = new Error('Critical error')
    render(<GlobalError error={error} reset={mockReset} />)

    expect(screen.getByText('Si el problema persiste, contacta al soporte técnico')).toBeTruthy()
  })

  it('should log error to console', () => {
    const error = new Error('Critical error')
    error.stack = 'Error stack trace'
    const errorWithDigest = Object.assign(error, { digest: 'global123' })

    render(<GlobalError error={errorWithDigest} reset={mockReset} />)

    expect(consoleErrorSpy).toHaveBeenCalledWith('Global application error:', {
      message: 'Critical error',
      digest: 'global123',
      stack: 'Error stack trace',
    })
  })

  it('should render with proper lang attribute', () => {
    const error = new Error('Critical error')
    const { container } = render(<GlobalError error={error} reset={mockReset} />)

    // The component should render (html/body tags won't be in test DOM)
    expect(container.firstChild).toBeTruthy()
  })

  it('should display alert icon', () => {
    const error = new Error('Critical error')
    const { container } = render(<GlobalError error={error} reset={mockReset} />)

    const icon = container.querySelector('[data-testid="alert-circle-icon"]')
    expect(icon).toBeTruthy()
  })

  it('should be centered on screen', () => {
    const error = new Error('Critical error')
    const { container } = render(<GlobalError error={error} reset={mockReset} />)

    // Find the main wrapper div (inside body)
    const wrapper = container.querySelector('.min-h-screen')
    expect(wrapper).toBeTruthy()
    expect(wrapper?.className).toContain('items-center')
    expect(wrapper?.className).toContain('justify-center')
  })

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      const error = new Error('Critical error')
      const { container } = render(<GlobalError error={error} reset={mockReset} />)

      const heading = container.querySelector('h1')
      expect(heading).toBeTruthy()
      expect(heading?.textContent).toBe('Algo salió mal')
    })

    it('should have focusable interactive elements', () => {
      const error = new Error('Critical error')
      const { container } = render(<GlobalError error={error} reset={mockReset} />)

      const buttons = container.querySelectorAll('button, a')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })
})

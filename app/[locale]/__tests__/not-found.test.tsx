import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import NotFound from '../not-found'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      notFound: 'Página no encontrada',
      notFoundDescription: 'La página que buscas no existe o ha sido movida.',
      goHome: 'Ir al inicio',
    }
    return translations[key] || key
  },
}))

// Mock @/i18n/navigation
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  FileQuestion: () => <div data-testid="file-question-icon" />,
  Home: () => <div data-testid="home-icon" />,
}))

describe('NotFound Component', () => {
  it('should render 404 title', () => {
    render(<NotFound />)
    
    expect(screen.getByText('Página no encontrada')).toBeTruthy()
  })

  it('should render 404 description', () => {
    render(<NotFound />)
    
    expect(screen.getByText('La página que buscas no existe o ha sido movida.')).toBeTruthy()
  })

  it('should render home link', () => {
    render(<NotFound />)
    
    const homeLink = screen.getByText('Ir al inicio')
    expect(homeLink).toBeTruthy()
    expect(homeLink.closest('a')?.getAttribute('href')).toBe('/dashboard')
  })

  it('should display file question icon', () => {
    const { container } = render(<NotFound />)
    
    const icon = container.querySelector('[data-testid="file-question-icon"]')
    expect(icon).toBeTruthy()
  })

  it('should be centered on screen', () => {
    const { container } = render(<NotFound />)
    
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('min-h-screen')
    expect(wrapper.className).toContain('items-center')
    expect(wrapper.className).toContain('justify-center')
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Loading from '../loading'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      loading: 'Cargando...',
    }
    return translations[key] || key
  },
}))

describe('Loading Component', () => {
  it('should render loading spinner', () => {
    const { container } = render(<Loading />)
    
    // Check for spinner element
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeTruthy()
  })

  it('should display loading text', () => {
    render(<Loading />)
    
    const loadingText = screen.getByText('Cargando...')
    expect(loadingText).toBeTruthy()
  })

  it('should have proper accessibility attributes', () => {
    render(<Loading />)
    
    const statusElement = screen.getByRole('status')
    expect(statusElement).toBeTruthy()
    expect(statusElement.getAttribute('aria-live')).toBe('polite')
  })

  it('should be centered on screen', () => {
    const { container } = render(<Loading />)
    
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain('min-h-screen')
    expect(wrapper.className).toContain('items-center')
    expect(wrapper.className).toContain('justify-center')
  })
})

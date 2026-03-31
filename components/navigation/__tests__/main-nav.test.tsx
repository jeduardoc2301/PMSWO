import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MainNav } from '../main-nav'
import { UserRole, Locale } from '@/types'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'common.appName': 'Project Management',
      'nav.dashboard': 'Dashboard',
      'nav.projects': 'Projects',
      'nav.workItems': 'Work Items',
      'nav.blockers': 'Blockers',
      'nav.risks': 'Risks',
      'nav.agreements': 'Agreements',
      'nav.settings': 'Settings',
      'nav.signOut': 'Sign Out',
      'templates.title': 'Templates',
    }
    return translations[key] || key
  },
  useLocale: () => 'es',
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/es/dashboard',
}))

describe('MainNav', () => {
  const mockOnSignOut = vi.fn()
  const mockOnLocaleChange = vi.fn()

  const defaultProps = {
    user: {
      name: 'John Doe',
      email: 'john@example.com',
      roles: [UserRole.PROJECT_MANAGER],
    },
    onSignOut: mockOnSignOut,
    onLocaleChange: mockOnLocaleChange,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the navigation component', () => {
    render(<MainNav {...defaultProps} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
  })

  it('displays user name and email', () => {
    render(<MainNav {...defaultProps} />)
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('john@example.com')).toBeInTheDocument()
  })

  it('shows navigation items based on user permissions', () => {
    render(<MainNav {...defaultProps} />)
    
    // PROJECT_MANAGER should see these items
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Templates')).toBeInTheDocument()
    
    // PROJECT_MANAGER should NOT see Settings (requires ORG_MANAGE)
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })

  it('shows settings for ADMIN users', () => {
    const adminProps = {
      ...defaultProps,
      user: {
        ...defaultProps.user,
        roles: [UserRole.ADMIN],
      },
    }
    
    render(<MainNav {...adminProps} />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Templates')).toBeInTheDocument()
  })

  it('shows Templates menu for ADMIN and PROJECT_MANAGER roles', () => {
    // Test PROJECT_MANAGER
    const pmProps = {
      ...defaultProps,
      user: {
        ...defaultProps.user,
        roles: [UserRole.PROJECT_MANAGER],
      },
    }
    
    const { rerender } = render(<MainNav {...pmProps} />)
    expect(screen.getByText('Templates')).toBeInTheDocument()
    
    // Test ADMIN
    const adminProps = {
      ...defaultProps,
      user: {
        ...defaultProps.user,
        roles: [UserRole.ADMIN],
      },
    }
    
    rerender(<MainNav {...adminProps} />)
    expect(screen.getByText('Templates')).toBeInTheDocument()
  })

  it('hides Templates menu for non-ADMIN and non-PROJECT_MANAGER roles', () => {
    const consultantProps = {
      ...defaultProps,
      user: {
        ...defaultProps.user,
        roles: [UserRole.EXTERNAL_CONSULTANT],
      },
    }
    
    render(<MainNav {...consultantProps} />)
    expect(screen.queryByText('Templates')).not.toBeInTheDocument()
  })

  it('hides restricted items for EXTERNAL_CONSULTANT', () => {
    const consultantProps = {
      ...defaultProps,
      user: {
        ...defaultProps.user,
        roles: [UserRole.EXTERNAL_CONSULTANT],
      },
    }
    
    render(<MainNav {...consultantProps} />)
    
    // EXTERNAL_CONSULTANT should see limited items
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
    
    // Should NOT see Settings
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })

  it('displays current locale', () => {
    render(<MainNav {...defaultProps} />)
    expect(screen.getByText(/Español/)).toBeInTheDocument()
  })

  it('calls onLocaleChange when locale switcher is clicked', () => {
    render(<MainNav {...defaultProps} />)
    
    const localeSwitcher = screen.getByText(/Español/).closest('button')
    expect(localeSwitcher).toBeInTheDocument()
    
    if (localeSwitcher) {
      fireEvent.click(localeSwitcher)
      expect(mockOnLocaleChange).toHaveBeenCalledWith(Locale.PT)
    }
  })

  it('opens profile dropdown when clicked', () => {
    render(<MainNav {...defaultProps} />)
    
    const profileButton = screen.getByText('John Doe').closest('button')
    expect(profileButton).toBeInTheDocument()
    
    if (profileButton) {
      fireEvent.click(profileButton)
      expect(screen.getByText('Sign Out')).toBeInTheDocument()
    }
  })

  it('calls onSignOut when sign out button is clicked', () => {
    render(<MainNav {...defaultProps} />)
    
    // Open profile dropdown
    const profileButton = screen.getByText('John Doe').closest('button')
    if (profileButton) {
      fireEvent.click(profileButton)
    }
    
    // Click sign out
    const signOutButton = screen.getByText('Sign Out')
    fireEvent.click(signOutButton)
    
    expect(mockOnSignOut).toHaveBeenCalledTimes(1)
  })

  it('displays user roles in profile dropdown', () => {
    render(<MainNav {...defaultProps} />)
    
    // Open profile dropdown
    const profileButton = screen.getByText('John Doe').closest('button')
    if (profileButton) {
      fireEvent.click(profileButton)
    }
    
    expect(screen.getByText(/PROJECT MANAGER/)).toBeInTheDocument()
  })

  it('toggles sidebar on mobile menu button click', () => {
    render(<MainNav {...defaultProps} />)
    
    const menuButton = screen.getByLabelText('Toggle menu')
    expect(menuButton).toBeInTheDocument()
    
    // The sidebar should be open by default
    const sidebar = screen.getByRole('complementary', { hidden: true })
    expect(sidebar).toHaveClass('translate-x-0')
    
    // Click to close
    fireEvent.click(menuButton)
    expect(sidebar).toHaveClass('-translate-x-full')
    
    // Click to open again
    fireEvent.click(menuButton)
    expect(sidebar).toHaveClass('translate-x-0')
  })

  it('renders user initial in avatar', () => {
    render(<MainNav {...defaultProps} />)
    expect(screen.getByText('J')).toBeInTheDocument()
  })

  it('shows multiple roles for users with multiple roles', () => {
    const multiRoleProps = {
      ...defaultProps,
      user: {
        ...defaultProps.user,
        roles: [UserRole.ADMIN, UserRole.PROJECT_MANAGER],
      },
    }
    
    render(<MainNav {...multiRoleProps} />)
    
    // Open profile dropdown
    const profileButton = screen.getByText('John Doe').closest('button')
    if (profileButton) {
      fireEvent.click(profileButton)
    }
    
    const rolesText = screen.getByText(/ADMIN.*PROJECT MANAGER/)
    expect(rolesText).toBeInTheDocument()
  })
})

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
      'nav.plegarBarra': 'Ocultar el menú',
      'nav.desplegarBarra': 'Mostrar el menú',
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

  /**
   * El tablero dejó de estar en el menú de todos: pide `DASHBOARD_EXECUTIVE`, que solo tienen el rol
   * ejecutivo y el de administración. La página y la interfaz de programación exigen lo mismo, así
   * que la restricción es coherente de punta a punta — a un gerente de proyecto ya no se le ofrece
   * una entrada que lo iba a rebotar.
   */
  it('renders the navigation component', () => {
    render(<MainNav {...defaultProps} />)
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    expect(screen.getByText('Projects')).toBeInTheDocument()
  })

  it('shows the dashboard only to roles that can open it', () => {
    render(<MainNav {...defaultProps} user={{ ...defaultProps.user, roles: [UserRole.ADMIN] }} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('displays user name and email', () => {
    render(<MainNav {...defaultProps} />)
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('john@example.com')).toBeInTheDocument()
  })

  it('shows navigation items based on user permissions', () => {
    render(<MainNav {...defaultProps} />)
    
    // PROJECT_MANAGER should see these items
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
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
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

  /**
   * La barra vuelve a poder esconderse — y esta prueba es la que estaba omitida.
   *
   * Decía: «no es un problema de esta prueba, es una capacidad que se perdió; queda escrita y
   * omitida para que el dato no desaparezca con ella». Aquí vuelve, pero **no con su forma
   * anterior**, y conviene que quede dicho por qué. Aquella esperaba clases `translate-x-0` y
   * `-translate-x-full` sobre el `<aside>` y un `aria-label` en inglés.
   *
   * Hoy el desplazamiento no vive en las clases del elemento sino en `globals.css`, colgando de un
   * `data-barra` estampado en `<html>`. No es un capricho: el ancho de la barra está escrito
   * también en el `ml-64` de cinco layouts de SERVIDOR, y un estado de React dentro de este
   * componente no llega hasta ellos sin convertirlos en cliente. Así que lo que se comprueba es lo
   * que de verdad decide: el atributo.
   */
  describe('plegar y desplegar la barra', () => {
    const estampado = () => document.documentElement.getAttribute('data-barra')

    beforeEach(() => {
      document.documentElement.removeAttribute('data-barra')
    })

    it('ofrece los dos botones, cada uno con su nombre dicho', () => {
      render(<MainNav {...defaultProps} />)

      const plegar = screen.getByTestId('plegar-barra')
      const desplegar = screen.getByTestId('desplegar-barra')

      expect(plegar).toHaveAttribute('aria-label', 'Ocultar el menú')
      expect(desplegar).toHaveAttribute('aria-label', 'Mostrar el menú')
      // Sin `title` no hay pista al pasar el ratón; sin `aria-label` un lector anuncia «botón».
      expect(plegar).toHaveAttribute('title', 'Ocultar el menú')
      expect(desplegar).toHaveAttribute('title', 'Mostrar el menú')
    })

    it('los dos hablan del mismo elemento, y ese elemento existe', () => {
      const { container } = render(<MainNav {...defaultProps} />)

      const barra = container.querySelector('#barra-lateral')
      expect(barra).not.toBeNull()
      expect(barra!.tagName.toLowerCase()).toBe('aside')
      expect(screen.getByTestId('plegar-barra')).toHaveAttribute('aria-controls', 'barra-lateral')
      expect(screen.getByTestId('desplegar-barra')).toHaveAttribute('aria-controls', 'barra-lateral')
    })

    it('plegar estampa el atributo, y desplegar lo devuelve', () => {
      render(<MainNav {...defaultProps} />)

      expect(estampado()).toBeNull()
      fireEvent.click(screen.getByTestId('plegar-barra'))
      expect(estampado()).toBe('plegada')
      fireEvent.click(screen.getByTestId('desplegar-barra'))
      expect(estampado()).toBe('abierta')
    })

    /**
     * El botón de sacarla vive FUERA del `<aside>`, y no es un detalle de maquetación: dentro se
     * iría con él al plegarse y no habría forma de volver.
     */
    it('el botón de mostrar el menú no está dentro del menú', () => {
      const { container } = render(<MainNav {...defaultProps} />)

      const barra = container.querySelector('#barra-lateral')!
      expect(barra.contains(screen.getByTestId('plegar-barra'))).toBe(true)
      expect(barra.contains(screen.getByTestId('desplegar-barra'))).toBe(false)
    })

    /**
     * Cada botón declara un `aria-expanded` fijo porque el CSS esconde el que no toca. Si el valor
     * saliera de un estado de React, durante la hidratación los dos dirían lo mismo y uno mentiría.
     */
    it('cada botón dice el estado que le corresponde', () => {
      render(<MainNav {...defaultProps} />)
      expect(screen.getByTestId('plegar-barra')).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByTestId('desplegar-barra')).toHaveAttribute('aria-expanded', 'false')
    })
  })

  // El avatar muestra dos iniciales, no una: «John Doe» sale como «JD».
  it('renders user initial in avatar', () => {
    render(<MainNav {...defaultProps} />)
    expect(screen.getByText('JD')).toBeInTheDocument()
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

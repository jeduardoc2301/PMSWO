import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { PageHeader, BreadcrumbItem, QuickAction } from '../page-header'
import { Plus } from 'lucide-react'
import { vi } from 'vitest'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/en/dashboard',
}))

const messages = {
  common: {
    appName: 'Project Management',
  },
  header: {
    createProject: 'Create Project',
    createWorkItem: 'Create Work Item',
    home: 'Home',
  },
}

const renderWithIntl = (component: React.ReactElement) => {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>
  )
}

describe('PageHeader', () => {
  describe('Basic Rendering', () => {
    it('should render the page title', () => {
      renderWithIntl(<PageHeader title="Dashboard" />)
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    it('should render the page description when provided', () => {
      renderWithIntl(
        <PageHeader title="Dashboard" description="View your project overview" />
      )
      expect(screen.getByText('View your project overview')).toBeInTheDocument()
    })

    it('should not render description when not provided', () => {
      const { container } = renderWithIntl(<PageHeader title="Dashboard" />)
      const description = container.querySelector('p.text-sm.text-gray-700')
      expect(description).not.toBeInTheDocument()
    })
  })

  describe('Breadcrumb Navigation', () => {
    it('should render breadcrumbs when provided', () => {
      const breadcrumbs: BreadcrumbItem[] = [
        { label: 'Home', href: '/dashboard' },
        { label: 'Projects', href: '/projects' },
        { label: 'Project Details' },
      ]

      renderWithIntl(<PageHeader title="Project Details" breadcrumbs={breadcrumbs} />)

      expect(screen.getByText('Home')).toBeInTheDocument()
      expect(screen.getByText('Projects')).toBeInTheDocument()
      // Use getAllByText since "Project Details" appears in both breadcrumb and title
      const projectDetailsElements = screen.getAllByText('Project Details')
      expect(projectDetailsElements.length).toBeGreaterThan(0)
    })

    it('should render breadcrumb links as clickable', () => {
      const breadcrumbs: BreadcrumbItem[] = [
        { label: 'Home', href: '/dashboard' },
        { label: 'Current Page' },
      ]

      renderWithIntl(<PageHeader title="Current Page" breadcrumbs={breadcrumbs} />)

      const homeLink = screen.getByText('Home').closest('a')
      expect(homeLink).toHaveAttribute('href', '/dashboard')
    })

    it('should render last breadcrumb without link', () => {
      const breadcrumbs: BreadcrumbItem[] = [
        { label: 'Home', href: '/dashboard' },
        { label: 'Current Page' },
      ]

      renderWithIntl(<PageHeader title="Current Page" breadcrumbs={breadcrumbs} />)

      // Get all elements with "Current Page" text
      const currentPageElements = screen.getAllByText('Current Page')
      // Find the one in the breadcrumb (should be a span)
      const breadcrumbElement = currentPageElements.find(el => el.tagName === 'SPAN')
      expect(breadcrumbElement).toBeDefined()
      expect(breadcrumbElement).toHaveClass('font-medium')
    })

    it('should not render breadcrumb navigation when empty', () => {
      const { container } = renderWithIntl(<PageHeader title="Dashboard" />)
      const breadcrumbNav = container.querySelector('nav[aria-label="Breadcrumb"]')
      expect(breadcrumbNav).not.toBeInTheDocument()
    })

    it('should render chevron separators between breadcrumbs', () => {
      const breadcrumbs: BreadcrumbItem[] = [
        { label: 'Home', href: '/dashboard' },
        { label: 'Projects', href: '/projects' },
        { label: 'Details' },
      ]

      const { container } = renderWithIntl(
        <PageHeader title="Details" breadcrumbs={breadcrumbs} />
      )

      // Should have 2 chevrons for 3 breadcrumb items
      const chevrons = container.querySelectorAll('svg')
      expect(chevrons.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Quick Actions', () => {
    it('should render quick action buttons', () => {
      const mockAction = vi.fn()
      const quickActions: QuickAction[] = [
        {
          label: 'Create Project',
          onClick: mockAction,
          variant: 'primary',
        },
      ]

      renderWithIntl(<PageHeader title="Dashboard" quickActions={quickActions} />)

      const button = screen.getByText('Create Project')
      expect(button).toBeInTheDocument()
      expect(button.tagName).toBe('BUTTON')
    })

    it('should call onClick handler when quick action is clicked', () => {
      const mockAction = vi.fn()
      const quickActions: QuickAction[] = [
        {
          label: 'Create Project',
          onClick: mockAction,
        },
      ]

      renderWithIntl(<PageHeader title="Dashboard" quickActions={quickActions} />)

      const button = screen.getByText('Create Project')
      fireEvent.click(button)

      expect(mockAction).toHaveBeenCalledTimes(1)
    })

    it('should render multiple quick actions', () => {
      const mockAction1 = vi.fn()
      const mockAction2 = vi.fn()
      const quickActions: QuickAction[] = [
        { label: 'Create Project', onClick: mockAction1 },
        { label: 'Create Work Item', onClick: mockAction2 },
      ]

      renderWithIntl(<PageHeader title="Dashboard" quickActions={quickActions} />)

      expect(screen.getByText('Create Project')).toBeInTheDocument()
      expect(screen.getByText('Create Work Item')).toBeInTheDocument()
    })

    it('should apply primary variant styling', () => {
      const quickActions: QuickAction[] = [
        {
          label: 'Create Project',
          onClick: vi.fn(),
          variant: 'primary',
        },
      ]

      renderWithIntl(<PageHeader title="Dashboard" quickActions={quickActions} />)

      const button = screen.getByText('Create Project')
      expect(button).toHaveClass('bg-blue-600')
      expect(button).toHaveClass('text-white')
    })

    it('should apply secondary variant styling', () => {
      const quickActions: QuickAction[] = [
        {
          label: 'Cancel',
          onClick: vi.fn(),
          variant: 'secondary',
        },
      ]

      renderWithIntl(<PageHeader title="Dashboard" quickActions={quickActions} />)

      const button = screen.getByText('Cancel')
      expect(button).toHaveClass('bg-white')
      expect(button).toHaveClass('border')
    })

    it('should render icon with quick action', () => {
      const quickActions: QuickAction[] = [
        {
          label: 'Create',
          onClick: vi.fn(),
          icon: <Plus data-testid="plus-icon" />,
        },
      ]

      renderWithIntl(<PageHeader title="Dashboard" quickActions={quickActions} />)

      expect(screen.getByTestId('plus-icon')).toBeInTheDocument()
    })

    it('should not render quick actions section when empty', () => {
      const { container } = renderWithIntl(<PageHeader title="Dashboard" />)
      const actionsContainer = container.querySelector('.flex.items-center.space-x-3')
      expect(actionsContainer).not.toBeInTheDocument()
    })
  })

  describe('Layout and Styling', () => {
    it('should have proper container structure', () => {
      const { container } = renderWithIntl(<PageHeader title="Dashboard" />)
      const header = container.querySelector('.bg-white.border-b')
      expect(header).toBeInTheDocument()
    })

    it('should apply responsive padding classes', () => {
      const { container } = renderWithIntl(<PageHeader title="Dashboard" />)
      const innerContainer = container.querySelector('.px-4.sm\\:px-6.lg\\:px-8')
      expect(innerContainer).toBeInTheDocument()
    })

    it('should truncate long titles', () => {
      renderWithIntl(<PageHeader title="Very Long Title That Should Be Truncated" />)
      const title = screen.getByText('Very Long Title That Should Be Truncated')
      expect(title).toHaveClass('truncate')
    })
  })

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', () => {
      renderWithIntl(<PageHeader title="Dashboard" />)
      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading).toHaveTextContent('Dashboard')
    })

    it('should have aria-label on breadcrumb navigation', () => {
      const breadcrumbs: BreadcrumbItem[] = [
        { label: 'Home', href: '/dashboard' },
        { label: 'Current' },
      ]

      const { container } = renderWithIntl(
        <PageHeader title="Current" breadcrumbs={breadcrumbs} />
      )

      const nav = container.querySelector('nav[aria-label="Breadcrumb"]')
      expect(nav).toBeInTheDocument()
    })

    it('should have focus styles on buttons', () => {
      const quickActions: QuickAction[] = [
        { label: 'Create', onClick: vi.fn() },
      ]

      renderWithIntl(<PageHeader title="Dashboard" quickActions={quickActions} />)

      const button = screen.getByText('Create')
      expect(button).toHaveClass('focus:outline-none')
      expect(button).toHaveClass('focus:ring-2')
    })
  })

  describe('Integration', () => {
    it('should render multiple quick actions', () => {
      const breadcrumbs: BreadcrumbItem[] = [
        { label: 'Home', href: '/dashboard' },
        { label: 'Projects' },
      ]

      const mockAction1 = vi.fn()
      const mockAction2 = vi.fn()
      const quickActions: QuickAction[] = [
        { label: 'Create Project', onClick: mockAction1, variant: 'primary' },
        { label: 'Create Work Item', onClick: mockAction2, variant: 'secondary' },
      ]

      renderWithIntl(
        <PageHeader
          title="Projects"
          description="Manage your projects"
          breadcrumbs={breadcrumbs}
          quickActions={quickActions}
        />
      )

      // Check all elements are present
      expect(screen.getByText('Home')).toBeInTheDocument()
      // Use getAllByText since "Projects" appears in both breadcrumb and title
      const projectsElements = screen.getAllByText('Projects')
      expect(projectsElements.length).toBeGreaterThan(0)
      expect(screen.getByText('Manage your projects')).toBeInTheDocument()
      expect(screen.getByText('Create Project')).toBeInTheDocument()
      expect(screen.getByText('Create Work Item')).toBeInTheDocument()
    })
  })
})

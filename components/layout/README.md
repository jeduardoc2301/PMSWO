# Layout Components

This directory contains layout-related components for the application.

## PageHeader

The `PageHeader` component provides a consistent header for pages with breadcrumb navigation, page title, description, and quick action buttons.

### Features

- **Page Title**: Display the current page title prominently
- **Breadcrumb Navigation**: Show hierarchical navigation path
- **Quick Actions**: Add contextual action buttons (e.g., "Create Project", "Create Work Item")
- **Description**: Optional page description text
- **Responsive Design**: Mobile-friendly with proper spacing
- **Accessibility**: Proper ARIA labels and semantic HTML

### Usage

```tsx
import { PageHeader } from '@/components/layout/page-header'
import { Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export default function ProjectsPage() {
  const router = useRouter()
  const t = useTranslations()

  const breadcrumbs = [
    { label: t('header.home'), href: '/dashboard' },
    { label: t('nav.projects') },
  ]

  const quickActions = [
    {
      label: t('header.createProject'),
      onClick: () => router.push('/projects/new'),
      icon: <Plus className="h-4 w-4" />,
      variant: 'primary' as const,
    },
  ]

  return (
    <div>
      <PageHeader
        title={t('nav.projects')}
        description="Manage your projects and track progress"
        breadcrumbs={breadcrumbs}
        quickActions={quickActions}
      />
      {/* Page content */}
    </div>
  )
}
```

### Props

#### `PageHeaderProps`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `title` | `string` | Yes | The main page title |
| `breadcrumbs` | `BreadcrumbItem[]` | No | Array of breadcrumb items |
| `quickActions` | `QuickAction[]` | No | Array of quick action buttons |
| `description` | `string` | No | Optional page description |

#### `BreadcrumbItem`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `label` | `string` | Yes | The breadcrumb text |
| `href` | `string` | No | Link URL (omit for current page) |

#### `QuickAction`

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `label` | `string` | Yes | Button text |
| `onClick` | `() => void` | Yes | Click handler function |
| `icon` | `React.ReactNode` | No | Optional icon element |
| `variant` | `'primary' \| 'secondary'` | No | Button style variant (default: secondary) |

### Examples

#### Simple Header

```tsx
<PageHeader title="Dashboard" />
```

#### With Breadcrumbs

```tsx
<PageHeader
  title="Project Details"
  breadcrumbs={[
    { label: 'Home', href: '/dashboard' },
    { label: 'Projects', href: '/projects' },
    { label: 'Project Details' },
  ]}
/>
```

#### With Quick Actions

```tsx
<PageHeader
  title="Projects"
  quickActions={[
    {
      label: 'Create Project',
      onClick: handleCreateProject,
      variant: 'primary',
    },
    {
      label: 'Import',
      onClick: handleImport,
      variant: 'secondary',
    },
  ]}
/>
```

#### Complete Example

```tsx
<PageHeader
  title="Work Items"
  description="Track and manage work items across all projects"
  breadcrumbs={[
    { label: 'Home', href: '/dashboard' },
    { label: 'Work Items' },
  ]}
  quickActions={[
    {
      label: 'Create Work Item',
      onClick: () => setShowCreateDialog(true),
      icon: <Plus className="h-4 w-4" />,
      variant: 'primary',
    },
    {
      label: 'Filter',
      onClick: () => setShowFilters(true),
      variant: 'secondary',
    },
  ]}
/>
```

### Styling

The component uses Tailwind CSS classes and follows the application's design system:

- Primary buttons: Blue background (`bg-blue-600`)
- Secondary buttons: White background with border
- Responsive padding: `px-4 sm:px-6 lg:px-8`
- Proper focus states for accessibility

### Accessibility

- Uses semantic HTML (`<nav>`, `<h1>`, `<button>`)
- Breadcrumb navigation has `aria-label="Breadcrumb"`
- Buttons have proper focus states
- Title uses `<h1>` for proper heading hierarchy

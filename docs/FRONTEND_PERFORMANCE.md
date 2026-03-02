# Frontend Performance Optimization

Esta guía documenta las estrategias de optimización de performance implementadas en la aplicación Next.js 15.

## Tabla de Contenidos

1. [Code Splitting](#code-splitting)
2. [Optimización de Imágenes](#optimización-de-imágenes)
3. [Lazy Loading de Componentes](#lazy-loading-de-componentes)
4. [React Query para Data Fetching](#react-query-para-data-fetching)
5. [Mejores Prácticas](#mejores-prácticas)
6. [Métricas y Monitoreo](#métricas-y-monitoreo)

---

## Code Splitting

### Code Splitting Automático

Next.js 15 con App Router implementa **code splitting automático** por defecto:

- **Cada ruta** (`app/[locale]/dashboard/page.tsx`, `app/[locale]/projects/page.tsx`, etc.) se divide en un bundle separado
- Los componentes se cargan solo cuando el usuario navega a esa ruta
- Esto reduce el tamaño del bundle inicial y mejora el tiempo de carga

**No se requiere configuración adicional** - Next.js maneja esto automáticamente.

### Code Splitting Manual con Dynamic Imports

Para componentes pesados que no necesitan cargarse inmediatamente, usa `next/dynamic`:

```typescript
import dynamic from 'next/dynamic'

// Componente con loading state
const HeavyComponent = dynamic(
  () => import('@/components/heavy-component'),
  {
    loading: () => <div>Cargando...</div>,
    ssr: false // Deshabilitar SSR si no es necesario
  }
)

// Componente con named export
const AIReportDialog = dynamic(
  () => import('@/components/ai/ai-report-dialog').then(mod => ({ 
    default: mod.AIReportDialog 
  })),
  {
    loading: () => <div className="animate-pulse">Cargando diálogo...</div>,
    ssr: false
  }
)
```

### Cuándo Usar Dynamic Imports

✅ **Usar para:**
- Diálogos y modales (AIReportDialog, AIAnalysisDialog, ExportProjectDialog)
- Componentes de tabs que no se muestran inicialmente (BlockersTab, RisksTab, AgreementsTab)
- Componentes con dependencias pesadas (gráficos, editores de texto)
- Componentes que solo se usan en ciertas condiciones

❌ **No usar para:**
- Componentes críticos above-the-fold
- Componentes pequeños (< 10KB)
- Componentes que siempre se renderizan

---

## Optimización de Imágenes

### Configuración de Next.js Image

La aplicación está configurada en `next.config.ts` para optimizar imágenes automáticamente:

```typescript
images: {
  formats: ['image/avif', 'image/webp'],
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  remotePatterns: [
    // Agregar dominios externos aquí
  ],
}
```

### Uso del Componente Image

**Siempre usa** `next/image` en lugar de `<img>`:

```typescript
import Image from 'next/image'

// Imagen local
<Image
  src="/logo.png"
  alt="Logo"
  width={200}
  height={100}
  priority // Para imágenes above-the-fold
/>

// Imagen remota
<Image
  src="https://example.com/image.jpg"
  alt="Descripción"
  width={800}
  height={600}
  loading="lazy" // Lazy loading automático
/>

// Imagen responsive
<Image
  src="/hero.jpg"
  alt="Hero"
  fill
  className="object-cover"
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>
```

### Beneficios

- **Formatos modernos**: Convierte automáticamente a AVIF/WebP
- **Lazy loading**: Carga imágenes solo cuando están en viewport
- **Responsive**: Sirve tamaños apropiados según el dispositivo
- **Optimización automática**: Comprime y optimiza en build time

### Agregar Dominios Externos

Si usas imágenes de S3, CDN u otros servicios, agrégalos a `remotePatterns`:

```typescript
remotePatterns: [
  {
    protocol: 'https',
    hostname: '**.amazonaws.com',
  },
  {
    protocol: 'https',
    hostname: 'cdn.example.com',
  },
],
```

---

## Lazy Loading de Componentes

### Componentes Identificados para Lazy Loading

Los siguientes componentes son candidatos ideales para lazy loading:

#### 1. Diálogos de IA

```typescript
// components/ai/lazy-dialogs.ts
import dynamic from 'next/dynamic'

export const AIReportDialog = dynamic(
  () => import('./ai-report-dialog').then(mod => ({ default: mod.AIReportDialog })),
  {
    loading: () => <div className="flex items-center justify-center p-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>,
    ssr: false
  }
)

export const AIAnalysisDialog = dynamic(
  () => import('./ai-analysis-dialog').then(mod => ({ default: mod.AIAnalysisDialog })),
  {
    loading: () => <div className="flex items-center justify-center p-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>,
    ssr: false
  }
)
```

#### 2. Diálogo de Exportación

```typescript
// components/projects/lazy-export.ts
import dynamic from 'next/dynamic'

export const ExportProjectDialog = dynamic(
  () => import('./export-project-dialog').then(mod => ({ default: mod.ExportProjectDialog })),
  {
    loading: () => <div>Cargando exportación...</div>,
    ssr: false
  }
)
```

#### 3. Tabs de Proyecto

```typescript
// components/projects/lazy-tabs.ts
import dynamic from 'next/dynamic'

export const BlockersTab = dynamic(
  () => import('./blockers-tab').then(mod => ({ default: mod.BlockersTab })),
  {
    loading: () => <div className="p-4">Cargando blockers...</div>
  }
)

export const RisksTab = dynamic(
  () => import('./risks-tab').then(mod => ({ default: mod.RisksTab })),
  {
    loading: () => <div className="p-4">Cargando riesgos...</div>
  }
)

export const AgreementsTab = dynamic(
  () => import('./agreements-tab').then(mod => ({ default: mod.AgreementsTab })),
  {
    loading: () => <div className="p-4">Cargando acuerdos...</div>
  }
)
```

### Patrón de Uso

```typescript
// En lugar de importar directamente:
// import { AIReportDialog } from '@/components/ai/ai-report-dialog'

// Importar desde el archivo lazy:
import { AIReportDialog } from '@/components/ai/lazy-dialogs'

// Usar normalmente
<AIReportDialog projectId={projectId} />
```

### Beneficios del Lazy Loading

- **Reduce bundle inicial**: Los componentes se cargan solo cuando se necesitan
- **Mejora Time to Interactive (TTI)**: Menos JavaScript para parsear inicialmente
- **Mejor experiencia móvil**: Menos datos descargados en conexiones lentas

---

## React Query para Data Fetching

### Configuración

React Query ya está configurado en la aplicación. Verifica que el `QueryClientProvider` esté en el layout principal:

```typescript
// app/[locale]/layout.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minuto
      cacheTime: 5 * 60 * 1000, // 5 minutos
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

export default function RootLayout({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
```

### Uso de React Query

#### Fetching de Datos

```typescript
import { useQuery } from '@tanstack/react-query'

function ProjectList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/v1/projects')
      if (!res.ok) throw new Error('Failed to fetch')
      return res.json()
    },
    staleTime: 2 * 60 * 1000, // 2 minutos
  })

  if (isLoading) return <div>Cargando...</div>
  if (error) return <div>Error: {error.message}</div>

  return <div>{/* Renderizar proyectos */}</div>
}
```

#### Mutations

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'

function CreateProjectForm() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (newProject) => {
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject),
      })
      if (!res.ok) throw new Error('Failed to create')
      return res.json()
    },
    onSuccess: () => {
      // Invalidar y refetch
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      mutation.mutate({ name: 'Nuevo Proyecto' })
    }}>
      {/* Form fields */}
    </form>
  )
}
```

### Configuración de Cache

#### staleTime vs cacheTime

- **staleTime**: Tiempo que los datos se consideran "frescos" (no se refetch automáticamente)
- **cacheTime**: Tiempo que los datos permanecen en caché después de no usarse

```typescript
// Datos que cambian frecuentemente (dashboard)
staleTime: 30 * 1000, // 30 segundos
cacheTime: 2 * 60 * 1000, // 2 minutos

// Datos que cambian ocasionalmente (proyectos)
staleTime: 2 * 60 * 1000, // 2 minutos
cacheTime: 10 * 60 * 1000, // 10 minutos

// Datos estáticos (configuración)
staleTime: Infinity,
cacheTime: Infinity,
```

### Invalidación de Queries

```typescript
// Invalidar una query específica
queryClient.invalidateQueries({ queryKey: ['projects'] })

// Invalidar queries relacionadas
queryClient.invalidateQueries({ queryKey: ['projects', projectId] })

// Invalidar múltiples queries
queryClient.invalidateQueries({ 
  predicate: (query) => query.queryKey[0] === 'projects' 
})
```

### Prefetching

```typescript
// Prefetch en hover
<Link
  href="/projects/123"
  onMouseEnter={() => {
    queryClient.prefetchQuery({
      queryKey: ['project', '123'],
      queryFn: () => fetchProject('123'),
    })
  }}
>
  Ver Proyecto
</Link>
```

---

## Mejores Prácticas

### 1. Optimización de Bundles

```typescript
// ✅ Importar solo lo necesario
import { Button } from '@/components/ui/button'

// ❌ Evitar importar todo
import * as UI from '@/components/ui'
```

### 2. Memoización

```typescript
import { memo, useMemo, useCallback } from 'react'

// Memoizar componentes pesados
const HeavyComponent = memo(function HeavyComponent({ data }) {
  return <div>{/* Renderizado pesado */}</div>
})

// Memoizar cálculos costosos
const expensiveValue = useMemo(() => {
  return data.reduce((acc, item) => acc + item.value, 0)
}, [data])

// Memoizar callbacks
const handleClick = useCallback(() => {
  console.log('Clicked')
}, [])
```

### 3. Virtualización de Listas

Para listas largas (>100 items), usa virtualización:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual'

function VirtualList({ items }) {
  const parentRef = useRef(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
  })

  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {items[virtualItem.index]}
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 4. Debouncing de Inputs

```typescript
import { useDebouncedCallback } from 'use-debounce'

function SearchInput() {
  const debouncedSearch = useDebouncedCallback(
    (value) => {
      // Realizar búsqueda
      fetch(`/api/search?q=${value}`)
    },
    300 // 300ms delay
  )

  return (
    <input
      type="text"
      onChange={(e) => debouncedSearch(e.target.value)}
      placeholder="Buscar..."
    />
  )
}
```

### 5. Suspense Boundaries

```typescript
import { Suspense } from 'react'

function Page() {
  return (
    <div>
      <h1>Mi Página</h1>
      <Suspense fallback={<div>Cargando contenido...</div>}>
        <AsyncContent />
      </Suspense>
    </div>
  )
}
```

---

## Métricas y Monitoreo

### Core Web Vitals

Monitorea estas métricas clave:

1. **LCP (Largest Contentful Paint)**: < 2.5s
2. **FID (First Input Delay)**: < 100ms
3. **CLS (Cumulative Layout Shift)**: < 0.1

### Lighthouse

Ejecuta auditorías de Lighthouse regularmente:

```bash
# Instalar Lighthouse CLI
npm install -g lighthouse

# Ejecutar auditoría
lighthouse https://tu-app.com --view
```

### Next.js Analytics

Habilita Next.js Analytics para monitoreo en producción:

```typescript
// next.config.ts
const nextConfig = {
  // ... otras configuraciones
  experimental: {
    webVitalsAttribution: ['CLS', 'LCP'],
  },
}
```

```typescript
// app/[locale]/layout.tsx
import { Analytics } from '@vercel/analytics/react'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

### Custom Performance Monitoring

```typescript
// lib/performance.ts
export function measurePerformance(name: string, fn: () => void) {
  const start = performance.now()
  fn()
  const end = performance.now()
  console.log(`${name} took ${end - start}ms`)
}

// Uso
measurePerformance('Heavy calculation', () => {
  // Código pesado
})
```

### React DevTools Profiler

Usa el Profiler para identificar componentes lentos:

```typescript
import { Profiler } from 'react'

function onRenderCallback(
  id, // el "id" del Profiler que acaba de commitear
  phase, // "mount" o "update"
  actualDuration, // tiempo gastado renderizando
  baseDuration, // tiempo estimado sin memoización
  startTime, // cuando React comenzó a renderizar
  commitTime, // cuando React commiteó
  interactions // Set de interacciones
) {
  console.log(`${id} (${phase}) took ${actualDuration}ms`)
}

<Profiler id="ProjectList" onRender={onRenderCallback}>
  <ProjectList />
</Profiler>
```

---

## Checklist de Performance

Antes de deployment, verifica:

- [ ] Code splitting implementado para rutas pesadas
- [ ] Componentes pesados cargados con lazy loading
- [ ] Imágenes optimizadas con next/image
- [ ] React Query configurado con staleTime apropiado
- [ ] Listas largas virtualizadas
- [ ] Inputs con debouncing
- [ ] Memoización aplicada a componentes costosos
- [ ] Lighthouse score > 90
- [ ] Core Web Vitals en verde
- [ ] Bundle size < 200KB (gzipped)

---

## Recursos Adicionales

- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)
- [React Query Best Practices](https://tanstack.com/query/latest/docs/react/guides/important-defaults)
- [Web.dev Performance](https://web.dev/performance/)
- [Lighthouse Documentation](https://developer.chrome.com/docs/lighthouse/)

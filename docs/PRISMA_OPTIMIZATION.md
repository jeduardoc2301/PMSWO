# Guía de Optimización de Prisma

Esta guía documenta las mejores prácticas para optimizar consultas de base de datos usando Prisma en nuestra aplicación multi-tenant.

## Tabla de Contenidos

1. [Índices de Base de Datos](#índices-de-base-de-datos)
2. [Connection Pooling](#connection-pooling)
3. [Evitar Consultas N+1](#evitar-consultas-n1)
4. [Optimización con `select`](#optimización-con-select)
5. [Patrones de Consultas Comunes](#patrones-de-consultas-comunes)

---

## Índices de Base de Datos

### Índices Implementados

Nuestra aplicación utiliza índices estratégicos para optimizar las consultas más comunes:

#### WorkItem
- **`[organizationId, status, priority]`**: Índice compuesto para filtrado eficiente de work items por organización, estado y prioridad
  - Uso: Dashboard ejecutivo, filtrado de work items
- **`[estimatedEndDate]`**: Índice para consultas de items atrasados
  - Uso: Detección de work items vencidos

#### Blocker
- **`[organizationId, resolvedAt]`**: Índice compuesto para filtrar blockers activos por organización
  - Uso: Obtener blockers sin resolver (resolvedAt IS NULL)

#### Risk
- **`[organizationId, status, riskLevel]`**: Índice compuesto para filtrado de riesgos
  - Uso: Dashboard de riesgos, filtrado por nivel de riesgo

#### Agreement
- **`[status]`**: Índice para filtrado por estado
  - Uso: Filtrar agreements pendientes, completados, etc.

#### AIAnalysisCache
- **`[expiresAt]`**: Índice para limpieza de cache expirado
  - Uso: Jobs de limpieza periódica

### Principios de Indexación

⚠️ **Importante**: No crear demasiados índices, ya que afectan el performance de escritura.

- Los índices compuestos deben seguir el orden de las consultas más comunes
- El primer campo del índice compuesto debe ser el más selectivo
- Para multi-tenancy, `organizationId` suele ser el primer campo

---

## Connection Pooling

### Configuración

El connection pooling está configurado en `lib/prisma.ts` y se controla mediante variables de entorno:

```typescript
// Variables de entorno
DB_CONNECTION_LIMIT=10  // Número máximo de conexiones
DB_POOL_TIMEOUT=20      // Timeout en segundos
```

### Configuraciones Recomendadas

| Entorno    | connection_limit | pool_timeout | Justificación                          |
|------------|------------------|--------------|----------------------------------------|
| Desarrollo | 5                | 10           | Pocos usuarios concurrentes            |
| Staging    | 10               | 20           | Carga moderada para testing            |
| Producción | 20               | 30           | Alta concurrencia, mayor disponibilidad|

### Monitoreo

Para monitorear el uso del pool de conexiones:

```typescript
// En desarrollo, Prisma logea las queries
// Revisar logs para identificar conexiones lentas
```

---

## Evitar Consultas N+1

Las consultas N+1 ocurren cuando se hace una consulta inicial y luego N consultas adicionales para obtener datos relacionados.

### ❌ Mal: Consulta N+1

```typescript
// Esto genera N+1 queries
const projects = await prisma.project.findMany({
  where: { organizationId }
})

// Para cada proyecto, se hace otra query
for (const project of projects) {
  const workItems = await prisma.workItem.findMany({
    where: { projectId: project.id }
  })
}
```

### ✅ Bien: Usar `include`

```typescript
// Una sola query con JOIN
const projects = await prisma.project.findMany({
  where: { organizationId },
  include: {
    workItems: true
  }
})
```

### Patrones de `include` Recomendados

#### Obtener Proyectos con Work Items

```typescript
const projects = await prisma.project.findMany({
  where: { 
    organizationId,
    archived: false 
  },
  include: {
    workItems: {
      where: {
        status: { not: 'DONE' }
      },
      orderBy: {
        priority: 'desc'
      }
    },
    _count: {
      select: {
        blockers: true,
        risks: true
      }
    }
  }
})
```

#### Obtener Work Items con Blockers

```typescript
const workItems = await prisma.workItem.findMany({
  where: {
    organizationId,
    projectId
  },
  include: {
    blockers: {
      where: {
        resolvedAt: null // Solo blockers activos
      }
    },
    owner: {
      select: {
        id: true,
        name: true,
        email: true
      }
    },
    kanbanColumn: true
  }
})
```

#### Obtener Agreements con Work Items y Notas

```typescript
const agreements = await prisma.agreement.findMany({
  where: {
    organizationId,
    projectId
  },
  include: {
    workItems: {
      include: {
        workItem: {
          select: {
            id: true,
            title: true,
            status: true
          }
        }
      }
    },
    notes: {
      include: {
        createdBy: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    },
    createdBy: {
      select: {
        id: true,
        name: true
      }
    }
  },
  orderBy: {
    agreementDate: 'desc'
  }
})
```

---

## Optimización con `select`

Usar `select` para limitar los campos retornados reduce el tamaño de la respuesta y mejora el performance.

### ❌ Mal: Retornar Todos los Campos

```typescript
const users = await prisma.user.findMany({
  where: { organizationId }
})
// Retorna todos los campos, incluyendo passwordHash
```

### ✅ Bien: Seleccionar Solo Campos Necesarios

```typescript
const users = await prisma.user.findMany({
  where: { organizationId },
  select: {
    id: true,
    name: true,
    email: true,
    roles: true,
    active: true
    // NO incluir passwordHash
  }
})
```

### Combinar `select` e `include`

```typescript
const project = await prisma.project.findUnique({
  where: { id: projectId },
  select: {
    id: true,
    name: true,
    status: true,
    workItems: {
      select: {
        id: true,
        title: true,
        status: true,
        priority: true
      },
      where: {
        status: { not: 'DONE' }
      }
    }
  }
})
```

---

## Patrones de Consultas Comunes

### Dashboard Ejecutivo

```typescript
// Obtener métricas agregadas eficientemente
const [
  activeProjects,
  criticalBlockers,
  highRisks,
  overdueWorkItems
] = await Promise.all([
  prisma.project.count({
    where: {
      organizationId,
      archived: false,
      status: 'ACTIVE'
    }
  }),
  prisma.blocker.count({
    where: {
      organizationId,
      severity: 'CRITICAL',
      resolvedAt: null
    }
  }),
  prisma.risk.count({
    where: {
      organizationId,
      riskLevel: { in: ['HIGH', 'CRITICAL'] },
      status: { not: 'CLOSED' }
    }
  }),
  prisma.workItem.count({
    where: {
      organizationId,
      status: { not: 'DONE' },
      estimatedEndDate: {
        lt: new Date()
      }
    }
  })
])
```

### Filtrado con Paginación

```typescript
const pageSize = 20
const page = 1

const [workItems, totalCount] = await Promise.all([
  prisma.workItem.findMany({
    where: {
      organizationId,
      projectId,
      status: filters.status,
      priority: filters.priority
    },
    include: {
      owner: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      priority: 'desc'
    },
    skip: (page - 1) * pageSize,
    take: pageSize
  }),
  prisma.workItem.count({
    where: {
      organizationId,
      projectId,
      status: filters.status,
      priority: filters.priority
    }
  })
])

const totalPages = Math.ceil(totalCount / pageSize)
```

### Búsqueda con Múltiples Condiciones

```typescript
// Búsqueda de work items con filtros opcionales
const workItems = await prisma.workItem.findMany({
  where: {
    organizationId,
    ...(filters.projectId && { projectId: filters.projectId }),
    ...(filters.status && { status: filters.status }),
    ...(filters.priority && { priority: filters.priority }),
    ...(filters.ownerId && { ownerId: filters.ownerId }),
    ...(filters.search && {
      OR: [
        { title: { contains: filters.search } },
        { description: { contains: filters.search } }
      ]
    })
  },
  include: {
    owner: {
      select: { id: true, name: true }
    },
    project: {
      select: { id: true, name: true }
    }
  },
  orderBy: {
    createdAt: 'desc'
  }
})
```

### Transacciones para Operaciones Complejas

```typescript
// Resolver blocker y actualizar work item en una transacción
const result = await prisma.$transaction(async (tx) => {
  // Actualizar blocker
  const blocker = await tx.blocker.update({
    where: { id: blockerId },
    data: {
      resolvedAt: new Date(),
      resolution
    }
  })

  // Actualizar work item asociado
  const workItem = await tx.workItem.update({
    where: { id: blocker.workItemId },
    data: {
      status: 'IN_PROGRESS',
      kanbanColumnId: inProgressColumnId
    }
  })

  return { blocker, workItem }
})
```

---

## Mejores Prácticas Generales

1. **Siempre filtrar por `organizationId`** en consultas multi-tenant
2. **Usar índices compuestos** para consultas con múltiples filtros
3. **Limitar campos con `select`** cuando no se necesitan todos
4. **Usar `include` en lugar de múltiples queries** para evitar N+1
5. **Implementar paginación** para listas grandes
6. **Usar transacciones** para operaciones que deben ser atómicas
7. **Monitorear queries lentas** en desarrollo con logs de Prisma
8. **Cachear resultados** cuando sea apropiado (ej: AIAnalysisCache)

---

## Recursos Adicionales

- [Prisma Performance Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [MySQL Index Optimization](https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html)
- [Connection Pooling in Prisma](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management)

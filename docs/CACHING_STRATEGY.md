# Estrategia de Caching

## Introducción

Este documento describe la estrategia de caching implementada en la plataforma SaaS de Gestión de Proyectos Ejecutiva. El sistema de caching está diseñado para optimizar el rendimiento, reducir la carga en servicios externos (AWS Bedrock), y mejorar la experiencia del usuario.

## Objetivos

- **Reducir latencia**: Respuestas más rápidas al usuario mediante datos cacheados
- **Optimizar costos**: Minimizar llamadas a AWS Bedrock (servicio de IA costoso)
- **Mejorar escalabilidad**: Reducir carga en la base de datos y servicios externos
- **Mantener consistencia**: Invalidación automática cuando los datos cambian

## Cache de Análisis de IA

### Descripción

El sistema cachea los resultados de análisis de proyectos generados por AWS Bedrock (Claude 3). Estos análisis incluyen:

- Sugerencias proactivas (crear blockers, ajustar fechas, reasignar tareas)
- Riesgos detectados automáticamente
- Work items atrasados con acciones sugeridas

### Implementación

**Tabla de base de datos**: `AIAnalysisCache`

```sql
CREATE TABLE ai_analysis_cache (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) UNIQUE NOT NULL,
  analysis_data JSON NOT NULL,
  analyzed_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_expires_at (expires_at)
);
```

**Campos**:
- `project_id`: ID del proyecto (único, un análisis por proyecto)
- `analysis_data`: Datos del análisis en formato JSON
- `analyzed_at`: Timestamp de cuándo se realizó el análisis
- `expires_at`: Timestamp de expiración del cache

**Duración del cache**: 24 horas

**Índices**:
- `project_id`: Índice único para búsqueda rápida
- `expires_at`: Índice para limpieza eficiente de cache expirado

### Flujo de Uso

1. **Cache Hit** (análisis existe y no ha expirado):
   ```typescript
   const cached = await AIService.getCachedAnalysis(projectId)
   if (cached) {
     return cached // Respuesta inmediata, sin llamada a Bedrock
   }
   ```

2. **Cache Miss** (análisis no existe o expiró):
   ```typescript
   // Generar nuevo análisis con Bedrock
   const analysis = await AIService.analyzeProject(projectId)
   // El análisis se cachea automáticamente por 24 horas
   ```

3. **Invalidación manual**:
   ```typescript
   await AIService.invalidateCache(projectId)
   ```

### Beneficios

- **Reducción de costos**: Una llamada a Bedrock cada 24 horas por proyecto (vs. múltiples llamadas por día)
- **Mejor performance**: Respuesta instantánea desde base de datos (< 50ms vs. 2-5 segundos de Bedrock)
- **Rate limiting implícito**: Previene sobrecarga de solicitudes a Bedrock

## Invalidación Automática de Cache

### Eventos que Invalidan el Cache

El cache de análisis de IA debe invalidarse cuando los datos del proyecto cambian significativamente:

#### 1. Work Items
- **Crear work item**: Nuevo trabajo puede afectar análisis de carga y fechas
- **Actualizar work item**: Cambios en estado, prioridad, fechas afectan el análisis
- **Eliminar work item**: Reduce la carga del proyecto

#### 2. Blockers
- **Crear blocker**: Nuevo impedimento requiere re-análisis
- **Resolver blocker**: Cambio significativo en el estado del proyecto

#### 3. Risks
- **Crear risk**: Nuevo riesgo identificado
- **Actualizar risk**: Cambios en probabilidad, impacto, o estado
- **Cerrar risk**: Riesgo mitigado o materializado

#### 4. Agreements
- **Crear agreement**: Nuevo compromiso registrado
- **Completar agreement**: Compromiso cumplido

### Implementación

**Módulo**: `lib/cache/cache-invalidation.ts`

```typescript
import { AIService } from '@/lib/services/ai-service'

/**
 * Invalida el cache de análisis de AI para un proyecto
 * Debe llamarse cuando se modifican datos que afectan el análisis
 */
export async function invalidateProjectCache(projectId: string): Promise<void> {
  try {
    await AIService.invalidateCache(projectId)
  } catch (error) {
    // Log error but don't throw - cache invalidation shouldn't break operations
    console.error(`Failed to invalidate cache for project ${projectId}:`, error)
  }
}
```

### Integración en Servicios

La función `invalidateProjectCache` debe ser llamada desde los servicios correspondientes:

#### WorkItemService

```typescript
// En lib/services/work-item-service.ts

import { invalidateProjectCache } from '@/lib/cache/cache-invalidation'

export class WorkItemService {
  static async createWorkItem(data: CreateWorkItemDTO): Promise<WorkItem> {
    const workItem = await prisma.workItem.create({ ... })
    
    // Invalidar cache del proyecto
    await invalidateProjectCache(workItem.projectId)
    
    return workItem
  }

  static async updateWorkItem(id: string, data: UpdateWorkItemDTO): Promise<WorkItem> {
    const workItem = await prisma.workItem.update({ ... })
    
    // Invalidar cache del proyecto
    await invalidateProjectCache(workItem.projectId)
    
    return workItem
  }

  static async deleteWorkItem(id: string): Promise<void> {
    const workItem = await prisma.workItem.findUnique({ where: { id } })
    await prisma.workItem.delete({ where: { id } })
    
    // Invalidar cache del proyecto
    if (workItem) {
      await invalidateProjectCache(workItem.projectId)
    }
  }
}
```

#### BlockerService

```typescript
// En lib/services/blocker-service.ts

import { invalidateProjectCache } from '@/lib/cache/cache-invalidation'

export class BlockerService {
  static async createBlocker(data: CreateBlockerDTO): Promise<Blocker> {
    const blocker = await prisma.blocker.create({ ... })
    
    // Invalidar cache del proyecto
    await invalidateProjectCache(blocker.projectId)
    
    return blocker
  }

  static async resolveBlocker(id: string, resolution: string): Promise<Blocker> {
    const blocker = await prisma.blocker.update({ ... })
    
    // Invalidar cache del proyecto
    await invalidateProjectCache(blocker.projectId)
    
    return blocker
  }
}
```

#### RiskService

```typescript
// En lib/services/risk-service.ts

import { invalidateProjectCache } from '@/lib/cache/cache-invalidation'

export class RiskService {
  static async createRisk(data: CreateRiskDTO): Promise<Risk> {
    const risk = await prisma.risk.create({ ... })
    
    // Invalidar cache del proyecto
    await invalidateProjectCache(risk.projectId)
    
    return risk
  }

  static async updateRisk(id: string, data: UpdateRiskDTO): Promise<Risk> {
    const risk = await prisma.risk.update({ ... })
    
    // Invalidar cache del proyecto
    await invalidateProjectCache(risk.projectId)
    
    return risk
  }

  static async closeRisk(id: string, notes: string): Promise<Risk> {
    const risk = await prisma.risk.update({ ... })
    
    // Invalidar cache del proyecto
    await invalidateProjectCache(risk.projectId)
    
    return risk
  }
}
```

#### AgreementService

```typescript
// En lib/services/agreement-service.ts

import { invalidateProjectCache } from '@/lib/cache/cache-invalidation'

export class AgreementService {
  static async createAgreement(data: CreateAgreementDTO): Promise<Agreement> {
    const agreement = await prisma.agreement.create({ ... })
    
    // Invalidar cache del proyecto
    await invalidateProjectCache(agreement.projectId)
    
    return agreement
  }

  static async completeAgreement(id: string): Promise<Agreement> {
    const agreement = await prisma.agreement.update({ ... })
    
    // Invalidar cache del proyecto
    await invalidateProjectCache(agreement.projectId)
    
    return agreement
  }
}
```

### Consideraciones de Diseño

1. **No bloquear operaciones**: La invalidación de cache no debe fallar la operación principal
   - Usar try-catch para capturar errores
   - Solo registrar errores, no lanzar excepciones

2. **Invalidación conservadora**: Es mejor invalidar de más que de menos
   - Si hay duda, invalidar el cache
   - El costo de regenerar análisis es menor que servir datos obsoletos

3. **Performance**: La invalidación es una operación rápida (DELETE simple)
   - No afecta significativamente el tiempo de respuesta
   - Índice en `project_id` garantiza eliminación rápida

## Redis para Caching (Opcional - Futuro)

### Descripción

Redis es un sistema de cache en memoria que puede complementar el cache en base de datos. Es especialmente útil para:

- **Sesiones de usuario**: Almacenamiento rápido de sesiones activas
- **Rate limiting**: Control de frecuencia de solicitudes por usuario/IP
- **Cache de queries frecuentes**: Resultados de consultas comunes (ej. lista de proyectos)
- **Pub/Sub**: Notificaciones en tiempo real entre instancias

### Cuándo Implementar Redis

Redis es **opcional** y debe considerarse cuando:

1. **Escala**: Más de 100 usuarios concurrentes
2. **Performance**: Necesidad de respuestas < 100ms para queries comunes
3. **Sesiones**: Múltiples instancias de la aplicación (load balancing)
4. **Real-time**: Necesidad de notificaciones push o actualizaciones en tiempo real

### Configuración de Redis

Si se decide implementar Redis en el futuro:

#### Variables de Entorno

```bash
# .env
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-secure-password
REDIS_TLS_ENABLED=true  # Para producción
```

#### Instalación

```bash
npm install redis ioredis
```

#### Cliente Redis

```typescript
// lib/redis.ts
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL!, {
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS_ENABLED === 'true' ? {} : undefined,
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 50, 2000),
})

export default redis
```

#### Ejemplo de Uso

```typescript
// Cache de lista de proyectos
import redis from '@/lib/redis'

export class ProjectService {
  static async getProjects(orgId: string): Promise<Project[]> {
    // Intentar obtener del cache
    const cacheKey = `projects:${orgId}`
    const cached = await redis.get(cacheKey)
    
    if (cached) {
      return JSON.parse(cached)
    }
    
    // Cache miss - consultar base de datos
    const projects = await prisma.project.findMany({
      where: { organizationId: orgId, archived: false }
    })
    
    // Cachear por 5 minutos
    await redis.setex(cacheKey, 300, JSON.stringify(projects))
    
    return projects
  }
}
```

### Estrategia de Cache con Redis

Si se implementa Redis, usar una estrategia de **dos niveles**:

1. **Nivel 1 - Redis** (cache en memoria):
   - Datos de corta duración (5-15 minutos)
   - Queries frecuentes (listas, dashboards)
   - Sesiones de usuario

2. **Nivel 2 - Base de datos** (cache persistente):
   - Datos de larga duración (24 horas)
   - Análisis de IA (costosos de regenerar)
   - Datos que requieren persistencia

## Mejores Prácticas

### 1. Nombrar Claves de Cache

Usar convención consistente para claves de cache:

```typescript
// Formato: entity:id:attribute
const cacheKey = `project:${projectId}:analysis`
const cacheKey = `user:${userId}:permissions`
const cacheKey = `org:${orgId}:projects`
```

### 2. Establecer TTL Apropiado

Diferentes tipos de datos requieren diferentes duraciones:

- **Análisis de IA**: 24 horas (costoso de regenerar)
- **Listas de proyectos**: 5-15 minutos (cambian frecuentemente)
- **Permisos de usuario**: 1 hora (raramente cambian)
- **Sesiones**: Según configuración de NextAuth (7-30 días)

### 3. Invalidación Proactiva

Invalidar cache inmediatamente cuando los datos cambian:

```typescript
// ✅ CORRECTO: Invalidar después de actualizar
await prisma.project.update({ ... })
await invalidateProjectCache(projectId)

// ❌ INCORRECTO: No invalidar
await prisma.project.update({ ... })
// Cache ahora contiene datos obsoletos
```

### 4. Manejo de Errores

El cache debe ser transparente - los errores no deben afectar la funcionalidad:

```typescript
async function getCachedData(key: string) {
  try {
    return await cache.get(key)
  } catch (error) {
    console.error('Cache error:', error)
    return null // Continuar sin cache
  }
}
```

### 5. Monitoreo

Implementar métricas para monitorear efectividad del cache:

- **Hit rate**: % de solicitudes servidas desde cache
- **Miss rate**: % de solicitudes que requieren regeneración
- **Latency**: Tiempo de respuesta con/sin cache
- **Size**: Tamaño del cache en memoria/disco

### 6. Limpieza de Cache Expirado

Implementar job periódico para limpiar cache expirado:

```typescript
// lib/jobs/cache-cleanup.ts
import prisma from '@/lib/prisma'

export async function cleanupExpiredCache() {
  const deleted = await prisma.aIAnalysisCache.deleteMany({
    where: {
      expiresAt: {
        lt: new Date()
      }
    }
  })
  
  console.log(`Cleaned up ${deleted.count} expired cache entries`)
}

// Ejecutar diariamente con cron job
```

## Resumen

### Estado Actual

✅ **Implementado**:
- Cache de análisis de IA en base de datos (AIAnalysisCache)
- Duración de 24 horas
- Métodos de invalidación manual (getCachedAnalysis, invalidateCache)
- Índice en expiresAt para limpieza eficiente

📋 **Pendiente de integración**:
- Invalidación automática en servicios (WorkItemService, BlockerService, RiskService, AgreementService)
- Job de limpieza de cache expirado

### Futuro (Opcional)

🔮 **Consideraciones futuras**:
- Redis para cache en memoria (cuando escala lo requiera)
- Cache de queries frecuentes (listas, dashboards)
- Rate limiting con Redis
- Pub/Sub para notificaciones en tiempo real

### Métricas de Éxito

- **Reducción de llamadas a Bedrock**: 90%+ (una llamada cada 24h por proyecto)
- **Tiempo de respuesta**: < 100ms para análisis cacheado (vs. 2-5s sin cache)
- **Hit rate objetivo**: > 80% (mayoría de solicitudes servidas desde cache)

---

**Última actualización**: 2024
**Versión**: 1.0

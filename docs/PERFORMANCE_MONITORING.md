# Performance Monitoring

## Introducción

El sistema de monitoreo de performance de la plataforma SaaS de Gestión de Proyectos Ejecutiva rastrea métricas clave de rendimiento y las envía a AWS CloudWatch en producción. Esto permite identificar cuellos de botella, optimizar el rendimiento y configurar alertas proactivas.

## Arquitectura del Sistema

```
┌─────────────────┐
│   API Routes    │
│  (Next.js 15)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Performance    │
│   Middleware    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│  Performance    │─────▶│  CloudWatch  │
│    Monitor      │      │   Metrics    │
└─────────────────┘      └──────────────┘
         ▲
         │
┌────────┴────────┐
│  Prisma Client  │
│   (Middleware)  │
└─────────────────┘
```

## Métricas Disponibles

### 1. API Response Time

**Métrica:** `APIResponseTime`  
**Unidad:** Milliseconds  
**Dimensiones:**
- `Endpoint`: Ruta del endpoint (ej: `/api/v1/projects`)
- `Method`: Método HTTP (GET, POST, PATCH, DELETE)
- `StatusCode`: Código de respuesta HTTP

**Descripción:** Mide el tiempo de respuesta de cada request a la API.

**Umbral de alerta recomendado:** > 2000ms

### 2. API Error Rate

**Métrica:** `APIErrorRate`  
**Unidad:** Count  
**Dimensiones:**
- `Endpoint`: Ruta del endpoint
- `Method`: Método HTTP
- `StatusCode`: Código de error (4xx, 5xx)

**Descripción:** Cuenta el número de errores por endpoint.

**Umbral de alerta recomendado:** > 5% de requests

### 3. Bedrock Call Duration

**Métrica:** `BedrockCallDuration`  
**Unidad:** Milliseconds  
**Dimensiones:**
- `ModelId`: ID del modelo de IA (ej: `anthropic.claude-3-sonnet-20240229-v1:0`)

**Descripción:** Mide el tiempo de respuesta de llamadas a AWS Bedrock.

**Umbral de alerta recomendado:** > 5000ms

### 4. Bedrock Token Usage

**Métricas:** `BedrockInputTokens`, `BedrockOutputTokens`  
**Unidad:** Count  
**Dimensiones:**
- `ModelId`: ID del modelo de IA

**Descripción:** Rastrea el uso de tokens de entrada y salida para estimar costos.

### 5. Bedrock Estimated Cost

**Métrica:** `BedrockEstimatedCost`  
**Unidad:** None (USD)  
**Dimensiones:**
- `ModelId`: ID del modelo de IA

**Descripción:** Estima el costo de cada llamada a Bedrock basado en el uso de tokens.

**Fórmula:**
```
Cost = (InputTokens / 1000) × $0.003 + (OutputTokens / 1000) × $0.015
```

### 6. Cache Hit/Miss Rate

**Métricas:** `CacheHit`, `CacheMiss`  
**Unidad:** Count  
**Dimensiones:**
- `CacheType`: Tipo de caché (ej: `ai-analysis`)

**Descripción:** Rastrea la efectividad del sistema de caché.

**Objetivo:** Cache hit rate > 80%

### 7. Database Query Duration

**Métrica:** `DatabaseQueryDuration`  
**Unidad:** Milliseconds  
**Dimensiones:**
- `Model`: Modelo de Prisma (ej: `Project`, `WorkItem`)
- `Action`: Acción de Prisma (ej: `findMany`, `create`, `update`)

**Descripción:** Mide el tiempo de ejecución de queries a la base de datos.

**Umbral de alerta recomendado:** > 1000ms

## Configuración

### Variables de Entorno

```bash
# CloudWatch Metrics
CLOUDWATCH_NAMESPACE="PMSaaS/Production"
CLOUDWATCH_ENABLED="true"  # false en desarrollo

# AWS Credentials (si no se usan IAM roles)
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"

# CloudWatch Logs (para Winston)
CLOUDWATCH_LOG_GROUP="/aws/ec2/saas-pm-app"
INSTANCE_ID="i-1234567890abcdef0"
```

### Configuración por Entorno

#### Desarrollo
```bash
CLOUDWATCH_ENABLED="false"
NODE_ENV="development"
```

En desarrollo, las métricas se registran en la consola en lugar de enviarse a CloudWatch.

#### Staging/Producción
```bash
CLOUDWATCH_ENABLED="true"
NODE_ENV="production"
CLOUDWATCH_NAMESPACE="PMSaaS/Production"
AWS_REGION="us-east-1"
```

## Uso en el Código

### Tracking de API Response Time

El middleware de performance se aplica automáticamente a todos los endpoints:

```typescript
import { withPerformanceTracking } from '@/lib/middleware/performance-middleware'

export const GET = withPerformanceTracking(async (req: NextRequest) => {
  // Tu lógica de handler
  return NextResponse.json({ data: 'example' })
})
```

Para endpoints con autenticación:

```typescript
import { withAuth } from '@/lib/middleware/auth-middleware'
import { withPerformanceTrackingAuth } from '@/lib/middleware/performance-middleware'
import { Permission } from '@/types'

export const GET = withAuth(
  withPerformanceTrackingAuth(async (req, context, authContext) => {
    // Tu lógica de handler
    return NextResponse.json({ data: 'example' })
  }),
  [Permission.PROJECT_VIEW]
)
```

### Tracking de Bedrock Calls

En el servicio de IA:

```typescript
import { PerformanceMonitor } from '@/lib/monitoring/performance-monitor'

const startTime = Date.now()

const response = await bedrockClient.send(command)

const duration = Date.now() - startTime

await PerformanceMonitor.trackBedrockCall(
  duration,
  modelId,
  inputTokens,
  outputTokens
)
```

### Tracking de Cache Hit/Miss

```typescript
import { PerformanceMonitor } from '@/lib/monitoring/performance-monitor'

const cachedData = await getCachedAnalysis(projectId)

if (cachedData) {
  await PerformanceMonitor.trackCacheHit('ai-analysis', true)
  return cachedData
} else {
  await PerformanceMonitor.trackCacheHit('ai-analysis', false)
  // Generar nuevo análisis
}
```

### Tracking de Database Queries

El middleware de Prisma rastrea automáticamente queries lentas (> 1 segundo). No se requiere código adicional.

## Visualización en AWS Console

### Acceder a CloudWatch Metrics

1. Ir a AWS Console → CloudWatch
2. En el menú lateral, seleccionar **Metrics** → **All metrics**
3. Buscar el namespace: `PMSaaS/Production`
4. Seleccionar las métricas que deseas visualizar

### Crear Dashboard

1. En CloudWatch, ir a **Dashboards** → **Create dashboard**
2. Agregar widgets para cada métrica:
   - **Line graph** para `APIResponseTime` (promedio por endpoint)
   - **Number** para `APIErrorRate` (suma en las últimas 24 horas)
   - **Line graph** para `BedrockCallDuration` (promedio)
   - **Number** para `BedrockEstimatedCost` (suma diaria)
   - **Pie chart** para `CacheHit` vs `CacheMiss`
   - **Line graph** para `DatabaseQueryDuration` (p99)

### Ejemplo de Query en CloudWatch Insights

Para analizar requests lentos:

```sql
fields @timestamp, endpoint, method, duration, statusCode
| filter metricName = "APIResponseTime" and duration > 2000
| sort duration desc
| limit 20
```

Para analizar errores:

```sql
fields @timestamp, endpoint, method, statusCode
| filter metricName = "APIErrorRate"
| stats count() by endpoint, statusCode
| sort count desc
```

## Alertas Recomendadas

### 1. API Response Time Alta

**Condición:** `APIResponseTime` > 2000ms durante 5 minutos consecutivos

**Acción:** Notificar al equipo de desarrollo

**SNS Topic:** `saas-pm-performance-alerts`

### 2. Error Rate Alta

**Condición:** `APIErrorRate` > 5% de total de requests en 10 minutos

**Acción:** Notificar al equipo de operaciones

**SNS Topic:** `saas-pm-critical-alerts`

### 3. Bedrock Cost Spike

**Condición:** `BedrockEstimatedCost` > $10 en 1 hora

**Acción:** Notificar al equipo de finanzas y desarrollo

**SNS Topic:** `saas-pm-cost-alerts`

### 4. Cache Hit Rate Baja

**Condición:** Cache hit rate < 60% durante 30 minutos

**Acción:** Revisar configuración de caché

**SNS Topic:** `saas-pm-performance-alerts`

### 5. Database Query Lenta

**Condición:** `DatabaseQueryDuration` > 1000ms más de 10 veces en 5 minutos

**Acción:** Revisar índices y optimizar queries

**SNS Topic:** `saas-pm-performance-alerts`

### Configurar Alarma en CloudWatch

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "API-Response-Time-High" \
  --alarm-description "Alert when API response time exceeds 2 seconds" \
  --metric-name APIResponseTime \
  --namespace PMSaaS/Production \
  --statistic Average \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 2000 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:saas-pm-performance-alerts
```

## Troubleshooting de Performance

### Problema: API Response Time Alta

**Síntomas:**
- Requests tardan > 2 segundos
- Usuarios reportan lentitud

**Diagnóstico:**
1. Revisar métricas de `APIResponseTime` por endpoint
2. Identificar endpoints más lentos
3. Revisar logs de queries lentas en Prisma
4. Verificar uso de CPU/memoria en EC2

**Soluciones:**
- Optimizar queries de base de datos (agregar índices)
- Implementar paginación en endpoints que retornan muchos datos
- Agregar caché para datos que no cambian frecuentemente
- Escalar horizontalmente (agregar más instancias EC2)

### Problema: Database Queries Lentas

**Síntomas:**
- Logs de Prisma muestran queries > 1 segundo
- Métrica `DatabaseQueryDuration` alta

**Diagnóstico:**
1. Revisar logs de queries lentas
2. Identificar modelos y acciones problemáticas
3. Ejecutar `EXPLAIN` en MySQL para analizar query plan

**Soluciones:**
- Agregar índices compuestos en columnas frecuentemente filtradas
- Optimizar queries con `select` para traer solo campos necesarios
- Usar `include` en lugar de queries separadas
- Implementar paginación con `skip` y `take`

### Problema: Cache Hit Rate Baja

**Síntomas:**
- Métrica `CacheHit` baja comparada con `CacheMiss`
- Llamadas frecuentes a Bedrock

**Diagnóstico:**
1. Revisar configuración de expiración de caché
2. Verificar que el caché se esté invalidando correctamente
3. Analizar patrones de uso

**Soluciones:**
- Aumentar tiempo de expiración de caché (de 24h a 48h)
- Implementar caché en múltiples niveles (Redis + base de datos)
- Pre-cargar caché para proyectos activos

### Problema: Bedrock Cost Spike

**Síntomas:**
- Métrica `BedrockEstimatedCost` aumenta significativamente
- Factura de AWS más alta de lo esperado

**Diagnóstico:**
1. Revisar métricas de `BedrockInputTokens` y `BedrockOutputTokens`
2. Identificar usuarios o proyectos con uso excesivo
3. Verificar rate limiting

**Soluciones:**
- Implementar rate limiting más estricto (reducir de 10 a 5 requests/minuto)
- Optimizar prompts para reducir tokens de entrada
- Aumentar tiempo de caché de análisis de IA
- Implementar cuotas por organización

## Mejores Prácticas

### 1. Monitoreo Proactivo

- Revisar dashboard de CloudWatch diariamente
- Configurar alertas para todas las métricas críticas
- Realizar análisis de tendencias semanalmente

### 2. Optimización Continua

- Identificar y optimizar los endpoints más lentos cada sprint
- Revisar y actualizar índices de base de datos mensualmente
- Analizar patrones de uso de caché y ajustar configuración

### 3. Gestión de Costos

- Monitorear costos de Bedrock diariamente
- Implementar presupuestos y alertas de costo
- Optimizar uso de tokens en prompts de IA

### 4. Documentación

- Documentar cambios de configuración de performance
- Mantener registro de optimizaciones realizadas
- Compartir aprendizajes con el equipo

## Referencias

- [AWS CloudWatch Metrics](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/working_with_metrics.html)
- [AWS Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)
- [Prisma Performance Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)

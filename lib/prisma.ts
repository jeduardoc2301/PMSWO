import { PrismaClient } from '@prisma/client'

/**
 * Configuración de Connection Pooling para MySQL
 * 
 * Variables de entorno recomendadas:
 * - DB_CONNECTION_LIMIT: Número máximo de conexiones en el pool (default: 10)
 * - DB_POOL_TIMEOUT: Tiempo de espera en segundos para obtener una conexión (default: 20)
 * 
 * Configuraciones recomendadas por entorno:
 * - Desarrollo: connection_limit=5, pool_timeout=10
 * - Staging: connection_limit=10, pool_timeout=20
 * - Producción: connection_limit=20, pool_timeout=30
 */
const getConnectionUrl = (): string => {
  const baseUrl = process.env.DATABASE_URL || ''
  const connectionLimit = process.env.DB_CONNECTION_LIMIT || '10'
  const poolTimeout = process.env.DB_POOL_TIMEOUT || '20'
  
  // Agregar parámetros de connection pooling a la URL
  const separator = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${separator}connection_limit=${connectionLimit}&pool_timeout=${poolTimeout}`
}

const prismaClientSingleton = () => {
  const client = new PrismaClient({
    datasources: {
      db: {
        url: getConnectionUrl()
      }
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
  })

  // Middleware para trackear queries lentas
  client.$use(async (params, next) => {
    const startTime = Date.now()
    const result = await next(params)
    const duration = Date.now() - startTime

    // Log queries lentas (> 1 segundo)
    if (duration > 1000) {
      console.warn(`[Prisma] Slow query detected:`, {
        model: params.model,
        action: params.action,
        duration: `${duration}ms`,
      })

      // Track in CloudWatch if available
      if (process.env.CLOUDWATCH_ENABLED === 'true') {
        try {
          const { PerformanceMonitor } = require('@/lib/monitoring/performance-monitor')
          PerformanceMonitor.trackDatabaseQuery(
            params.model || 'unknown',
            params.action,
            duration
          ).catch((error: any) => {
            console.error('Failed to track database query:', error)
          })
        } catch (error) {
          // Ignore if PerformanceMonitor is not available
        }
      }
    }

    return result
  })

  return client
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>
} & typeof global

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma

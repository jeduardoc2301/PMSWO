/**
 * Logging Service with Winston
 * 
 * Provides structured logging with CloudWatch transport for production.
 * Logs errors with context (user, request, stack trace).
 * 
 * Requirements: 17.2
 */

import winston from 'winston'

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
}

// Define colors for each level (for console output)
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
}

winston.addColors(colors)

// Determine log level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development'
  const isDevelopment = env === 'development'
  return isDevelopment ? 'debug' : 'info'
}

// Define format for logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
)

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\n' + info.stack : ''}`
  )
)

// Create transports array
const transports: winston.transport[] = []

// Console transport for development
if (process.env.NODE_ENV === 'development') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  )
}

// CloudWatch transport for production
if (process.env.NODE_ENV === 'production') {
  // Only add CloudWatch if credentials are available
  if (process.env.AWS_REGION && process.env.CLOUDWATCH_LOG_GROUP) {
    try {
      // Dynamic import to avoid issues if winston-cloudwatch is not installed
      const CloudWatchTransport = require('winston-cloudwatch')
      
      const cloudWatchConfig = {
        logGroupName: process.env.CLOUDWATCH_LOG_GROUP || '/aws/ec2/saas-pm-app',
        logStreamName: `${process.env.INSTANCE_ID || 'local'}-${new Date().toISOString().split('T')[0]}`,
        awsRegion: process.env.AWS_REGION,
        messageFormatter: (logObject: any) => {
          // Format message for CloudWatch
          return JSON.stringify({
            timestamp: logObject.timestamp,
            level: logObject.level,
            message: logObject.message,
            ...logObject.meta,
          })
        },
      }

      transports.push(new CloudWatchTransport(cloudWatchConfig))
    } catch (error) {
      // Fallback to console if CloudWatch is not available
      console.warn('CloudWatch transport not available, falling back to console:', error)
      transports.push(
        new winston.transports.Console({
          format: winston.format.simple(),
        })
      )
    }
  } else {
    // Fallback to console in production if CloudWatch is not configured
    console.warn('CloudWatch not configured, using console transport')
    transports.push(
      new winston.transports.Console({
        format: winston.format.simple(),
      })
    )
  }
}

// Create the logger
export const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  defaultMeta: {
    service: 'saas-pm-app',
    environment: process.env.NODE_ENV || 'development',
  },
  transports,
})

/**
 * Log an error with full context
 */
export function logError(
  message: string,
  error: Error,
  context?: {
    userId?: string
    organizationId?: string
    requestId?: string
    path?: string
    method?: string
    [key: string]: any
  }
) {
  logger.error(message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  })
}

/**
 * Log a warning
 */
export function logWarning(message: string, context?: Record<string, any>) {
  logger.warn(message, context)
}

/**
 * Log info
 */
export function logInfo(message: string, context?: Record<string, any>) {
  logger.info(message, context)
}

/**
 * Log HTTP request
 */
export function logHttp(message: string, context?: Record<string, any>) {
  logger.http(message, context)
}

/**
 * Log debug information (only in development)
 */
export function logDebug(message: string, context?: Record<string, any>) {
  logger.debug(message, context)
}

// Export default logger
export default logger

// Application configuration
export const config = {
  app: {
    name: 'PM SaaS Platform',
    defaultLocale: 'es',
    supportedLocales: ['es', 'pt'],
  },
  auth: {
    sessionDuration: 24 * 60 * 60, // 24 hours in seconds
    tokenRefreshThreshold: 5 * 60, // 5 minutes in seconds
  },
  ai: {
    cacheDurationHours: 24,
    maxRetries: 3,
    retryDelayMs: 1000,
  },
  blocker: {
    criticalThresholdHours: 48,
  },
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
} as const

export type Config = typeof config

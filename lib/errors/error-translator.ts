/**
 * Error Translation System
 * 
 * Maps error codes to translation keys and provides localized error messages.
 * Requirements: 14.3
 */

import { Locale } from '@/types'

/**
 * Error codes used throughout the application
 */
export enum ErrorCode {
  // Authentication errors (AUTH_xxx)
  AUTH_INVALID_CREDENTIALS = 'AUTH_001',
  AUTH_SESSION_EXPIRED = 'AUTH_002',
  AUTH_INVALID_TOKEN = 'AUTH_003',
  AUTH_USER_INACTIVE = 'AUTH_004',
  AUTH_INSUFFICIENT_PERMISSIONS = 'AUTH_005',

  // Organization errors (ORG_xxx)
  ORG_NOT_FOUND = 'ORG_001',
  ORG_USER_NOT_MEMBER = 'ORG_002',

  // Project errors (PROJ_xxx)
  PROJ_NOT_FOUND = 'PROJ_001',
  PROJ_ARCHIVED = 'PROJ_002',
  PROJ_INVALID_DATE_RANGE = 'PROJ_003',

  // Work item errors (WORK_xxx)
  WORK_NOT_FOUND = 'WORK_001',
  WORK_OWNER_NOT_IN_ORG = 'WORK_002',

  // Blocker errors (BLOCK_xxx)
  BLOCK_NOT_FOUND = 'BLOCK_001',
  BLOCK_ALREADY_RESOLVED = 'BLOCK_002',

  // Risk errors (RISK_xxx)
  RISK_NOT_FOUND = 'RISK_001',
  RISK_INVALID_PROBABILITY = 'RISK_002',
  RISK_INVALID_IMPACT = 'RISK_003',

  // Agreement errors (AGR_xxx)
  AGR_NOT_FOUND = 'AGR_001',
  AGR_ALREADY_COMPLETED = 'AGR_002',
  AGR_WORK_ITEM_ALREADY_LINKED = 'AGR_003',

  // AI errors (AI_xxx)
  AI_REPORT_GENERATION_FAILED = 'AI_001',
  AI_ANALYSIS_FAILED = 'AI_002',
  AI_GUARDRAILS_BLOCKED = 'AI_003',
  AI_RATE_LIMIT_EXCEEDED = 'AI_004',

  // Generic errors
  GENERIC_ERROR = 'GENERIC_001',
  VALIDATION_ERROR = 'VALIDATION_001',
  NOT_FOUND = 'NOT_FOUND_001',
  UNAUTHORIZED = 'UNAUTHORIZED_001',
  FORBIDDEN = 'FORBIDDEN_001',
  SERVER_ERROR = 'SERVER_ERROR_001',
  BAD_REQUEST = 'BAD_REQUEST_001',
  NETWORK_ERROR = 'NETWORK_ERROR_001',
  TIMEOUT = 'TIMEOUT_001',
  CONFLICT = 'CONFLICT_001',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS_001'
}

/**
 * Application error class with error code and translation support
 */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message || code)
    this.name = 'AppError'
  }
}

/**
 * Error translator class
 */
export class ErrorTranslator {
  /**
   * Map error codes to translation keys
   */
  private static errorCodeToKeyMap: Record<ErrorCode, string> = {
    // Authentication errors
    [ErrorCode.AUTH_INVALID_CREDENTIALS]: 'errors.codes.AUTH_001',
    [ErrorCode.AUTH_SESSION_EXPIRED]: 'errors.codes.AUTH_002',
    [ErrorCode.AUTH_INVALID_TOKEN]: 'errors.codes.AUTH_003',
    [ErrorCode.AUTH_USER_INACTIVE]: 'errors.codes.AUTH_004',
    [ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS]: 'errors.codes.AUTH_005',

    // Organization errors
    [ErrorCode.ORG_NOT_FOUND]: 'errors.codes.ORG_001',
    [ErrorCode.ORG_USER_NOT_MEMBER]: 'errors.codes.ORG_002',

    // Project errors
    [ErrorCode.PROJ_NOT_FOUND]: 'errors.codes.PROJ_001',
    [ErrorCode.PROJ_ARCHIVED]: 'errors.codes.PROJ_002',
    [ErrorCode.PROJ_INVALID_DATE_RANGE]: 'errors.codes.PROJ_003',

    // Work item errors
    [ErrorCode.WORK_NOT_FOUND]: 'errors.codes.WORK_001',
    [ErrorCode.WORK_OWNER_NOT_IN_ORG]: 'errors.codes.WORK_002',

    // Blocker errors
    [ErrorCode.BLOCK_NOT_FOUND]: 'errors.codes.BLOCK_001',
    [ErrorCode.BLOCK_ALREADY_RESOLVED]: 'errors.codes.BLOCK_002',

    // Risk errors
    [ErrorCode.RISK_NOT_FOUND]: 'errors.codes.RISK_001',
    [ErrorCode.RISK_INVALID_PROBABILITY]: 'errors.codes.RISK_002',
    [ErrorCode.RISK_INVALID_IMPACT]: 'errors.codes.RISK_003',

    // Agreement errors
    [ErrorCode.AGR_NOT_FOUND]: 'errors.codes.AGR_001',
    [ErrorCode.AGR_ALREADY_COMPLETED]: 'errors.codes.AGR_002',
    [ErrorCode.AGR_WORK_ITEM_ALREADY_LINKED]: 'errors.codes.AGR_003',

    // AI errors
    [ErrorCode.AI_REPORT_GENERATION_FAILED]: 'errors.codes.AI_001',
    [ErrorCode.AI_ANALYSIS_FAILED]: 'errors.codes.AI_002',
    [ErrorCode.AI_GUARDRAILS_BLOCKED]: 'errors.codes.AI_003',
    [ErrorCode.AI_RATE_LIMIT_EXCEEDED]: 'errors.codes.AI_004',

    // Generic errors
    [ErrorCode.GENERIC_ERROR]: 'errors.generic',
    [ErrorCode.VALIDATION_ERROR]: 'errors.validationError',
    [ErrorCode.NOT_FOUND]: 'errors.notFound',
    [ErrorCode.UNAUTHORIZED]: 'errors.unauthorized',
    [ErrorCode.FORBIDDEN]: 'errors.forbidden',
    [ErrorCode.SERVER_ERROR]: 'errors.serverError',
    [ErrorCode.BAD_REQUEST]: 'errors.badRequest',
    [ErrorCode.NETWORK_ERROR]: 'errors.networkError',
    [ErrorCode.TIMEOUT]: 'errors.timeout',
    [ErrorCode.CONFLICT]: 'errors.conflict',
    [ErrorCode.TOO_MANY_REQUESTS]: 'errors.tooManyRequests'
  }

  /**
   * Map error codes to HTTP status codes
   */
  private static errorCodeToStatusMap: Record<ErrorCode, number> = {
    // Authentication errors (401)
    [ErrorCode.AUTH_INVALID_CREDENTIALS]: 401,
    [ErrorCode.AUTH_SESSION_EXPIRED]: 401,
    [ErrorCode.AUTH_INVALID_TOKEN]: 401,
    [ErrorCode.AUTH_USER_INACTIVE]: 401,
    [ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS]: 403,

    // Organization errors (404, 403)
    [ErrorCode.ORG_NOT_FOUND]: 404,
    [ErrorCode.ORG_USER_NOT_MEMBER]: 403,

    // Project errors (404, 400)
    [ErrorCode.PROJ_NOT_FOUND]: 404,
    [ErrorCode.PROJ_ARCHIVED]: 400,
    [ErrorCode.PROJ_INVALID_DATE_RANGE]: 400,

    // Work item errors (404, 400)
    [ErrorCode.WORK_NOT_FOUND]: 404,
    [ErrorCode.WORK_OWNER_NOT_IN_ORG]: 400,

    // Blocker errors (404, 400)
    [ErrorCode.BLOCK_NOT_FOUND]: 404,
    [ErrorCode.BLOCK_ALREADY_RESOLVED]: 400,

    // Risk errors (404, 400)
    [ErrorCode.RISK_NOT_FOUND]: 404,
    [ErrorCode.RISK_INVALID_PROBABILITY]: 400,
    [ErrorCode.RISK_INVALID_IMPACT]: 400,

    // Agreement errors (404, 400, 409)
    [ErrorCode.AGR_NOT_FOUND]: 404,
    [ErrorCode.AGR_ALREADY_COMPLETED]: 400,
    [ErrorCode.AGR_WORK_ITEM_ALREADY_LINKED]: 409,

    // AI errors (500, 429)
    [ErrorCode.AI_REPORT_GENERATION_FAILED]: 500,
    [ErrorCode.AI_ANALYSIS_FAILED]: 500,
    [ErrorCode.AI_GUARDRAILS_BLOCKED]: 400,
    [ErrorCode.AI_RATE_LIMIT_EXCEEDED]: 429,

    // Generic errors
    [ErrorCode.GENERIC_ERROR]: 500,
    [ErrorCode.VALIDATION_ERROR]: 400,
    [ErrorCode.NOT_FOUND]: 404,
    [ErrorCode.UNAUTHORIZED]: 401,
    [ErrorCode.FORBIDDEN]: 403,
    [ErrorCode.SERVER_ERROR]: 500,
    [ErrorCode.BAD_REQUEST]: 400,
    [ErrorCode.NETWORK_ERROR]: 503,
    [ErrorCode.TIMEOUT]: 504,
    [ErrorCode.CONFLICT]: 409,
    [ErrorCode.TOO_MANY_REQUESTS]: 429
  }

  /**
   * Get the translation key for an error code
   */
  static getTranslationKey(code: ErrorCode): string {
    return this.errorCodeToKeyMap[code] || 'errors.generic'
  }

  /**
   * Get the HTTP status code for an error code
   */
  static getStatusCode(code: ErrorCode): number {
    return this.errorCodeToStatusMap[code] || 500
  }

  /**
   * Translate an error code to a localized message
   * This is a client-side utility that uses the translation function from next-intl
   */
  static translateError(
    code: ErrorCode,
    t: (key: string, params?: Record<string, any>) => string,
    params?: Record<string, any>
  ): string {
    const key = this.getTranslationKey(code)
    return t(key, params)
  }

  /**
   * Create a standardized error response object
   */
  static createErrorResponse(
    code: ErrorCode,
    message?: string,
    details?: any
  ): {
    error: {
      code: string
      message: string
      details?: any
    }
  } {
    return {
      error: {
        code,
        message: message || code,
        ...(details && { details })
      }
    }
  }

  /**
   * Check if an error is an AppError
   */
  static isAppError(error: any): error is AppError {
    return error instanceof AppError
  }

  /**
   * Convert any error to an AppError
   */
  static toAppError(error: any): AppError {
    if (this.isAppError(error)) {
      return error
    }

    // Handle Zod validation errors
    if (error?.name === 'ZodError') {
      return new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Validation error',
        400,
        error.errors
      )
    }

    // Handle Prisma errors
    if (error?.code === 'P2025') {
      return new AppError(
        ErrorCode.NOT_FOUND,
        'Resource not found',
        404
      )
    }

    if (error?.code === 'P2002') {
      return new AppError(
        ErrorCode.CONFLICT,
        'Resource already exists',
        409
      )
    }

    // Generic error
    return new AppError(
      ErrorCode.GENERIC_ERROR,
      error?.message || 'An unexpected error occurred',
      500
    )
  }
}

/**
 * Helper function to throw an AppError
 */
export function throwError(
  code: ErrorCode,
  message?: string,
  statusCode?: number,
  details?: any
): never {
  throw new AppError(code, message, statusCode, details)
}

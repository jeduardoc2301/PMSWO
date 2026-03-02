/**
 * Audit Logging Service for Security Events
 * 
 * Logs authentication failures, authorization failures, and sensitive operations.
 * 
 * Requirements: 15.5
 */

import { logger } from '@/lib/logger'
import prisma from '@/lib/prisma'

/**
 * Audit event types
 */
export enum AuditEventType {
  // Authentication events
  AUTH_LOGIN_SUCCESS = 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILURE = 'AUTH_LOGIN_FAILURE',
  AUTH_LOGOUT = 'AUTH_LOGOUT',
  AUTH_SESSION_EXPIRED = 'AUTH_SESSION_EXPIRED',
  AUTH_TOKEN_REFRESH = 'AUTH_TOKEN_REFRESH',

  // Authorization events
  AUTHZ_ACCESS_DENIED = 'AUTHZ_ACCESS_DENIED',
  AUTHZ_PERMISSION_CHECK_FAILED = 'AUTHZ_PERMISSION_CHECK_FAILED',

  // User management events
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  USER_ACTIVATED = 'USER_ACTIVATED',
  USER_DEACTIVATED = 'USER_DEACTIVATED',

  // Organization events
  ORG_USER_ADDED = 'ORG_USER_ADDED',
  ORG_USER_REMOVED = 'ORG_USER_REMOVED',
  ORG_SETTINGS_CHANGED = 'ORG_SETTINGS_CHANGED',

  // Sensitive operations
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED',
}

/**
 * Audit event severity levels
 */
export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

/**
 * Audit event context
 */
interface AuditContext {
  userId?: string
  organizationId?: string
  ipAddress?: string
  userAgent?: string
  requestId?: string
  targetUserId?: string
  targetResourceId?: string
  details?: Record<string, any>
}

/**
 * Audit log entry
 */
interface AuditLogEntry {
  eventType: AuditEventType
  severity: AuditSeverity
  timestamp: Date
  context: AuditContext
  message: string
}

/**
 * Audit Logger Service
 */
export class AuditLogger {
  /**
   * Log an audit event
   */
  private static log(
    eventType: AuditEventType,
    severity: AuditSeverity,
    message: string,
    context: AuditContext
  ): void {
    const entry: AuditLogEntry = {
      eventType,
      severity,
      timestamp: new Date(),
      context,
      message,
    }

    // Log to Winston (which will send to CloudWatch in production)
    const logLevel = severity === AuditSeverity.CRITICAL ? 'error' : severity === AuditSeverity.WARNING ? 'warn' : 'info'
    
    logger.log(logLevel, `[AUDIT] ${message}`, {
      audit: true,
      eventType,
      severity,
      ...context,
    })
  }

  /**
   * Log authentication success
   */
  static logAuthSuccess(userId: string, context: Omit<AuditContext, 'userId'>): void {
    this.log(
      AuditEventType.AUTH_LOGIN_SUCCESS,
      AuditSeverity.INFO,
      `User ${userId} logged in successfully`,
      { userId, ...context }
    )
  }

  /**
   * Log authentication failure
   */
  static logAuthFailure(email: string, reason: string, context: AuditContext): void {
    this.log(
      AuditEventType.AUTH_LOGIN_FAILURE,
      AuditSeverity.WARNING,
      `Login failed for ${email}: ${reason}`,
      { ...context, details: { email, reason } }
    )
  }

  /**
   * Log logout
   */
  static logLogout(userId: string, context: Omit<AuditContext, 'userId'>): void {
    this.log(
      AuditEventType.AUTH_LOGOUT,
      AuditSeverity.INFO,
      `User ${userId} logged out`,
      { userId, ...context }
    )
  }

  /**
   * Log authorization failure
   */
  static logAuthorizationFailure(
    userId: string,
    resource: string,
    requiredPermissions: string[],
    context: Omit<AuditContext, 'userId'>
  ): void {
    this.log(
      AuditEventType.AUTHZ_ACCESS_DENIED,
      AuditSeverity.WARNING,
      `User ${userId} denied access to ${resource}`,
      {
        userId,
        ...context,
        details: {
          resource,
          requiredPermissions,
        },
      }
    )
  }

  /**
   * Log user creation
   */
  static logUserCreated(
    createdUserId: string,
    createdByUserId: string,
    roles: string[],
    context: AuditContext
  ): void {
    this.log(
      AuditEventType.USER_CREATED,
      AuditSeverity.INFO,
      `User ${createdUserId} created by ${createdByUserId}`,
      {
        userId: createdByUserId,
        targetUserId: createdUserId,
        ...context,
        details: { roles },
      }
    )
  }

  /**
   * Log user role change
   */
  static logUserRoleChanged(
    targetUserId: string,
    changedByUserId: string,
    oldRoles: string[],
    newRoles: string[],
    context: AuditContext
  ): void {
    this.log(
      AuditEventType.USER_ROLE_CHANGED,
      AuditSeverity.CRITICAL,
      `User ${targetUserId} roles changed by ${changedByUserId}`,
      {
        userId: changedByUserId,
        targetUserId,
        ...context,
        details: {
          oldRoles,
          newRoles,
        },
      }
    )
  }

  /**
   * Log user activation/deactivation
   */
  static logUserStatusChanged(
    targetUserId: string,
    changedByUserId: string,
    active: boolean,
    context: AuditContext
  ): void {
    const eventType = active ? AuditEventType.USER_ACTIVATED : AuditEventType.USER_DEACTIVATED
    
    this.log(
      eventType,
      AuditSeverity.WARNING,
      `User ${targetUserId} ${active ? 'activated' : 'deactivated'} by ${changedByUserId}`,
      {
        userId: changedByUserId,
        targetUserId,
        ...context,
      }
    )
  }

  /**
   * Log organization user addition
   */
  static logOrgUserAdded(
    organizationId: string,
    addedUserId: string,
    addedByUserId: string,
    roles: string[],
    context: AuditContext
  ): void {
    this.log(
      AuditEventType.ORG_USER_ADDED,
      AuditSeverity.INFO,
      `User ${addedUserId} added to organization ${organizationId} by ${addedByUserId}`,
      {
        userId: addedByUserId,
        organizationId,
        targetUserId: addedUserId,
        ...context,
        details: { roles },
      }
    )
  }

  /**
   * Log organization user removal
   */
  static logOrgUserRemoved(
    organizationId: string,
    removedUserId: string,
    removedByUserId: string,
    context: AuditContext
  ): void {
    this.log(
      AuditEventType.ORG_USER_REMOVED,
      AuditSeverity.WARNING,
      `User ${removedUserId} removed from organization ${organizationId} by ${removedByUserId}`,
      {
        userId: removedByUserId,
        organizationId,
        targetUserId: removedUserId,
        ...context,
      }
    )
  }

  /**
   * Log password change
   */
  static logPasswordChanged(userId: string, context: AuditContext): void {
    this.log(
      AuditEventType.PASSWORD_CHANGED,
      AuditSeverity.WARNING,
      `Password changed for user ${userId}`,
      { userId, ...context }
    )
  }

  /**
   * Log password reset request
   */
  static logPasswordResetRequested(email: string, context: AuditContext): void {
    this.log(
      AuditEventType.PASSWORD_RESET_REQUESTED,
      AuditSeverity.WARNING,
      `Password reset requested for ${email}`,
      { ...context, details: { email } }
    )
  }

  /**
   * Log password reset completion
   */
  static logPasswordResetCompleted(userId: string, context: AuditContext): void {
    this.log(
      AuditEventType.PASSWORD_RESET_COMPLETED,
      AuditSeverity.WARNING,
      `Password reset completed for user ${userId}`,
      { userId, ...context }
    )
  }

  /**
   * Log organization settings change
   */
  static logOrgSettingsChanged(
    organizationId: string,
    changedByUserId: string,
    changes: Record<string, any>,
    context: AuditContext
  ): void {
    this.log(
      AuditEventType.ORG_SETTINGS_CHANGED,
      AuditSeverity.INFO,
      `Organization ${organizationId} settings changed by ${changedByUserId}`,
      {
        userId: changedByUserId,
        organizationId,
        ...context,
        details: { changes },
      }
    )
  }
}

export default AuditLogger

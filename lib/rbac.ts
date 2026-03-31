import { UserRole, Permission } from '@/types'

/**
 * Role-based access control (RBAC) permission mapping
 * Maps each user role to their allowed permissions
 */
export const rolePermissions: Record<UserRole, Permission[]> = {
  [UserRole.EXECUTIVE]: [
    // Organization
    Permission.ORG_VIEW,
    
    // Users
    Permission.USER_VIEW,
    
    // Projects - Full read access
    Permission.PROJECT_VIEW,
    
    // Work Items - Full read access
    Permission.WORK_ITEM_VIEW,
    
    // Blockers - Full read access
    Permission.BLOCKER_VIEW,
    
    // Risks - Full read access
    Permission.RISK_VIEW,
    
    // Agreements - Full read access
    Permission.AGREEMENT_VIEW,
    
    // Dashboards - Full access to both
    Permission.DASHBOARD_EXECUTIVE,
    Permission.DASHBOARD_PROJECT,  // ⭐ ADDED: Can now see project dashboards
    
    // Export
    Permission.EXPORT_PROJECT,
  ],

  [UserRole.ADMIN]: [
    Permission.ORG_MANAGE,
    Permission.USER_CREATE,
    Permission.USER_UPDATE,
    Permission.USER_DELETE,
    Permission.USER_VIEW,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_DELETE,
    Permission.PROJECT_VIEW,
    Permission.PROJECT_ARCHIVE,
    Permission.WORK_ITEM_CREATE,
    Permission.WORK_ITEM_UPDATE,
    Permission.WORK_ITEM_DELETE,
    Permission.WORK_ITEM_VIEW,
    Permission.BLOCKER_CREATE,
    Permission.BLOCKER_UPDATE,
    Permission.BLOCKER_RESOLVE,
    Permission.BLOCKER_VIEW,
    Permission.RISK_CREATE,
    Permission.RISK_UPDATE,
    Permission.RISK_DELETE,
    Permission.RISK_VIEW,
    Permission.AGREEMENT_CREATE,
    Permission.AGREEMENT_UPDATE,
    Permission.AGREEMENT_DELETE,
    Permission.AGREEMENT_VIEW,
    Permission.AI_USE,
    Permission.DASHBOARD_EXECUTIVE,
    Permission.DASHBOARD_PROJECT,
    Permission.EXPORT_PROJECT,
  ],

  [UserRole.PROJECT_MANAGER]: [
    Permission.USER_VIEW,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_VIEW,
    Permission.PROJECT_ARCHIVE,
    Permission.WORK_ITEM_CREATE,
    Permission.WORK_ITEM_UPDATE,
    Permission.WORK_ITEM_VIEW,
    Permission.BLOCKER_CREATE,
    Permission.BLOCKER_UPDATE,
    Permission.BLOCKER_RESOLVE,
    Permission.BLOCKER_VIEW,
    Permission.RISK_CREATE,
    Permission.RISK_UPDATE,
    Permission.RISK_VIEW,
    Permission.AGREEMENT_CREATE,
    Permission.AGREEMENT_UPDATE,
    Permission.AGREEMENT_VIEW,
    Permission.AI_USE,
    Permission.DASHBOARD_PROJECT,
    Permission.EXPORT_PROJECT,
  ],

  [UserRole.INTERNAL_CONSULTANT]: [
    Permission.PROJECT_VIEW,
    Permission.WORK_ITEM_CREATE,        // ⭐ ADDED: Can create tasks
    Permission.WORK_ITEM_UPDATE,        // ⭐ ADDED: Can edit all tasks in their projects
    Permission.WORK_ITEM_VIEW,
    Permission.BLOCKER_CREATE,
    Permission.BLOCKER_UPDATE,          // ⭐ ADDED: Can update blockers
    Permission.BLOCKER_RESOLVE,         // ⭐ ADDED: Can resolve blockers
    Permission.BLOCKER_VIEW,
    Permission.RISK_CREATE,             // ⭐ ADDED: Can create risks
    Permission.RISK_UPDATE,             // ⭐ ADDED: Can update risks
    Permission.RISK_VIEW,
    Permission.AGREEMENT_VIEW,
    Permission.AI_USE,
    Permission.DASHBOARD_PROJECT,
  ],

  [UserRole.EXTERNAL_CONSULTANT]: [
    Permission.PROJECT_VIEW,
    Permission.WORK_ITEM_VIEW,
    Permission.BLOCKER_VIEW,
    Permission.RISK_VIEW,
    Permission.AGREEMENT_VIEW,
    Permission.DASHBOARD_PROJECT,
  ],
}

/**
 * Check if a user has a specific permission
 * @param userRoles - Array of roles assigned to the user
 * @param permission - The permission to check
 * @returns true if the user has the permission through any of their roles
 */
export function hasPermission(userRoles: UserRole[], permission: Permission): boolean {
  return userRoles.some((role) => rolePermissions[role]?.includes(permission))
}

/**
 * Check if a user has a specific role
 * @param userRoles - Array of roles assigned to the user
 * @param role - The role to check
 * @returns true if the user has the specified role
 */
export function hasRole(userRoles: UserRole[], role: UserRole): boolean {
  return userRoles.includes(role)
}

/**
 * Get all permissions for a user based on their roles
 * @param userRoles - Array of roles assigned to the user
 * @returns Array of unique permissions the user has
 */
export function getUserPermissions(userRoles: UserRole[]): Permission[] {
  const permissions = new Set<Permission>()
  
  userRoles.forEach((role) => {
    const rolePerms = rolePermissions[role] || []
    rolePerms.forEach((perm) => permissions.add(perm))
  })
  
  return Array.from(permissions)
}

/**
 * Check if a user has all of the specified permissions
 * @param userRoles - Array of roles assigned to the user
 * @param permissions - Array of permissions to check
 * @returns true if the user has all specified permissions
 */
export function hasAllPermissions(userRoles: UserRole[], permissions: Permission[]): boolean {
  return permissions.every((permission) => hasPermission(userRoles, permission))
}

/**
 * Check if a user has any of the specified permissions
 * @param userRoles - Array of roles assigned to the user
 * @param permissions - Array of permissions to check
 * @returns true if the user has at least one of the specified permissions
 */
export function hasAnyPermission(userRoles: UserRole[], permissions: Permission[]): boolean {
  return permissions.some((permission) => hasPermission(userRoles, permission))
}

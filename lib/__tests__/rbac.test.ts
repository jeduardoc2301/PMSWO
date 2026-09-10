import { describe, it, expect } from 'vitest'
import {
  hasPermission,
  hasRole,
  getUserPermissions,
  hasAllPermissions,
  hasAnyPermission,
  rolePermissions,
} from '../rbac'
import { UserRole, Permission } from '@/types'

describe('RBAC Permission System', () => {
  describe('hasPermission', () => {
    it('should return true when user has the permission through their role', () => {
      const roles = [UserRole.ADMIN]
      expect(hasPermission(roles, Permission.USER_CREATE)).toBe(true)
      expect(hasPermission(roles, Permission.PROJECT_CREATE)).toBe(true)
    })

    it('should return false when user does not have the permission', () => {
      const roles = [UserRole.EXTERNAL_CONSULTANT]
      expect(hasPermission(roles, Permission.USER_CREATE)).toBe(false)
      expect(hasPermission(roles, Permission.PROJECT_CREATE)).toBe(false)
    })

    it('should check permissions across multiple roles', () => {
      const roles = [UserRole.EXECUTIVE, UserRole.PROJECT_MANAGER]
      expect(hasPermission(roles, Permission.DASHBOARD_EXECUTIVE)).toBe(true)
      expect(hasPermission(roles, Permission.PROJECT_CREATE)).toBe(true)
    })

    it('should return false for empty roles array', () => {
      const roles: UserRole[] = []
      expect(hasPermission(roles, Permission.USER_CREATE)).toBe(false)
    })
  })

  describe('hasRole', () => {
    it('should return true when user has the specified role', () => {
      const roles = [UserRole.ADMIN, UserRole.PROJECT_MANAGER]
      expect(hasRole(roles, UserRole.ADMIN)).toBe(true)
      expect(hasRole(roles, UserRole.PROJECT_MANAGER)).toBe(true)
    })

    it('should return false when user does not have the specified role', () => {
      const roles = [UserRole.ADMIN]
      expect(hasRole(roles, UserRole.EXECUTIVE)).toBe(false)
    })

    it('should return false for empty roles array', () => {
      const roles: UserRole[] = []
      expect(hasRole(roles, UserRole.ADMIN)).toBe(false)
    })
  })

  describe('getUserPermissions', () => {
    it('should return all permissions for a single role', () => {
      const roles = [UserRole.EXECUTIVE]
      const permissions = getUserPermissions(roles)
      
      expect(permissions).toContain(Permission.ORG_VIEW)
      expect(permissions).toContain(Permission.PROJECT_VIEW)
      expect(permissions).toContain(Permission.DASHBOARD_EXECUTIVE)
      expect(permissions).not.toContain(Permission.USER_CREATE)
    })

    it('should return unique permissions when user has multiple roles', () => {
      const roles = [UserRole.EXECUTIVE, UserRole.PROJECT_MANAGER]
      const permissions = getUserPermissions(roles)
      
      // Should have permissions from both roles
      expect(permissions).toContain(Permission.DASHBOARD_EXECUTIVE)
      expect(permissions).toContain(Permission.PROJECT_CREATE)
      
      // Should not have duplicates
      const uniquePermissions = new Set(permissions)
      expect(permissions.length).toBe(uniquePermissions.size)
    })

    it('should return empty array for empty roles', () => {
      const roles: UserRole[] = []
      const permissions = getUserPermissions(roles)
      expect(permissions).toEqual([])
    })
  })

  describe('hasAllPermissions', () => {
    it('should return true when user has all specified permissions', () => {
      const roles = [UserRole.ADMIN]
      const requiredPermissions = [
        Permission.USER_CREATE,
        Permission.PROJECT_CREATE,
        Permission.WORK_ITEM_CREATE,
      ]
      expect(hasAllPermissions(roles, requiredPermissions)).toBe(true)
    })

    it('should return false when user is missing at least one permission', () => {
      const roles = [UserRole.EXTERNAL_CONSULTANT]
      const requiredPermissions = [
        Permission.PROJECT_VIEW,
        Permission.USER_CREATE, // External consultant does not have this
      ]
      expect(hasAllPermissions(roles, requiredPermissions)).toBe(false)
    })

    it('should return true for empty permissions array', () => {
      const roles = [UserRole.EXTERNAL_CONSULTANT]
      expect(hasAllPermissions(roles, [])).toBe(true)
    })
  })

  describe('hasAnyPermission', () => {
    it('should return true when user has at least one of the specified permissions', () => {
      const roles = [UserRole.EXTERNAL_CONSULTANT]
      const permissions = [
        Permission.USER_CREATE, // Does not have
        Permission.PROJECT_VIEW, // Has this one
      ]
      expect(hasAnyPermission(roles, permissions)).toBe(true)
    })

    it('should return false when user has none of the specified permissions', () => {
      const roles = [UserRole.EXTERNAL_CONSULTANT]
      const permissions = [
        Permission.USER_CREATE,
        Permission.PROJECT_CREATE,
        Permission.WORK_ITEM_CREATE,
      ]
      expect(hasAnyPermission(roles, permissions)).toBe(false)
    })

    it('should return false for empty permissions array', () => {
      const roles = [UserRole.ADMIN]
      expect(hasAnyPermission(roles, [])).toBe(false)
    })
  })

  describe('rolePermissions mapping', () => {
    it('should have permissions defined for all user roles', () => {
      const allRoles = Object.values(UserRole)
      allRoles.forEach((role) => {
        expect(rolePermissions[role]).toBeDefined()
        expect(Array.isArray(rolePermissions[role])).toBe(true)
      })
    })

    it('EXECUTIVE should have read-only permissions', () => {
      const executivePerms = rolePermissions[UserRole.EXECUTIVE]
      
      // Should have view permissions
      expect(executivePerms).toContain(Permission.ORG_VIEW)
      expect(executivePerms).toContain(Permission.PROJECT_VIEW)
      expect(executivePerms).toContain(Permission.DASHBOARD_EXECUTIVE)
      
      // Should not have create/update/delete permissions
      expect(executivePerms).not.toContain(Permission.USER_CREATE)
      expect(executivePerms).not.toContain(Permission.PROJECT_CREATE)
      expect(executivePerms).not.toContain(Permission.WORK_ITEM_CREATE)
    })

    it('ADMIN should have all permissions', () => {
      const adminPerms = rolePermissions[UserRole.ADMIN]
      
      // Should have management permissions
      expect(adminPerms).toContain(Permission.ORG_MANAGE)
      expect(adminPerms).toContain(Permission.USER_CREATE)
      expect(adminPerms).toContain(Permission.USER_UPDATE)
      expect(adminPerms).toContain(Permission.USER_DELETE)
      expect(adminPerms).toContain(Permission.PROJECT_CREATE)
      expect(adminPerms).toContain(Permission.AI_USE)
    })

    it('PROJECT_MANAGER should have project management permissions', () => {
      const pmPerms = rolePermissions[UserRole.PROJECT_MANAGER]
      
      // Should have project and work item permissions
      expect(pmPerms).toContain(Permission.PROJECT_CREATE)
      expect(pmPerms).toContain(Permission.PROJECT_UPDATE)
      expect(pmPerms).toContain(Permission.WORK_ITEM_CREATE)
      expect(pmPerms).toContain(Permission.BLOCKER_RESOLVE)
      expect(pmPerms).toContain(Permission.AI_USE)
      
      // Should not have user management permissions
      expect(pmPerms).not.toContain(Permission.USER_CREATE)
      expect(pmPerms).not.toContain(Permission.USER_DELETE)
    })

    /**
     * El consultor interno se amplió: antes solo podía editar las tareas que tenía asignadas, hoy
     * puede trabajar sobre todo el proyecto en el que participa —crear y editar tareas, bloqueadores
     * y riesgos—. Lo que sigue sin poder es administrar: crear proyectos o tocar usuarios.
     *
     * `WORK_ITEM_UPDATE_OWN` continúa declarado en el catálogo de permisos pero ya no lo usa ningún
     * rol. Se deja comprobado aquí para que no se confunda «existe» con «se usa».
     */
    it('INTERNAL_CONSULTANT works across their project, but cannot administer', () => {
      const internalPerms = rolePermissions[UserRole.INTERNAL_CONSULTANT]

      expect(internalPerms).toContain(Permission.PROJECT_VIEW)
      expect(internalPerms).toContain(Permission.WORK_ITEM_CREATE)
      expect(internalPerms).toContain(Permission.WORK_ITEM_UPDATE)
      expect(internalPerms).toContain(Permission.BLOCKER_CREATE)
      expect(internalPerms).toContain(Permission.BLOCKER_RESOLVE)
      expect(internalPerms).toContain(Permission.AI_USE)

      expect(internalPerms).not.toContain(Permission.PROJECT_CREATE)
      expect(internalPerms).not.toContain(Permission.USER_CREATE)
      expect(internalPerms).not.toContain(Permission.WORK_ITEM_UPDATE_OWN)
    })

    it('no role uses WORK_ITEM_UPDATE_OWN any more', () => {
      const conElPermiso = Object.values(rolePermissions).filter((permisos) =>
        permisos.includes(Permission.WORK_ITEM_UPDATE_OWN),
      )
      expect(conElPermiso).toHaveLength(0)
    })

    it('EXTERNAL_CONSULTANT should have minimal read-only permissions', () => {
      const externalPerms = rolePermissions[UserRole.EXTERNAL_CONSULTANT]
      
      // Should have view permissions only
      expect(externalPerms).toContain(Permission.PROJECT_VIEW)
      expect(externalPerms).toContain(Permission.WORK_ITEM_VIEW)
      expect(externalPerms).toContain(Permission.DASHBOARD_PROJECT)
      
      // Should not have any create/update permissions or AI access
      expect(externalPerms).not.toContain(Permission.WORK_ITEM_CREATE)
      expect(externalPerms).not.toContain(Permission.WORK_ITEM_UPDATE_OWN)
      expect(externalPerms).not.toContain(Permission.AI_USE)
    })
  })

  describe('edge cases', () => {
    it('should handle invalid role gracefully', () => {
      const roles = ['INVALID_ROLE' as UserRole]
      expect(hasPermission(roles, Permission.USER_CREATE)).toBe(false)
    })

    it('should handle multiple roles with overlapping permissions', () => {
      const roles = [UserRole.ADMIN, UserRole.PROJECT_MANAGER]
      const permissions = getUserPermissions(roles)
      
      // Should not have duplicate permissions
      const uniquePermissions = new Set(permissions)
      expect(permissions.length).toBe(uniquePermissions.size)
      
      // Should have all admin permissions (which is a superset)
      expect(permissions).toContain(Permission.USER_CREATE)
      expect(permissions).toContain(Permission.PROJECT_CREATE)
    })
  })
})

/**
 * El cargo de solo lectura, en la tabla de la organización.
 *
 * La prueba que importa aquí no enumera lo que tiene: enumera lo que **no puede llegar a tener**.
 * La lista de `VIEWER` va a crecer con el tiempo —alguien querrá que vea una cosa más— y la promesa
 * tiene que sobrevivir a esa línea futura sin depender de que quien la escriba lea el comentario de
 * al lado.
 */
describe('El cargo de solo lectura no escribe', () => {
  it('ni un solo permiso suyo es de escritura', () => {
    // Un permiso vale para este cargo si termina en `:view` —mirar— o es el panel del proyecto, que
    // es una lectura con nombre propio. Cualquier otra cosa que aparezca aquí rompe la prueba, y esa
    // es toda la intención: que romperla sea el único modo de quitarle el «solo» a «solo lectura».
    const permitidos = (permiso: Permission) =>
      permiso.endsWith(':view') || permiso === Permission.DASHBOARD_PROJECT

    const intrusos = rolePermissions[UserRole.VIEWER].filter((p) => !permitidos(p))
    expect(intrusos).toEqual([])
  })

  it('no crea, no actualiza, no borra, no resuelve, no archiva', () => {
    const suyos = getUserPermissions([UserRole.VIEWER])
    const escrituras = [
      Permission.PROJECT_CREATE,
      Permission.PROJECT_UPDATE,
      Permission.PROJECT_DELETE,
      Permission.PROJECT_ARCHIVE,
      Permission.WORK_ITEM_CREATE,
      Permission.WORK_ITEM_UPDATE,
      Permission.WORK_ITEM_UPDATE_OWN,
      Permission.WORK_ITEM_DELETE,
      Permission.BLOCKER_CREATE,
      Permission.BLOCKER_UPDATE,
      Permission.BLOCKER_RESOLVE,
      Permission.RISK_CREATE,
      Permission.RISK_UPDATE,
      Permission.RISK_DELETE,
      Permission.AGREEMENT_CREATE,
      Permission.AGREEMENT_UPDATE,
      Permission.AGREEMENT_DELETE,
      Permission.USER_CREATE,
      Permission.USER_UPDATE,
      Permission.USER_DELETE,
      Permission.ORG_MANAGE,
    ]
    for (const permiso of escrituras) {
      expect(suyos).not.toContain(permiso)
    }
  })

  it('tampoco redacta con IA ni exporta', () => {
    // Ninguna de las dos es mirar: la IA escribe el informe y consume cuota, y exportar deja hoy una
    // fila de registro por cada descarga.
    expect(hasPermission([UserRole.VIEWER], Permission.AI_USE)).toBe(false)
    expect(hasPermission([UserRole.VIEWER], Permission.EXPORT_PROJECT)).toBe(false)
  })

  it('pero sí ve lo que necesita para que la pantalla tenga sentido', () => {
    const suyos = getUserPermissions([UserRole.VIEWER])
    expect(suyos).toContain(Permission.PROJECT_VIEW)
    expect(suyos).toContain(Permission.WORK_ITEM_VIEW)
    // Sin `USER_VIEW` la Lista no puede poner nombre a los responsables y enseña identificadores.
    expect(suyos).toContain(Permission.USER_VIEW)
  })

  it('y no ve la cartera entera: eso es del ejecutivo', () => {
    expect(hasPermission([UserRole.VIEWER], Permission.DASHBOARD_EXECUTIVE)).toBe(false)
  })
})

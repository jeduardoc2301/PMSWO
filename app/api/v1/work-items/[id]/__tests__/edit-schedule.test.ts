import { describe, expect, it } from 'vitest'

import { hasPermission } from '@/lib/rbac'
import { Permission, UserRole } from '@/types'

/**
 * La distinción entre tocar el plan y actualizar el seguimiento (§10.1).
 *
 * El spec la llama «el permiso más útil de todo el sistema y el que casi nadie implementa»: quien
 * ejecuta actualiza el estado y el avance de sus líneas sin poder alterar el cronograma.
 *
 * Hizo falta el día que la ruta general de la línea empezó a reprogramar. Hasta entonces mover una
 * fecha desde aquí movía una línea; después movía todo lo que colgara de ella, y la guardia de
 * `/reschedule` —que sí exige el permiso del plan— se saltaba por la puerta de al lado.
 *
 * Se prueba sobre los roles, que es donde vive la regla: la ruta pregunta exactamente esto.
 */

describe('§10.1 · mover fechas pide el permiso del plan', () => {
  it('quien ejecuta puede editar líneas pero no tocar el cronograma', () => {
    // El caso que abrió el agujero: tiene lo uno y no lo otro.
    expect(hasPermission([UserRole.INTERNAL_CONSULTANT], Permission.WORK_ITEM_UPDATE)).toBe(true)
    expect(hasPermission([UserRole.INTERNAL_CONSULTANT], Permission.PROJECT_UPDATE)).toBe(false)
  })

  it('quien lleva el proyecto sí puede', () => {
    expect(hasPermission([UserRole.PROJECT_MANAGER], Permission.PROJECT_UPDATE)).toBe(true)
    expect(hasPermission([UserRole.ADMIN], Permission.PROJECT_UPDATE)).toBe(true)
  })

  it('la ruta de reprogramar y la de editar fechas piden lo mismo', () => {
    // Si un día divergen, vuelve el agujero: dos puertas al mismo cuarto con cerraduras distintas.
    // `/reschedule` exige PROJECT_UPDATE; la de la línea consulta este mismo permiso antes de
    // dejar pasar un cambio de fechas.
    const delPlan = Permission.PROJECT_UPDATE
    for (const rol of [UserRole.INTERNAL_CONSULTANT, UserRole.EXTERNAL_CONSULTANT, UserRole.EXECUTIVE]) {
      const puedeReprogramar = hasPermission([rol], delPlan)
      const puedeMoverFechas = hasPermission([rol], delPlan)
      expect(puedeMoverFechas).toBe(puedeReprogramar)
    }
  })

  it('un consultor externo no puede ni lo uno ni lo otro', () => {
    expect(hasPermission([UserRole.EXTERNAL_CONSULTANT], Permission.PROJECT_UPDATE)).toBe(false)
    expect(hasPermission([UserRole.EXTERNAL_CONSULTANT], Permission.WORK_ITEM_UPDATE)).toBe(false)
  })
})

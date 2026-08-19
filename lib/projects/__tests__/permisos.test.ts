import { describe, expect, it } from 'vitest'

import { UserRole } from '@/types'
import {
  PERMISOS_DE_PROYECTO,
  PERMISOS_POR_ROL_DE_PROYECTO,
  ROLES_DE_PROYECTO,
  permisosEfectivos,
  puede,
  vistasVisibles,
} from '../permisos'

/**
 * Los diez permisos de proyecto del §10.1.
 *
 * Lo que se prueba no es que la tabla exista, sino las tres cosas que hacen que un permiso sirva:
 * que la distinción entre mover el plan y actualizar la tarea se sostenga, que el techo de la
 * organización no se pueda saltar nombrando a alguien, y que quien no está invitado no vea nada.
 */

describe('La distinción que el spec llama la más útil', () => {
  it('un colaborador actualiza su tarea', () => {
    expect(puede([UserRole.INTERNAL_CONSULTANT], 'COLLABORATOR', 'edit_tracking')).toBe(true)
  })

  it('pero no mueve el plan', () => {
    // Mover una fecha en un plan encadenado empuja a las sucesoras: es una decisión de quien lleva
    // el plan, no de quien lleva la tarea.
    expect(puede([UserRole.INTERNAL_CONSULTANT], 'COLLABORATOR', 'edit_schedule')).toBe(false)
  })

  it('quien lleva el proyecto sí lo mueve', () => {
    expect(puede([UserRole.PROJECT_MANAGER], 'MANAGER', 'edit_schedule')).toBe(true)
  })

  it('y las dos mitades son de verdad independientes', () => {
    // Si `edit_schedule` implicara `edit_tracking` o al revés, la distinción sería decorativa.
    const gestor = permisosEfectivos([UserRole.PROJECT_MANAGER], 'MANAGER')
    const ejecutor = permisosEfectivos([UserRole.INTERNAL_CONSULTANT], 'COLLABORATOR')
    expect(gestor.has('edit_schedule') && gestor.has('edit_tracking')).toBe(true)
    expect(ejecutor.has('edit_tracking') && !ejecutor.has('edit_schedule')).toBe(true)
  })
})

describe('El cliente externo del §10.1', () => {
  it('ve la Lista y el Tablero', () => {
    const cliente = permisosEfectivos([UserRole.EXTERNAL_CONSULTANT], 'CLIENT')
    expect(cliente.has('view_list')).toBe(true)
    expect(cliente.has('view_board')).toBe(true)
  })

  it('no ve el Gantt ni el presupuesto', () => {
    // Son las dos que el spec nombra: «dar Lista y Tablero pero no el Gantt ni el presupuesto».
    const cliente = permisosEfectivos([UserRole.EXTERNAL_CONSULTANT], 'CLIENT')
    expect(cliente.has('view_gantt')).toBe(false)
    expect(cliente.has('view_budget')).toBe(false)
  })

  it('ni edita nada', () => {
    const cliente = permisosEfectivos([UserRole.EXTERNAL_CONSULTANT], 'CLIENT')
    expect(cliente.has('edit_schedule')).toBe(false)
    expect(cliente.has('edit_tracking')).toBe(false)
  })
})

describe('El techo del cargo no se salta nombrando a alguien', () => {
  it('un ejecutivo propietario de un proyecto sigue sin poder editarlo', () => {
    // Un techo que se pudiera saltar nombrando a alguien no sería un techo. El ejecutivo mira la
    // cartera; no la ejecuta.
    expect(puede([UserRole.EXECUTIVE], 'OWNER', 'edit_schedule')).toBe(false)
    expect(puede([UserRole.EXECUTIVE], 'OWNER', 'edit_tracking')).toBe(false)
  })

  it('un consultor externo, aunque sea gestor del proyecto, no ve la carga del equipo', () => {
    // El reparto de carga es información de la casa, no del proyecto.
    expect(puede([UserRole.EXTERNAL_CONSULTANT], 'MANAGER', 'view_workload')).toBe(false)
  })

  it('ni el presupuesto', () => {
    expect(puede([UserRole.EXTERNAL_CONSULTANT], 'MANAGER', 'view_budget')).toBe(false)
  })

  it('pero un administrador con papel de gestor sí hace las dos cosas', () => {
    expect(puede([UserRole.ADMIN], 'MANAGER', 'view_workload')).toBe(true)
    expect(puede([UserRole.ADMIN], 'MANAGER', 'edit_schedule')).toBe(true)
  })

  it('el papel también es techo: un administrador invitado como cliente ve lo de un cliente', () => {
    // Es la otra mitad de la intersección, y la que más se olvida: el cargo alto no abre el
    // proyecto de par en par si allí te sentaron como invitado.
    const admin = permisosEfectivos([UserRole.ADMIN], 'CLIENT')
    expect(admin.has('view_gantt')).toBe(false)
    expect(admin.has('manage_project_settings')).toBe(false)
    expect(admin.has('view_list')).toBe(true)
  })
})

describe('Quien no está invitado no ve nada', () => {
  it('sin papel en el proyecto, el conjunto está vacío', () => {
    // Pertenecer a la organización no da acceso a un proyecto al que nadie te invitó: es la
    // diferencia entre una lista de proyectos y una carpeta compartida.
    expect(permisosEfectivos([UserRole.ADMIN], null).size).toBe(0)
  })

  it('ni siquiera para mirar', () => {
    expect(puede([UserRole.ADMIN], null, 'view_list')).toBe(false)
  })
})

describe('La barra de vistas', () => {
  // Los identificadores de la barra de verdad, con `gantt` para el Timeline y el guion de
  // `work-items`: si esta lista se escribiera «bonita» la prueba pasaría y la pantalla no recortaría.
  const BARRA = ['kanban', 'work-items', 'gantt', 'calendar', 'workload', 'dashboard']

  it('un cliente ve tres de las seis', () => {
    const cliente = permisosEfectivos([UserRole.EXTERNAL_CONSULTANT], 'CLIENT')
    expect(vistasVisibles(cliente, BARRA)).toEqual(['kanban', 'work-items', 'dashboard'])
  })

  it('quien lleva el proyecto las ve todas', () => {
    const gestor = permisosEfectivos([UserRole.PROJECT_MANAGER], 'MANAGER')
    expect(vistasVisibles(gestor, BARRA)).toEqual(BARRA)
  })

  it('se esconden, y una pestaña que no es del §10.1 no se recorta', () => {
    // Bloqueadores, riesgos y acuerdos no son vistas del §10.1: recortarlas aquí escondería media
    // aplicación por un olvido en una tabla.
    const cliente = permisosEfectivos([UserRole.EXTERNAL_CONSULTANT], 'CLIENT')
    expect(vistasVisibles(cliente, ['blockers', 'risks', 'gantt'])).toEqual(['blockers', 'risks'])
  })

  it('sin permisos no queda ninguna vista del §10.1', () => {
    expect(vistasVisibles(new Set(), BARRA)).toEqual([])
  })
})

describe('La tabla, por dentro', () => {
  it('son diez permisos, los que nombra el spec', () => {
    expect(PERMISOS_DE_PROYECTO).toHaveLength(10)
  })

  it('cada papel declara sólo permisos que existen', () => {
    // Una cadena mal escrita en la tabla daría un permiso que nadie puede tener y nadie notaría.
    for (const rol of ROLES_DE_PROYECTO) {
      for (const permiso of PERMISOS_POR_ROL_DE_PROYECTO[rol]) {
        expect(PERMISOS_DE_PROYECTO).toContain(permiso)
      }
    }
  })

  it('el propietario es el único que administra el proyecto', () => {
    for (const rol of ROLES_DE_PROYECTO) {
      const administra = PERMISOS_POR_ROL_DE_PROYECTO[rol].includes('manage_project_settings')
      expect(administra).toBe(rol === 'OWNER')
    }
  })

  it('ningún papel da más que el propietario', () => {
    const delDueno = new Set(PERMISOS_POR_ROL_DE_PROYECTO.OWNER)
    for (const rol of ROLES_DE_PROYECTO) {
      for (const permiso of PERMISOS_POR_ROL_DE_PROYECTO[rol]) {
        expect(delDueno.has(permiso)).toBe(true)
      }
    }
  })
})

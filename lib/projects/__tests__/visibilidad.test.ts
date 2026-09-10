import { describe, expect, it } from 'vitest'

import { UserRole } from '@/types'
import { filtroDeProyectosVisibles, veLaCarteraEntera } from '../visibilidad'

/**
 * Qué proyectos ve cada quien.
 *
 * La prueba que de verdad importa es la última de este archivo: que la lista y la puerta del
 * proyecto digan lo mismo sobre la misma persona. Cuando decían cosas distintas, el síntoma no era
 * un error en pantalla —era un proyecto que no aparecía, que es un fallo que nadie sabe reportar.
 */

const YO = 'user-1'

describe('Quién ve la cartera entera', () => {
  it('el administrador y el ejecutivo', () => {
    expect(veLaCarteraEntera([UserRole.ADMIN])).toBe(true)
    expect(veLaCarteraEntera([UserRole.EXECUTIVE])).toBe(true)
    expect(filtroDeProyectosVisibles(YO, [UserRole.ADMIN])).toBeNull()
  })

  it('nadie más, ni siquiera el gerente de proyectos', () => {
    // Lleva proyectos, no la cartera: ve los suyos.
    expect(veLaCarteraEntera([UserRole.PROJECT_MANAGER])).toBe(false)
    expect(veLaCarteraEntera([UserRole.INTERNAL_CONSULTANT])).toBe(false)
    expect(veLaCarteraEntera([UserRole.EXTERNAL_CONSULTANT])).toBe(false)
    expect(veLaCarteraEntera([UserRole.VIEWER])).toBe(false)
  })

  it('basta con uno de los cargos', () => {
    expect(veLaCarteraEntera([UserRole.VIEWER, UserRole.EXECUTIVE])).toBe(true)
  })

  it('y sin cargos no se ve la cartera', () => {
    expect(veLaCarteraEntera([])).toBe(false)
  })
})

describe('Las cuatro formas de pertenecer a un proyecto', () => {
  const filtro = filtroDeProyectosVisibles(YO, [UserRole.VIEWER])!

  it('ser el dueño', () => {
    expect(filtro.OR).toContainEqual({ ownerId: YO })
  })

  it('llevarlo', () => {
    // La que faltaba: quien figura como gestor del proyecto sin fila de colaborador no aparecía en
    // ninguna de las ramas viejas, porque ninguna miraba esa columna.
    expect(filtro.OR).toContainEqual({ projectManagerId: YO })
  })

  it('tener fila de colaborador', () => {
    // Ésta es la vía por la que se le dan proyectos a una cuenta de solo lectura.
    expect(filtro.OR).toContainEqual({ collaborators: { some: { userId: YO } } })
  })

  it('o tener alguna línea del plan a su nombre', () => {
    // Se conserva de la regla anterior: sin ella, un consultor con tareas asignadas y sin fila de
    // colaborador perdería proyectos que ve hoy.
    expect(filtro.OR).toContainEqual({ workItems: { some: { ownerId: YO } } })
  })

  it('y no hay una quinta', () => {
    expect(filtro.OR).toHaveLength(4)
  })
})

describe('La regla es la misma para todos los cargos que no ven la cartera', () => {
  it.each([
    UserRole.PROJECT_MANAGER,
    UserRole.INTERNAL_CONSULTANT,
    UserRole.EXTERNAL_CONSULTANT,
    UserRole.VIEWER,
  ])('%s ve aquello a lo que pertenece', (cargo) => {
    // El reparto por cargo era el defecto: al consultor sólo se le enseñaban los proyectos donde
    // tuviera tareas, así que su fila de colaborador no contaba y el proyecto no aparecía.
    const suyo = filtroDeProyectosVisibles(YO, [cargo])
    expect(suyo).not.toBeNull()
    expect(suyo!.OR).toContainEqual({ collaborators: { some: { userId: YO } } })
  })

  it('un cargo desconocido no abre la cartera', () => {
    // Un valor inventado en la base no puede acabar viéndolo todo. Ve lo que le hayan dado, que sin
    // filas de pertenencia es nada.
    const filtro = filtroDeProyectosVisibles(YO, ['CARGO_QUE_NO_EXISTE'])
    expect(filtro).not.toBeNull()
    expect(filtro!.OR).toHaveLength(4)
  })
})

describe('La lista y la puerta dicen lo mismo', () => {
  it('a quien se sienta en un proyecto, el proyecto le aparece', () => {
    // El caso real que destapó esto: un consultor externo al que se había hecho `MANAGER` del plan.
    // La pantalla de papeles lo enseñaba sentado; su lista de proyectos venía vacía.
    for (const cargo of Object.values(UserRole)) {
      const filtro = filtroDeProyectosVisibles(YO, [cargo])
      const leAparece =
        filtro === null || filtro.OR.some((rama) => 'collaborators' in rama)
      expect(leAparece).toBe(true)
    }
  })
})

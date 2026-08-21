import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/project-authorize.service', () => ({ authorize: vi.fn() }))

const { authorize } = await import('@/services/project-authorize.service')
const { exigirPermiso } = await import('../exigir-permiso')

/**
 * §10.1 · con varios permisos basta uno, no todos.
 *
 * Hace falta porque hay rutas que sirven a más de una vista. `/schedule` carga el plan para el
 * Gantt, la Lista y el Calendario, y el §10.1 pone como ejemplo justo el perfil al que «se le quiere
 * dar Lista y Tablero pero no el Gantt». Exigiendo sólo `view_gantt`, ese perfil veía la pestaña de
 * Lista —la barra la ofrece con `view_list`— y al entrar recibía un 403.
 *
 * Un permiso ofrecido y después negado es peor que uno que no se ofrece: el primero parece una
 * avería y el segundo es una decisión.
 */

const negar = () => {
  const e = new Error('No tienes ese permiso en este proyecto.')
  e.name = 'AuthorizationError'
  return e
}

beforeEach(() => {
  vi.mocked(authorize).mockReset()
})

describe('§10.1 · un permiso suelto', () => {
  it('deja pasar cuando lo tiene', async () => {
    vi.mocked(authorize).mockResolvedValue(undefined as never)
    await expect(exigirPermiso('u1', 'p1', 'view_gantt')).resolves.toBeNull()
  })

  it('y devuelve 403 cuando no', async () => {
    vi.mocked(authorize).mockRejectedValue(negar())
    const r = await exigirPermiso('u1', 'p1', 'view_gantt')
    expect(r).not.toBeNull()
    expect(r!.status).toBe(403)
  })
})

describe('§10.1 · varios permisos: basta uno', () => {
  it('el primero que valga deja pasar, sin probar los demás', async () => {
    vi.mocked(authorize).mockResolvedValue(undefined as never)
    await expect(
      exigirPermiso('u1', 'p1', ['view_gantt', 'view_list', 'view_calendar']),
    ).resolves.toBeNull()
    expect(authorize).toHaveBeenCalledTimes(1)
  })

  it('quien tiene Lista y no Gantt entra igual: es el caso que el §10.1 nombra', async () => {
    vi.mocked(authorize)
      .mockRejectedValueOnce(negar())
      .mockResolvedValueOnce(undefined as never)
    await expect(
      exigirPermiso('u1', 'p1', ['view_gantt', 'view_list', 'view_calendar']),
    ).resolves.toBeNull()
    expect(authorize).toHaveBeenCalledTimes(2)
  })

  it('y quien no tiene ninguno de los tres recibe 403, no una pantalla en blanco', async () => {
    vi.mocked(authorize).mockRejectedValue(negar())
    const r = await exigirPermiso('u1', 'p1', ['view_gantt', 'view_list', 'view_calendar'], 'No tienes acceso al plan.')
    expect(r!.status).toBe(403)
    expect(authorize).toHaveBeenCalledTimes(3)
    expect(await r!.json()).toEqual({ error: 'Forbidden', message: 'No tienes acceso al plan.' })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NotFoundError, ValidationError } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { verificarPadre } from '../workitem.service'

vi.mock('@/lib/prisma', () => ({
  default: {
    workItem: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}))

/**
 * La mitad de las reglas del árbol que necesita la base.
 *
 * `validarPadre` ya tiene su propia prueba y responde sobre la forma de un árbol que recibe hecho;
 * lo que se comprueba aquí es lo otro: que el padre exista, que sea del MISMO proyecto, y —lo que
 * más se rompe al refactorizar— **con qué error** se rechaza cada caso, porque de eso sale el código
 * HTTP que ve quien está moviendo líneas.
 *
 * El contrato dice 400 para las tres reglas. Un padre inexistente parece un 404 y por eso se
 * escribió así una vez: pero el que no existe no es la línea que se pidió mover —esa está ahí— sino
 * un dato del cuerpo, y un 404 la pantalla lo lee como «se borró la línea que estoy editando».
 * `ValidationError` lleva 400; `NotFoundError`, 404. Por eso la prueba mira la clase, no el texto.
 */

const PADRE = { id: 'padre' }

describe('El padre tiene que existir y ser del mismo proyecto', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([] as never)
  })

  it('subir a la raíz no consulta nada: null siempre se puede', async () => {
    await expect(verificarPadre('proy-1', 'hija', null)).resolves.toBeUndefined()

    expect(prisma.workItem.findFirst).not.toHaveBeenCalled()
    expect(prisma.workItem.findMany).not.toHaveBeenCalled()
  })

  it('busca al padre acotado al proyecto, no suelto por id', async () => {
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(PADRE as never)

    await verificarPadre('proy-1', 'hija', 'padre')

    expect(prisma.workItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'padre', projectId: 'proy-1' } }),
    )
  })

  /**
   * Es el mismo camino que el de un padre de otro proyecto: la consulta va acotada, así que uno
   * ajeno «no existe» desde aquí. Por eso este caso cubre las dos mitades de la regla.
   */
  it('un padre que no aparece se rechaza con 400, no con 404', async () => {
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(null as never)

    const error = await verificarPadre('proy-1', 'hija', 'ajeno').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ValidationError)
    expect(error).not.toBeInstanceOf(NotFoundError)
    expect((error as ValidationError).statusCode).toBe(400)
    expect((error as ValidationError).message).toBe(
      'La línea que se eligió como padre no existe en este proyecto.',
    )
  })

  it('al crear no se busca el árbol: una línea que aún no existe no tiene descendientes', async () => {
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue(PADRE as never)

    await verificarPadre('proy-1', null, 'padre')

    expect(prisma.workItem.findMany).not.toHaveBeenCalled()
  })

  it('al mover sí se lee el árbol del proyecto, y el ciclo se rechaza con 400', async () => {
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue({ id: 'nieta' } as never)
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([
      { id: 'hija', parentId: null },
      { id: 'nieta', parentId: 'hija' },
    ] as never)

    const error = await verificarPadre('proy-1', 'hija', 'nieta').catch((e: unknown) => e)

    expect(prisma.workItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'proy-1' } }),
    )
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).message).toBe(
      'No se puede colgar una línea de una de sus propias descendientes: el árbol dejaría de serlo.',
    )
  })

  it('un movimiento sano pasa sin tronar', async () => {
    vi.mocked(prisma.workItem.findFirst).mockResolvedValue({ id: 'hermana' } as never)
    vi.mocked(prisma.workItem.findMany).mockResolvedValue([
      { id: 'hija', parentId: 'raiz' },
      { id: 'hermana', parentId: 'raiz' },
      { id: 'raiz', parentId: null },
    ] as never)

    await expect(verificarPadre('proy-1', 'hija', 'hermana')).resolves.toBeUndefined()
  })
})

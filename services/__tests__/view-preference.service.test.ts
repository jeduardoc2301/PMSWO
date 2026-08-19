import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { PANEL_POR_OMISION } from '@/lib/projects/dashboard-widgets'

/**
 * §10.4: la preferencia de vista se guarda por usuario × proyecto × vista.
 *
 * Lo que importa comprobar aquí no es que Prisma sepa hacer un upsert, sino las dos decisiones que
 * protegen la pantalla: que nada entra sin pasar por el esquema, y que una fila corrupta o de una
 * versión vieja se cae de pie a la preferencia de por omisión en vez de romperle el panel a alguien
 * que no hizo nada malo.
 */

vi.mock('@/lib/prisma', () => ({
  default: { viewPreference: { findUnique: vi.fn(), upsert: vi.fn() } },
}))

const prisma = (await import('@/lib/prisma')).default as unknown as {
  viewPreference: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> }
}

const {
  guardarPreferencia,
  leerPreferencia,
  preferenciaPorOmision,
  validarPreferencia,
} = await import('../view-preference.service')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('validar lo que entra', () => {
  it('acepta una lista de widgets conocidos', () => {
    expect(validarPreferencia('PANEL', { widgets: ['tareas', 'hitos'] })).toEqual({
      widgets: ['tareas', 'hitos'],
    })
  })

  it('acepta la lista vacía: apagarlos todos es una decisión válida', () => {
    expect(validarPreferencia('PANEL', { widgets: [] })).toEqual({ widgets: [] })
  })

  it('rechaza un widget que no existe', () => {
    expect(() => validarPreferencia('PANEL', { widgets: ['ganancias'] })).toThrow(z.ZodError)
  })

  it('rechaza algo que ni siquiera tiene la forma', () => {
    expect(() => validarPreferencia('PANEL', { widgets: 'todos' })).toThrow(z.ZodError)
    expect(() => validarPreferencia('PANEL', null)).toThrow(z.ZodError)
  })

  it('una vista que todavía no guarda preferencias lo dice en vez de tragar cualquier cosa', () => {
    expect(() => validarPreferencia('GANTT', { lo: 'que sea' })).toThrow(z.ZodError)
  })
})

describe('leer', () => {
  it('sin fila guardada devuelve la de por omisión', async () => {
    prisma.viewPreference.findUnique.mockResolvedValue(null)

    expect(await leerPreferencia('u1', 'p1', 'PANEL')).toEqual(PANEL_POR_OMISION)
  })

  it('la de por omisión trae los cuatro widgets que sí tienen datos', () => {
    expect(preferenciaPorOmision('PANEL')).toEqual({
      widgets: ['informacion', 'tareas', 'hitos', 'calendario'],
    })
  })

  it('devuelve lo guardado cuando cuadra con el esquema', async () => {
    prisma.viewPreference.findUnique.mockResolvedValue({ settings: { widgets: ['hitos'] } })

    expect(await leerPreferencia('u1', 'p1', 'PANEL')).toEqual({ widgets: ['hitos'] })
  })

  it('una fila corrupta no rompe la pantalla: se cae de pie a la de por omisión', async () => {
    prisma.viewPreference.findUnique.mockResolvedValue({ settings: { widgets: ['inventado'] } })

    expect(await leerPreferencia('u1', 'p1', 'PANEL')).toEqual(PANEL_POR_OMISION)
  })

  it('una fila de otra época tampoco', async () => {
    prisma.viewPreference.findUnique.mockResolvedValue({ settings: { columnas: ['wbs'] } })

    expect(await leerPreferencia('u1', 'p1', 'PANEL')).toEqual(PANEL_POR_OMISION)
  })

  it('busca por la clave de las tres partes', async () => {
    prisma.viewPreference.findUnique.mockResolvedValue(null)

    await leerPreferencia('u1', 'p1', 'PANEL')

    expect(prisma.viewPreference.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_projectId_view: { userId: 'u1', projectId: 'p1', view: 'PANEL' } },
      }),
    )
  })
})

describe('guardar', () => {
  it('hace un upsert sobre la clave de las tres partes', async () => {
    prisma.viewPreference.upsert.mockResolvedValue({})

    await guardarPreferencia('o1', 'u1', 'p1', 'PANEL', { widgets: ['tareas'] })

    expect(prisma.viewPreference.upsert).toHaveBeenCalledWith({
      where: { userId_projectId_view: { userId: 'u1', projectId: 'p1', view: 'PANEL' } },
      create: {
        organizationId: 'o1',
        userId: 'u1',
        projectId: 'p1',
        view: 'PANEL',
        settings: { widgets: ['tareas'] },
      },
      update: { settings: { widgets: ['tareas'] } },
    })
  })

  it('lo que no valida no llega a la base', async () => {
    await expect(guardarPreferencia('o1', 'u1', 'p1', 'PANEL', { widgets: ['xx'] })).rejects.toThrow(
      z.ZodError,
    )
    expect(prisma.viewPreference.upsert).not.toHaveBeenCalled()
  })

  it('guarda lo ya validado, no lo que llegó', async () => {
    prisma.viewPreference.upsert.mockResolvedValue({})

    // Lo de más se cae en el esquema: a la base va sólo lo declarado.
    const guardado = await guardarPreferencia('o1', 'u1', 'p1', 'PANEL', {
      widgets: ['tareas'],
      colorFavorito: 'morado',
    })

    expect(guardado).toEqual({ widgets: ['tareas'] })
  })
})

describe('Las dos preferencias que el spec llama por su nombre', () => {
  it('el Tablero guarda si enseña los resúmenes (§5.3)', () => {
    // El §5.3 usa la palabra «preferencia»: «las tareas resumen se muestran o no según
    // preferencia». Era estado suelto y se perdía en cada recarga.
    const puesto = validarPreferencia('TABLERO', {
      agruparPor: 'estado',
      ordenarPor: 'wbs',
      sentido: 'asc',
      conResumenes: true,
    }) as { conResumenes: boolean }
    expect(puesto.conResumenes).toBe(true)
  })

  it('y apagarlo también se guarda', () => {
    // `false` es una elección tan válida como `true`. Si se leyera con un valor blando, apagar los
    // resúmenes no se guardaría nunca y la casilla volvería sola.
    const apagado = validarPreferencia('TABLERO', {
      agruparPor: 'estado',
      ordenarPor: 'wbs',
      sentido: 'asc',
      conResumenes: false,
    }) as { conResumenes: boolean }
    expect(apagado.conResumenes).toBe(false)
  })

  it('una preferencia guardada antes de que el campo existiera sigue valiendo', () => {
    // Si el campo fuera obligatorio, estrenar la casilla le borraría a cada persona su agrupación.
    expect(() =>
      validarPreferencia('TABLERO', { agruparPor: 'estado', ordenarPor: 'wbs', sentido: 'asc' }),
    ).not.toThrow()
  })

  it('el Gantt guarda el conmutador de atrasadas (§4.6, «toggles.overdue» del §10.4)', () => {
    const puesto = validarPreferencia('GANTT', {
      columnas: ['name'],
      anchos: {},
      escala: 'MES',
      nivel: 1,
      flechas: 'SELECCION',
      atrasadas: true,
    }) as { atrasadas: boolean }
    expect(puesto.atrasadas).toBe(true)
  })

  it('y el Gantt de antes tampoco se rompe', () => {
    expect(() =>
      validarPreferencia('GANTT', {
        columnas: ['name'],
        anchos: {},
        escala: 'MES',
        nivel: 1,
        flechas: 'SELECCION',
      }),
    ).not.toThrow()
  })
})

describe('La línea base activa (§4.6 conmutador 4, «toggles.baseline» del §10.4)', () => {
  const GANTT_BASE = {
    columnas: ['name'],
    anchos: {},
    escala: 'MES',
    nivel: 1,
    flechas: 'SELECCION',
  }

  it('guarda el identificador de la foto que se compara', () => {
    const puesto = validarPreferencia('GANTT', { ...GANTT_BASE, baseline: 'bl_123' }) as {
      baseline: string | null
    }
    expect(puesto.baseline).toBe('bl_123')
  })

  it('«ninguna» es una elección y se guarda como null', () => {
    // Si `null` no valiera, quitar la comparación no se podría guardar y la foto volvería sola.
    const ninguna = validarPreferencia('GANTT', { ...GANTT_BASE, baseline: null }) as {
      baseline: string | null
    }
    expect(ninguna.baseline).toBeNull()
  })

  it('y una preferencia de antes del campo sigue valiendo', () => {
    expect(() => validarPreferencia('GANTT', GANTT_BASE)).not.toThrow()
  })

  it('un identificador que no es texto se rechaza', () => {
    // Guardar un número aquí daría una comparación contra una foto que no existe.
    expect(() => validarPreferencia('GANTT', { ...GANTT_BASE, baseline: 7 })).toThrow()
  })
})

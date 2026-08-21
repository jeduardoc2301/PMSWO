import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renombrarLinea } from '../renombrar'

/**
 * §6.4 · renombrar, una sola vez para todas las vistas.
 *
 * Estaba escrito en la Lista y **no estaba en el Esquema**, que además es el formato por omisión: en
 * la vista donde aterriza quien entra por primera vez, el nombre no se podía editar. Lo que se
 * prueba aquí son las cuatro decisiones que se pueden tomar mal por separado, y que por eso viven
 * juntas: si se escribe, cuándo se apunta, qué se apunta y qué pasa cuando el servidor dice que no.
 */

let peticiones: { url: string; metodo: string; cuerpo: string }[] = []

const responder = (ok: boolean) =>
  vi.fn(async (url: string, opciones?: { method?: string; body?: string }) => {
    peticiones.push({ url: String(url), metodo: opciones?.method ?? 'GET', cuerpo: opciones?.body ?? '' })
    return { ok, status: ok ? 200 : 422 } as Response
  })

beforeEach(() => {
  peticiones = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('§6.4 · escribir', () => {
  it('manda el nombre nuevo a la línea, y sólo eso', async () => {
    vi.stubGlobal('fetch', responder(true))
    await renombrarLinea({ id: 'l1', titulo: 'Migrar la red', anterior: 'Migar la red' })
    expect(peticiones).toHaveLength(1)
    expect(peticiones[0]!.url).toContain('/api/v1/work-items/l1')
    expect(peticiones[0]!.metodo).toBe('PATCH')
    expect(JSON.parse(peticiones[0]!.cuerpo)).toEqual({ title: 'Migrar la red' })
  })

  it('no escribe cuando el nombre no cambia', async () => {
    // Guardar sin tocar nada es lo que pasa al abrir una celda y pulsar Enter.
    vi.stubGlobal('fetch', responder(true))
    const escribio = await renombrarLinea({ id: 'l1', titulo: 'Igual', anterior: 'Igual' })
    expect(escribio).toBe(false)
    expect(peticiones).toHaveLength(0)
  })
})

describe('§10.6 · el apunte va DESPUÉS de que la escritura salga bien', () => {
  /**
   * Estuvo antes, con el argumento de que «si falla, la recarga devuelve la pantalla a lo que hay en
   * la base y el apunte queda inocuo». No queda inocuo: la pantalla vuelve, pero **la pila se queda
   * con la entrada**, y la barra ofrece deshacer un cambio que nunca ocurrió.
   */
  it('con el servidor conforme, se apunta el antes y el después', async () => {
    vi.stubGlobal('fetch', responder(true))
    const apuntar = vi.fn()
    await renombrarLinea({ id: 'l1', titulo: 'Nuevo', anterior: 'Viejo', apuntar })
    expect(apuntar).toHaveBeenCalledTimes(1)
    const op = apuntar.mock.calls[0]![0]
    expect(op.etiqueta).toContain('Viejo')
    expect(op.deshacer).toEqual([{ workItemId: 'l1', campos: { title: 'Viejo' } }])
    expect(op.hacer).toEqual([{ workItemId: 'l1', campos: { title: 'Nuevo' } }])
  })

  it('con el servidor rechazando, NO se apunta nada', async () => {
    vi.stubGlobal('fetch', responder(false))
    const apuntar = vi.fn()
    const escribio = await renombrarLinea({ id: 'l1', titulo: 'Nuevo', anterior: 'Viejo', apuntar })
    expect(escribio).toBe(false)
    expect(apuntar).not.toHaveBeenCalled()
  })
})

describe('§10.7 · la pantalla vuelve a lo que hay en la base, salga bien o mal', () => {
  it('se recarga al escribir', async () => {
    vi.stubGlobal('fetch', responder(true))
    const recargar = vi.fn()
    await renombrarLinea({ id: 'l1', titulo: 'Nuevo', anterior: 'Viejo', recargar })
    expect(recargar).toHaveBeenCalledTimes(1)
  })

  it('y también cuando el servidor dice que no', async () => {
    // Dejar en pantalla un nombre que no está guardado es peor que devolver el que había.
    vi.stubGlobal('fetch', responder(false))
    const recargar = vi.fn()
    await renombrarLinea({ id: 'l1', titulo: 'Nuevo', anterior: 'Viejo', recargar })
    expect(recargar).toHaveBeenCalledTimes(1)
  })

  it('sin pila y sin recarga se escribe igual: las dos son opcionales', async () => {
    vi.stubGlobal('fetch', responder(true))
    await expect(renombrarLinea({ id: 'l1', titulo: 'Nuevo', anterior: 'Viejo' })).resolves.toBe(true)
  })
})

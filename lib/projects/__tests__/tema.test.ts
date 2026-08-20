import { describe, expect, it } from 'vitest'

import { LLAVE_DEL_TEMA, type Tema, aspectoDe, esTema, guionSinParpadeo, temaGuardado } from '../tema'

/**
 * Brecha 28 · el conmutador de claro y oscuro.
 *
 * Lo que se prueba aquí es la parte que decide, que es la única que puede estar mal: qué se pinta
 * dado lo que alguien eligió y lo que dice su sistema, y que el guion previo al pintado no pueda
 * tumbar la página.
 */

describe('aspectoDe', () => {
  it('sin elegir nada sigue oscura, como ha sido siempre', () => {
    // Cambiarle el aspecto a quien no ha pedido nada no es una mejora, es una sorpresa.
    expect(aspectoDe('sistema', false)).toBe('oscuro')
  })

  it('sin elegir nada pero con el sistema en claro, claro', () => {
    expect(aspectoDe('sistema', true)).toBe('claro')
  })

  it('la elección explícita gana sobre el sistema, en los dos sentidos', () => {
    // Quien tiene el sistema en claro y quiere ESTA aplicación oscura necesita poder decirlo.
    expect(aspectoDe('oscuro', true)).toBe('oscuro')
    expect(aspectoDe('claro', false)).toBe('claro')
  })
})

describe('temaGuardado', () => {
  it('acepta los tres estados', () => {
    for (const t of ['sistema', 'claro', 'oscuro'] as Tema[]) {
      expect(temaGuardado(t)).toBe(t)
    }
  })

  it('cualquier otra cosa vuelve a «como el sistema»', () => {
    // `localStorage` es de quien tenga la consola abierta: lo que salga de ahí no se cree.
    expect(temaGuardado(null)).toBe('sistema')
    expect(temaGuardado('')).toBe('sistema')
    expect(temaGuardado('CLARO')).toBe('sistema')
    expect(temaGuardado('{"a":1}')).toBe('sistema')
  })

  it('y `esTema` no se traga un objeto', () => {
    expect(esTema({ toString: () => 'claro' })).toBe(false)
    expect(esTema(undefined)).toBe(false)
  })
})

describe('el guion previo al pintado', () => {
  /**
   * Sin él hay un fogonazo: el servidor no sabe qué eligió esta persona, así que la página llega sin
   * estampar y se pinta oscura un instante. Un parpadeo en cada navegación es peor que no tener modo
   * claro.
   */
  const guion = guionSinParpadeo()

  it('lee la misma llave que escribe el conmutador', () => {
    expect(guion).toContain(JSON.stringify(LLAVE_DEL_TEMA))
  })

  it('estampa el atributo, que es lo que el CSS mira', () => {
    expect(guion).toContain("setAttribute('data-theme'")
  })

  it('va envuelto en un `try`: `localStorage` lanza en modo privado y dentro de un iframe', () => {
    expect(guion).toContain('try{')
    expect(guion).toContain('catch(e){}')
  })

  it('es una sola expresión, sin saltos de línea que un `<script>` en línea parta mal', () => {
    expect(guion).not.toContain('\n')
  })

  it('corre de verdad y estampa lo que toca', () => {
    const raiz: Record<string, string> = {}
    const ventana = {
      matchMedia: (consulta: string) => ({ matches: consulta.includes('light') }),
      localStorage: { getItem: () => 'sistema' },
    }
    const documento = { documentElement: { setAttribute: (k: string, v: string) => { raiz[k] = v } } }
    // Se ejecuta con los globales fingidos, que es exactamente como corre en el navegador.
    new Function('window', 'document', 'localStorage', guion)(ventana, documento, ventana.localStorage)
    expect(raiz['data-theme']).toBe('claro')
    expect(raiz['data-tema-elegido']).toBe('sistema')
  })

  it('con el sistema en oscuro y sin elección, oscuro', () => {
    const raiz: Record<string, string> = {}
    const ventana = {
      matchMedia: () => ({ matches: false }),
      localStorage: { getItem: () => null },
    }
    const documento = { documentElement: { setAttribute: (k: string, v: string) => { raiz[k] = v } } }
    new Function('window', 'document', 'localStorage', guion)(ventana, documento, ventana.localStorage)
    expect(raiz['data-theme']).toBe('oscuro')
    expect(raiz['data-tema-elegido']).toBe('sistema')
  })

  it('con elección explícita, la elección manda sobre el sistema', () => {
    const raiz: Record<string, string> = {}
    const ventana = {
      matchMedia: () => ({ matches: true }), // el sistema pide claro
      localStorage: { getItem: () => 'oscuro' }, // y la persona pidió oscuro
    }
    const documento = { documentElement: { setAttribute: (k: string, v: string) => { raiz[k] = v } } }
    new Function('window', 'document', 'localStorage', guion)(ventana, documento, ventana.localStorage)
    expect(raiz['data-theme']).toBe('oscuro')
  })

  it('si `localStorage` lanza, no tumba la página: se queda como estaba', () => {
    const raiz: Record<string, string> = {}
    const ventana = {
      matchMedia: () => ({ matches: true }),
      localStorage: { getItem: () => { throw new Error('bloqueado por el navegador') } },
    }
    const documento = { documentElement: { setAttribute: (k: string, v: string) => { raiz[k] = v } } }
    expect(() =>
      new Function('window', 'document', 'localStorage', guion)(ventana, documento, ventana.localStorage),
    ).not.toThrow()
    expect(raiz['data-theme']).toBeUndefined()
  })
})

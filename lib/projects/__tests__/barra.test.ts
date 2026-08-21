// @vitest-environment happy-dom
//
// Este de aquí sí necesita documento: el guion sin parpadeo estampa un atributo en `<html>` y el
// almacén vive en `window`. El corte por omisión manda los `.test.ts` a `node`, y la excepción se
// pide en la cabecera del archivo que la necesita — que es donde se ve.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ATRIBUTO_DE_LA_BARRA,
  LLAVE_DE_LA_BARRA,
  alternarBarra,
  barraGuardada,
  esEstadoDeBarra,
  estadoDeLaBarra,
  estamparBarra,
  guionSinParpadeoDeLaBarra,
} from '../barra'

/**
 * Un `localStorage` de mentira: `happy-dom` no trae uno en esta versión.
 *
 * Se escribe entero en vez de fingir métodos sueltos porque la prueba que importa —que plegar la
 * barra siga funcionando cuando **lanza**— necesita poder hacerlo lanzar de verdad.
 */
function almacenDeMentira(alGuardar?: () => void) {
  const datos = new Map<string, string>()
  return {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (alGuardar) alGuardar()
      datos.set(k, String(v))
    },
    removeItem: (k: string) => { datos.delete(k) },
    clear: () => { datos.clear() },
    key: (i: number) => [...datos.keys()][i] ?? null,
    get length() { return datos.size },
  }
}

function ponAlmacen(almacen: ReturnType<typeof almacenDeMentira>) {
  Object.defineProperty(window, 'localStorage', { writable: true, configurable: true, value: almacen })
}

/** Un elemento raíz de mentira, para no ensuciar el documento de las demás pruebas. */
function raizDeMentira(inicial?: string) {
  const atributos = new Map<string, string>()
  if (inicial !== undefined) atributos.set(ATRIBUTO_DE_LA_BARRA, inicial)
  return {
    getAttribute: (n: string) => atributos.get(n) ?? null,
    setAttribute: (n: string, v: string) => { atributos.set(n, v) },
  }
}

describe('El estado de la barra lateral', () => {
  beforeEach(() => { ponAlmacen(almacenDeMentira()) })

  describe('lo guardado, saneado', () => {
    it('reconoce los dos estados y nada más', () => {
      expect(esEstadoDeBarra('abierta')).toBe(true)
      expect(esEstadoDeBarra('plegada')).toBe(true)
      expect(esEstadoDeBarra('cerrada')).toBe(false)
      expect(esEstadoDeBarra(null)).toBe(false)
      expect(esEstadoDeBarra(1)).toBe(false)
    })

    /**
     * Cualquier basura vuelve a `abierta`, y eso no es una comodidad: es la regla de que quien no ha
     * elegido nada tiene que seguir viendo lo que veía ayer. La aplicación nació con la barra fuera.
     */
    it('cualquier basura vuelve a abierta, que es como la aplicación ha sido siempre', () => {
      expect(barraGuardada(null)).toBe('abierta')
      expect(barraGuardada('')).toBe('abierta')
      expect(barraGuardada('PLEGADA')).toBe('abierta')
      expect(barraGuardada('{"plegada":true}')).toBe('abierta')
      expect(barraGuardada('plegada')).toBe('plegada')
    })
  })

  describe('estampar y alternar', () => {
    it('escribe el atributo y lo recuerda', () => {
      const raiz = raizDeMentira()
      estamparBarra(raiz, 'plegada')
      expect(raiz.getAttribute(ATRIBUTO_DE_LA_BARRA)).toBe('plegada')
      expect(window.localStorage.getItem(LLAVE_DE_LA_BARRA)).toBe('plegada')
    })

    it('alterna en los dos sentidos', () => {
      const raiz = raizDeMentira()
      expect(estadoDeLaBarra(raiz)).toBe('abierta')
      expect(alternarBarra(raiz)).toBe('plegada')
      expect(alternarBarra(raiz)).toBe('abierta')
    })

    /**
     * `localStorage` lanza en modo privado de algunos navegadores y con las cookies de terceros
     * bloqueadas dentro de un `iframe`. Si lanzara sin más, el botón dejaría de mover la barra por
     * no poder recordarlo, que es perder lo importante por lo accesorio.
     */
    it('si el almacén lanza, la barra igual se mueve: sólo se pierde que lo recuerde', () => {
      ponAlmacen(almacenDeMentira(() => { throw new Error('modo privado') }))
      const raiz = raizDeMentira()
      expect(() => alternarBarra(raiz)).not.toThrow()
      expect(raiz.getAttribute(ATRIBUTO_DE_LA_BARRA)).toBe('plegada')
    })
  })

  describe('el guion que corre antes del primer pintado', () => {
    /**
     * Se ejecuta de verdad en vez de comprobar que la cadena «contiene» algo.
     *
     * Buscar trozos de texto dentro de un guion no prueba que el guion funcione: prueba que alguien
     * escribió esas letras. Aquí se corre con un `localStorage` fingido y se mira qué estampó.
     */
    const correr = (guardado: string | null) => {
      const almacen = almacenDeMentira()
      if (guardado !== null) almacen.setItem(LLAVE_DE_LA_BARRA, guardado)
      ponAlmacen(almacen)
      const puesto: Array<[string, string]> = []
      const anterior = document.documentElement.setAttribute.bind(document.documentElement)
      const espia = vi
        .spyOn(document.documentElement, 'setAttribute')
        .mockImplementation((n: string, v: string) => { puesto.push([n, v]); anterior(n, v) })
      try {
        // eslint-disable-next-line no-eval
        eval(guionSinParpadeoDeLaBarra())
      } finally {
        espia.mockRestore()
      }
      return puesto
    }

    it('estampa plegada cuando eso es lo que había guardado', () => {
      expect(correr('plegada')).toEqual([[ATRIBUTO_DE_LA_BARRA, 'plegada']])
    })

    it('estampa abierta cuando no hay nada guardado', () => {
      expect(correr(null)).toEqual([[ATRIBUTO_DE_LA_BARRA, 'abierta']])
    })

    it('estampa abierta ante cualquier basura, en vez de dejar el atributo a medias', () => {
      expect(correr('{"plegada":true}')).toEqual([[ATRIBUTO_DE_LA_BARRA, 'abierta']])
    })

    /**
     * Si el guion lanzara, se lleva por delante el pintado de toda la página: va en línea en el
     * `<head>` y es lo primero que corre.
     */
    it('no lanza aunque el almacén lance', () => {
      Object.defineProperty(window, 'localStorage', {
        writable: true,
        configurable: true,
        value: { getItem: () => { throw new Error('modo privado') } },
      })
      // eslint-disable-next-line no-eval
      expect(() => eval(guionSinParpadeoDeLaBarra())).not.toThrow()
    })
  })
})

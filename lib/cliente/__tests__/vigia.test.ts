import { describe, expect, it } from 'vitest'
import {
  ESPERA_ENTRE_RECARGAS_MS,
  destinoSeguro,
  esErrorDeCodigoViejo,
  esLlamadaVigilada,
  hayVersionNueva,
  leerRespuesta,
  masImportante,
  puedeRecargarSolo,
} from '../vigia'

const ORIGEN = 'https://master.d3fbgo1omfw37o.amplifyapp.com'

describe('esLlamadaVigilada', () => {
  it('vigila las llamadas propias a /api/', () => {
    expect(esLlamadaVigilada('/api/v1/projects', ORIGEN)).toBe(true)
    expect(esLlamadaVigilada(`${ORIGEN}/api/v1/projects/1/kanban`, ORIGEN)).toBe(true)
  })

  it('no vigila NextAuth: un 401 al teclear mal la contraseña no es una sesión terminada', () => {
    expect(esLlamadaVigilada('/api/auth/callback/credentials', ORIGEN)).toBe(false)
    expect(esLlamadaVigilada('/api/auth/session', ORIGEN)).toBe(false)
  })

  it('no vigila la ruta de salud, que llama él mismo', () => {
    expect(esLlamadaVigilada('/api/v1/salud', ORIGEN)).toBe(false)
  })

  it('no vigila otros dominios ni páginas', () => {
    expect(esLlamadaVigilada('https://otro.com/api/v1/x', ORIGEN)).toBe(false)
    expect(esLlamadaVigilada('/es/projects', ORIGEN)).toBe(false)
  })
})

describe('leerRespuesta', () => {
  it('401 es la sesión; 5xx se revisa antes de afirmar nada; lo demás es de la pantalla', () => {
    expect(leerRespuesta(401)).toBe('sesion')
    expect(leerRespuesta(500)).toBe('revisar')
    expect(leerRespuesta(503)).toBe('revisar')
    expect(leerRespuesta(403)).toBeNull()
    expect(leerRespuesta(404)).toBeNull()
    expect(leerRespuesta(200)).toBeNull()
  })
})

describe('masImportante', () => {
  it('sin red pesa más que la base, la base más que la sesión, y la versión es lo último', () => {
    expect(masImportante('version', 'sesion')).toBe('sesion')
    expect(masImportante('sesion', 'base')).toBe('base')
    expect(masImportante('base', 'sinRed')).toBe('sinRed')
    expect(masImportante(null, 'version')).toBe('version')
    expect(masImportante('sesion', null)).toBe('sesion')
  })
})

describe('esErrorDeCodigoViejo', () => {
  it('reconoce cómo lo cuenta cada navegador', () => {
    expect(esErrorDeCodigoViejo('x', 'ChunkLoadError')).toBe(true)
    expect(esErrorDeCodigoViejo('Loading chunk 123 failed.')).toBe(true)
    expect(esErrorDeCodigoViejo('Failed to fetch dynamically imported module: https://x/_next/a.js')).toBe(true)
    expect(esErrorDeCodigoViejo('Importing a module script failed.')).toBe(true)
  })

  it('no confunde un error cualquiera', () => {
    expect(esErrorDeCodigoViejo('Cannot read properties of undefined')).toBe(false)
    expect(esErrorDeCodigoViejo(undefined)).toBe(false)
  })
})

describe('puedeRecargarSolo', () => {
  it('una vez, y no otra antes de un minuto: nada de bucles', () => {
    expect(puedeRecargarSolo(null, 1_000_000)).toBe(true)
    expect(puedeRecargarSolo(1_000_000, 1_000_000 + 5_000)).toBe(false)
    expect(puedeRecargarSolo(1_000_000, 1_000_000 + ESPERA_ENTRE_RECARGAS_MS)).toBe(true)
  })
})

describe('hayVersionNueva', () => {
  it('sólo cuando las dos se conocen y son distintas', () => {
    expect(hayVersionNueva('master-121', 'master-123')).toBe(true)
    expect(hayVersionNueva('master-123', 'master-123')).toBe(false)
    expect(hayVersionNueva('', 'master-123')).toBe(false)
    expect(hayVersionNueva('master-123', null)).toBe(false)
  })
})

describe('destinoSeguro', () => {
  it('acepta rutas propias', () => {
    expect(destinoSeguro('/es/projects/123?tab=gantt')).toBe('/es/projects/123?tab=gantt')
  })

  it('rechaza otros dominios y los atajos que el navegador lee como otro dominio', () => {
    expect(destinoSeguro('https://malo.com')).toBeNull()
    expect(destinoSeguro('//malo.com')).toBeNull()
    expect(destinoSeguro('/\\malo.com')).toBeNull()
  })

  it('no vuelve a la propia página de entrada', () => {
    expect(destinoSeguro('/es/auth/signin')).toBeNull()
    expect(destinoSeguro(null)).toBeNull()
  })
})

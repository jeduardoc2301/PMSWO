import { describe, expect, it } from 'vitest'

import { cabeceraDeNombre } from '../nombre-de-archivo'

/**
 * La comprobación de fondo de cada caso es siempre la misma —que `Headers` acepte el resultado—
 * porque es exactamente lo que fallaba: el constructor lanzaba y el handler devolvía 500.
 *
 * No lo detectó ninguna prueba porque todos los nombres con los que se probó eran latinos.
 */
function aceptaLaCabecera(nombre: string): boolean {
  try {
    new Headers({ 'Content-Disposition': cabeceraDeNombre(nombre, 'xlsx') })
    return true
  } catch {
    return false
  }
}

describe('la cabecera del nombre de archivo', () => {
  it.each([
    ['cirílico', 'План миграции в облако'],
    ['chino', '云迁移计划'],
    ['emoji', 'Lanzamiento 🚀 2026'],
    ['griego', 'Σχέδιο μετάβασης'],
    ['árabe', 'خطة الترحيل'],
    ['latino con punto medio', 'PDT BU V7 · Plan Integrado'],
    ['con comillas', 'Plan "definitivo"'],
    ['con barras', 'Migración BU 2026/2027'],
    ['con nulo', 'a\u0000b'],
    ['con control', 'a\u0001b'],
    ['con borrado', 'a\u007fb'],
    ['vacío', ''],
    ['sólo espacios', '   '],
  ])('%s no tumba la descarga', (_, nombre) => {
    expect(aceptaLaCabecera(nombre)).toBe(true)
  })

  it('manda el nombre completo en UTF-8 y deja un repuesto en ASCII', () => {
    const cabecera = cabeceraDeNombre('План миграции', 'xlsx')
    // Quien entienda el RFC 6266 recibe el nombre entero…
    expect(cabecera).toContain(`filename*=UTF-8''${encodeURIComponent('План миграции.xlsx')}`)
    // …y quien no, recibe algo legible en vez de nada.
    expect(cabecera).toMatch(/filename="[\x20-\x7E]+\.xlsx"/)
  })

  it('no deja que una comilla del nombre cierre el valor antes de tiempo', () => {
    const entrecomillado = /filename="([^"]*)"/.exec(cabeceraDeNombre('Plan "definitivo"', 'xlsx'))
    expect(entrecomillado).not.toBeNull()
    // La comilla ya cae en el saneado de sistema de archivos, que la cambia por un guion. Lo que
    // importa aquí no es en qué se convierte, sino que NO llegue entera al valor entrecomillado.
    expect(entrecomillado![1]).not.toContain('"')
    expect(entrecomillado![1]).toBe('Plan -definitivo-.xlsx')
  })

  it('la barra invertida tampoco sobrevive al valor entrecomillado', () => {
    // Escapa a un solo carácter: un nombre con `C:\ruta`. Estaba en el conjunto prohibido y el
    // heredoc que escribió este archivo se comió la barra, dejándola pasar sin que nadie lo viera.
    const entrecomillado = /filename="([^"]*)"/.exec(cabeceraDeNombre('Plan C:\\ruta', 'xlsx'))
    expect(entrecomillado![1]).not.toContain('\\')
  })

  it('un nombre que se queda en nada cae en un repuesto, no en «.xlsx» a secas', () => {
    expect(cabeceraDeNombre('   ', 'xlsx')).toContain('filename="archivo.xlsx"')
  })
})

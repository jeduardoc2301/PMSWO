import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Las píldoras de urgencia del Tablero se leen en los dos temas.
 *
 * ## Por qué esto se prueba, y por qué así
 *
 * Nacieron con los pasos claros de Tailwind —rose-300, amber-300, indigo-300— cuando la aplicación
 * sólo era oscura. Cuando el modo claro entró, esas etiquetas se quedaron entre **1,49:1 y 2,24:1**
 * contra el fondo: texto de estado que no se lee. Nadie se dio cuenta porque **el color no rompe
 * nada**: no hay error, no hay prueba roja, la píldora sigue ahí y sigue pulsable.
 *
 * Se lee el CSS de verdad —tokens y reglas— en vez de escribir aquí los colores esperados. Una
 * prueba con los valores copiados a mano pasaría para siempre aunque alguien cambiara la hoja de
 * estilos, que es justo el cambio que hay que vigilar.
 *
 * Y se comprueban **los dos temas**, no sólo el claro: si sólo mirara el claro, arreglarlo pisando
 * el oscuro saldría verde.
 */

const CSS = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8')

/** El bloque `{ … }` que sigue a un selector, sin las llaves. */
function bloque(selector: string): string {
  const i = CSS.indexOf(selector)
  if (i < 0) throw new Error(`no encuentro el selector ${selector}`)
  const abre = CSS.indexOf('{', i)
  const cierra = CSS.indexOf('\n}', abre)
  return CSS.slice(abre + 1, cierra)
}

function token(texto: string, nombre: string): string {
  const i = texto.indexOf(`${nombre}:`)
  if (i < 0) throw new Error(`no encuentro el token ${nombre}`)
  const fin = texto.indexOf(';', i)
  return texto.slice(i + nombre.length + 1, fin).trim()
}

type Color = readonly [number, number, number, number]

function color(crudo: string): Color {
  const t = crudo.trim()
  if (t.startsWith('#')) {
    const h = t.slice(1)
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      1,
    ]
  }
  const dentro = t.slice(t.indexOf('(') + 1, t.indexOf(')')).split(',')
  return [
    parseFloat(dentro[0]),
    parseFloat(dentro[1]),
    parseFloat(dentro[2]),
    dentro.length > 3 ? parseFloat(dentro[3]) : 1,
  ]
}

/** Lo de delante sobre lo de detrás. Sin esto, un tinte al 8 % se compararía como si fuera opaco. */
function sobre(delante: Color, detras: Color): Color {
  const a = delante[3]
  return [
    a * delante[0] + (1 - a) * detras[0],
    a * delante[1] + (1 - a) * detras[1],
    a * delante[2] + (1 - a) * detras[2],
    1,
  ]
}

function luminancia(c: Color): number {
  const [r, g, b] = [c[0], c[1], c[2]].map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste(tinta: Color, fondo: Color): number {
  const a = luminancia(tinta)
  const b = luminancia(fondo)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** El relleno que la regla de cada variante pinta: `background: rgba(...)` del propio CSS. */
function tinteDe(clase: string): Color {
  const linea = `.urgency-chip.chip-${clase} { background: `
  const i = CSS.indexOf(linea)
  if (i < 0) throw new Error(`no encuentro la regla de .chip-${clase}`)
  const desde = i + linea.length
  return color(CSS.slice(desde, CSS.indexOf(';', desde)))
}

const TEMAS = [
  { nombre: 'oscuro', selector: ':root {' },
  { nombre: 'claro', selector: ":root[data-theme='claro'] {" },
] as const

const VARIANTES = [
  { clase: 'overdue', tono: 'rosa' },
  { clase: 'blocked', tono: 'rosa' },
  { clase: 'soon', tono: 'ambar' },
  { clase: 'stale', tono: 'indigo' },
] as const

/** AA para texto normal. Las píldoras van a 11 px, así que no vale el 3:1 del texto grande. */
const AA = 4.5

describe('Las píldoras de urgencia del Tablero se leen en los dos temas', () => {
  for (const tema of TEMAS) {
    describe(`tema ${tema.nombre}`, () => {
      const b = bloque(tema.selector)
      const pagina = color(token(b, '--background'))
      const fondoDelChip = sobre(color(token(b, '--chip-fondo')), pagina)

      it('la píldora sin urgencia', () => {
        expect(contraste(color(token(b, '--chip-tinta')), fondoDelChip)).toBeGreaterThanOrEqual(AA)
      })

      it('su cuenta', () => {
        const fondo = sobre(color(token(b, '--chip-cuenta-fondo')), fondoDelChip)
        expect(contraste(color(token(b, '--chip-cuenta-tinta')), fondo)).toBeGreaterThanOrEqual(AA)
      })

      for (const v of VARIANTES) {
        const fondo = sobre(tinteDe(v.clase), pagina)

        it(`«${v.clase}», la etiqueta`, () => {
          expect(contraste(color(token(b, `--chip-${v.tono}`)), fondo)).toBeGreaterThanOrEqual(AA)
        })

        it(`«${v.clase}», su cuenta`, () => {
          const fondoCuenta = sobre(color(`rgba(0,0,0,0)`), fondo)
          expect(
            contraste(color(token(b, `--chip-${v.tono}-cuenta`)), fondoCuenta),
          ).toBeGreaterThanOrEqual(AA)
        })

        it(`«${v.clase}», elegida — el blanco sobre el relleno`, () => {
          const activo = sobre(color(token(b, `--chip-${v.tono}-activo`)), pagina)
          expect(contraste([255, 255, 255, 1], activo)).toBeGreaterThanOrEqual(AA)
        })
      }
    })
  }
})

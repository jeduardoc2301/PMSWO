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

/**
 * El relleno que pinta una regla: el `background:` del propio CSS, no un valor copiado aquí.
 *
 * Busca el `background:` que sigue al selector en vez de exigir un formato exacto: las reglas del
 * archivo alinean las llaves con varios espacios, y una prueba que dependa de cuántos son se rompe
 * el día que alguien pase un formateador.
 */
function fondoDeLaRegla(selector: string): Color {
  // A principio de línea, que es donde vive una regla. Buscarlo suelto encontraba la **prosa**: un
  // comentario de `globals.css` nombra `.pms-status-PLANNING` para explicar una deriva, y la prueba
  // se iba a leer el fondo de otra regla cualquiera. Dio 1,86:1 de un sitio que nadie pinta.
  const i = CSS.indexOf(String.fromCharCode(10) + selector)
  if (i < 0) throw new Error(`no encuentro la regla de ${selector}`)
  const j = CSS.indexOf('background:', i)
  if (j < 0) throw new Error(`${selector} no pinta ningún fondo`)
  const desde = j + 'background:'.length
  return color(CSS.slice(desde, CSS.indexOf(';', desde)))
}

const TEMAS = [
  { nombre: 'oscuro', selector: ':root {' },
  { nombre: 'claro', selector: ":root[data-theme='claro'] {" },
] as const

/** Las pastillas de estado de proyecto. Identidad, no severidad: por eso llevan tokens propios. */
const PASTILLAS = [
  { clase: 'ACTIVE', token: 'activo' },
  { clase: 'PLANNING', token: 'plan' },
  { clase: 'ON_HOLD', token: 'espera' },
  { clase: 'COMPLETED', token: 'hecho' },
  { clase: 'ARCHIVED', token: 'archivado' },
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
        const fondo = sobre(fondoDeLaRegla(`.urgency-chip.chip-${v.clase}`), pagina)

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

      for (const pastilla of PASTILLAS) {
        it(`la pastilla «${pastilla.clase}»`, () => {
          const fondo = sobre(fondoDeLaRegla(`.pms-status-${pastilla.clase}`), pagina)
          const tinta = color(token(b, `--pastilla-${pastilla.token}`))
          expect(contraste(tinta, fondo)).toBeGreaterThanOrEqual(AA)
        })
      }
    })
  }
})

/**
 * El mapa en línea de la ficha del proyecto.
 *
 * No basta con mirar `globals.css`: la ficha lleva **su propia copia** de la paleta de estados, y es
 * la que se pinta en esa pantalla. Arreglar la clase y no el mapa fue exactamente lo que pasó — la
 * medición seguía dando 1,25:1 con el CSS ya corregido, porque el distintivo va con estilo en línea.
 *
 * Se lee el TSX de verdad por la misma razón que el CSS: una lista de colores copiada aquí pasaría
 * para siempre aunque el componente cambiara.
 */
const FICHA = readFileSync(
  join(process.cwd(), 'app', '[locale]', 'projects', '[id]', 'project-detail-client.tsx'),
  'utf8',
)

function entradaDelMapa(clave: string): { fondo: string; tinta: string } {
  const i = FICHA.indexOf(`  ${clave}:`)
  if (i < 0) throw new Error(`no encuentro ${clave} en el mapa de la ficha`)
  const linea = FICHA.slice(i, FICHA.indexOf(String.fromCharCode(10), i))
  const trozo = (campo: string) => {
    const j = linea.indexOf(`${campo}: '`)
    if (j < 0) throw new Error(`${clave} no tiene ${campo}`)
    const desde = j + campo.length + 3
    return linea.slice(desde, linea.indexOf("'", desde))
  }
  return { fondo: trozo('bg'), tinta: trozo('color') }
}

/** Un color que puede venir como `var(--token)`: se resuelve contra el bloque del tema. */
function resuelto(crudo: string, bloqueDelTema: string): Color {
  const t = crudo.trim()
  if (!t.startsWith('var(')) return color(t)
  const nombre = t.slice(4, t.indexOf(')')).trim()
  return color(token(bloqueDelTema, nombre))
}

describe('El mapa de estados de la ficha del proyecto se lee en los dos temas', () => {
  for (const tema of TEMAS) {
    const b = bloque(tema.selector)
    const pagina = color(token(b, '--background'))
    for (const clave of ['ACTIVE', 'PLANNING', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']) {
      it(`${tema.nombre} · «${clave}»`, () => {
        const e = entradaDelMapa(clave)
        const fondo = sobre(color(e.fondo), pagina)
        expect(contraste(resuelto(e.tinta, b), fondo)).toBeGreaterThanOrEqual(AA)
      })
    }
  }
})

/**
 * Las tarjetas del Tablero con urgencia, contra la tinta que llevan encima.
 *
 * Esto no es un matiz: la capa de abajo iba con `#18181b` a pelo y en claro dejaba la tarjeta casi
 * negra mientras el título usaba `--tinta`, que en claro **es ese mismo color**. Título invisible,
 * 1,00:1 — y sólo en las tarjetas con urgencia, o sea las vencidas y las bloqueadas.
 *
 * Se comprueba la capa sólida, no el degradado de encima: es la que decide si se lee o no.
 */
const TARJETAS = ['kc-overdue', 'kc-soon', 'kc-stale', 'kc-blocked'] as const

/** La última capa del atajo `background`: la sólida, detrás de los degradados. */
function capaSolida(clase: string): string {
  const i = CSS.indexOf(String.fromCharCode(10) + '.' + clase)
  if (i < 0) throw new Error(`no encuentro la regla de .${clase}`)
  const j = CSS.indexOf('background:', i)
  const valor = CSS.slice(j + 'background:'.length, CSS.indexOf(';', j))
  const k = valor.lastIndexOf('), ')
  const cola = k < 0 ? valor : valor.slice(k + 3)
  return cola.split('!important')[0].trim()
}

describe('Las tarjetas con urgencia del Tablero se leen en los dos temas', () => {
  for (const tema of TEMAS) {
    const b = bloque(tema.selector)
    for (const clase of TARJETAS) {
      it(`${tema.nombre} · .${clase}`, () => {
        const fondo = resuelto(capaSolida(clase), b)
        expect(contraste(color(token(b, '--tinta')), fondo)).toBeGreaterThanOrEqual(AA)
      })
    }
  }
})

/**
 * Todo par «fondo + tinta» del Tablero, barrido del archivo.
 *
 * En vez de una lista de casos escrita a mano, se recorre `kanban-board.tsx` buscando cada línea que
 * ponga un fondo y una tinta a la vez. Así cubre también lo que se añada mañana: un distintivo nuevo
 * con un color crudo entra en la prueba sin que nadie se acuerde de apuntarlo.
 *
 * Sólo mira las tintas por token. Una tinta en crudo no se puede resolver por tema —es la misma en
 * los dos— y por eso el barrido de pantalla sigue haciendo falta: esto vigila lo migrado.
 */
const TABLERO = readFileSync(
  join(process.cwd(), 'components', 'projects', 'kanban-board.tsx'),
  'utf8',
)

function paresDelTablero(): Array<{ linea: number; fondo: string; tinta: string }> {
  const salida: Array<{ linea: number; fondo: string; tinta: string }> = []
  const lineas = TABLERO.split(String.fromCharCode(10))
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]
    const c = l.indexOf("color: 'var(--")
    if (c < 0) continue
    const marca = l.indexOf("background: '") >= 0 ? "background: '" : "bg: '"
    const f = l.indexOf(marca)
    if (f < 0) continue
    const fondo = l.slice(f + marca.length, l.indexOf("'", f + marca.length))
    const tinta = l.slice(c + "color: '".length, l.indexOf("'", c + "color: '".length))
    salida.push({ linea: i + 1, fondo, tinta })
  }
  return salida
}

describe('Los distintivos del Tablero se leen en los dos temas', () => {
  const pares = paresDelTablero()

/**
 * En el Tablero ya no queda ninguna tinta escrita en crudo.
 *
 * El barrido de pares de arriba comprueba que lo migrado se lee; esto comprueba que no queda nada
 * **sin** migrar. Son cosas distintas: un color nuevo escrito a mano pasaría el primero sin
 * enterarse, porque el primero sólo mira lo que ya usa `var(--...)`.
 */
it('kanban-board.tsx no escribe ninguna tinta en crudo', () => {
  expect(TABLERO.indexOf("color: '#")).toBe(-1)
})

  it('el barrido encuentra pares que revisar', () => {
    // Si un refactor cambia la forma de escribirlos, esta prueba se queda sin nada que mirar y
    // pasaría vacía para siempre. Mejor que avise.
    expect(pares.length).toBeGreaterThanOrEqual(6)
  })

  for (const tema of TEMAS) {
    const b = bloque(tema.selector)
    const pagina = color(token(b, '--background'))
    for (const par of pares) {
      it(`${tema.nombre} · línea ${par.linea} · ${par.tinta}`, () => {
        const fondo = sobre(color(par.fondo), sobre(color(token(b, '--superficie')), pagina))
        expect(contraste(resuelto(par.tinta, b), fondo)).toBeGreaterThanOrEqual(AA)
      })
    }
  }
})

/**
 * La tinta de lo que va ENCIMA de un relleno de acento.
 *
 * El botón elegido de los conmutadores segmentados —«Todo», «Esquema», «Todas»— usaba `--tinta`, que
 * es la tinta de la página. En oscuro es casi blanca y salía bien sobre el índigo **por casualidad**;
 * en claro es casi negra y el botón que dice dónde estás quedaba a 2,82:1.
 *
 * Un token equivocado no se ve leyendo el componente: `text-tinta` parece de lo más razonable. Sólo
 * se ve midiendo, o comprobando aquí que la pareja concreta —tinta sobre relleno— se lee.
 *
 * Se mide contra `--acento-relleno` y no contra `--acento` porque el botón usaba **ese otro** mal: el
 * acento de TEXTO como fondo. En oscuro vale #6366f1 y el blanco encima da 4,47 — por debajo de AA
 * por poco. `--acento-relleno` existe desde antes y se llama así por algo.
 */
describe('La tinta sobre el relleno de acento se lee en los dos temas', () => {
  for (const tema of TEMAS) {
    it(`tema ${tema.nombre}`, () => {
      const b = bloque(tema.selector)
      const relleno = color(token(b, '--acento-relleno'))
      expect(contraste(color(token(b, '--sobre-acento')), relleno)).toBeGreaterThanOrEqual(AA)
    })

    it(`tema ${tema.nombre} · y la de la página NO servía, que es el defecto`, () => {
      const b = bloque(tema.selector)
      const relleno = color(token(b, '--acento-relleno'))
      const conLaDeLaPagina = contraste(color(token(b, '--tinta')), relleno)
      const conLaBuena = contraste(color(token(b, '--sobre-acento')), relleno)
      expect(conLaBuena).toBeGreaterThanOrEqual(conLaDeLaPagina)
    })
  }
})

/**
 * Que nadie vuelva a escribir la tinta de la página encima de un relleno de acento.
 *
 * El defecto no fue un color malo: fueron **dos tokens buenos mal emparejados**. Eso no lo caza una
 * prueba de valores, porque los valores están bien cada uno por su lado. Se caza mirando la pareja.
 */
const CONMUTADORES = [
  ['components', 'plan', 'plan-controls.tsx'],
  ['components', 'projects', 'work-items-view.tsx'],
] as const

describe('Los conmutadores segmentados no visten su relleno con la tinta de la página', () => {
  for (const ruta of CONMUTADORES) {
    it(ruta[ruta.length - 1], () => {
      const texto = readFileSync(join(process.cwd(), ...ruta), 'utf8')
      const lineas = texto.split(String.fromCharCode(10))
      const sospechosas = lineas.filter((l) => l.indexOf('bg-acento') >= 0 && l.indexOf('text-tinta') >= 0)
      expect(sospechosas).toEqual([])

      const rellenos = lineas.filter((l) => l.indexOf('bg-acento-relleno') >= 0)
      expect(rellenos.length).toBeGreaterThanOrEqual(1)
      for (const l of rellenos) expect(l).toContain('text-sobre-acento')
    })
  }
})

/**
 * Las tres tintas contra las cuatro superficies, en los dos temas.
 *
 * Un token puede cumplir contra el fondo de la página y fallar donde de verdad se usa: `--tinta-3`
 * daba 4,52 sobre `--background` y **4,18** sobre `--superficie-3`, que es la superficie más oscura
 * del tema claro y donde se apoya la miga de navegación. Medir contra el fondo de página y darlo por
 * bueno es medir el caso fácil.
 *
 * Por eso se prueban todas las parejas: el caso peor es el que manda, y cuál es el peor depende del
 * tema —en claro la superficie más oscura, en oscuro la más clara—, así que no se elige a mano.
 */
const TINTAS = ['--tinta', '--tinta-2', '--tinta-3'] as const
const SUPERFICIES = ['--background', '--superficie', '--superficie-2', '--superficie-3'] as const

describe('Las tintas se leen sobre todas las superficies', () => {
  for (const tema of TEMAS) {
    const b = bloque(tema.selector)
    for (const tinta of TINTAS) {
      for (const superficie of SUPERFICIES) {
        it(`${tema.nombre} · ${tinta} sobre ${superficie}`, () => {
          const c = contraste(color(token(b, tinta)), color(token(b, superficie)))
          expect(c).toBeGreaterThanOrEqual(AA)
        })
      }
    }
  }
})

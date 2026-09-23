import { describe, expect, it } from 'vitest'

import { buscarLineas, normalizar, prepararOpciones, resaltar, type LineaBuscable } from '../buscar-linea'

/**
 * Buscar la línea a la que se le cuelga un bloqueo.
 *
 * Los casos salen del plan real: 1 368 líneas, once olas, y el mismo título repetido una vez por
 * ola. El selector de antes era un desplegable alfabético con sólo el título, y en él las once
 * «Solicitar reglas en el firewall perimetral» eran once renglones idénticos.
 */

const HOY = new Date(2026, 8, 22) // 22 de septiembre, medianoche local

function linea(over: Partial<LineaBuscable> & { id: string; title: string }): LineaBuscable {
  return { status: 'TODO', progressPct: 0, estimatedEndDate: '2026-12-01', ...over }
}

/** Dos olas con la misma actividad adentro, que es lo que hacía imposible elegir. */
const PLAN: LineaBuscable[] = [
  linea({ id: 'ola2', title: 'Ola 2 QA - 11 servidores', templateOrder: 1 }),
  linea({ id: 'red2', title: 'Preparar la red de la ola', parentId: 'ola2', templateOrder: 2 }),
  linea({ id: 'fw2', title: 'Solicitar reglas en el firewall perimetral', parentId: 'red2', templateOrder: 3, estimatedEndDate: '2026-09-10' }),
  linea({ id: 'ola3', title: 'Ola 3 QA/DEV - 12 servidores', templateOrder: 4 }),
  linea({ id: 'red3', title: 'Preparar la red de la ola', parentId: 'ola3', templateOrder: 5 }),
  linea({ id: 'fw3', title: 'Solicitar reglas en el firewall perimetral', parentId: 'red3', templateOrder: 6, estimatedEndDate: '2026-09-17' }),
  linea({ id: 'mig', title: 'Migración de las bases de datos', templateOrder: 7 }),
  linea({ id: 'reg', title: 'Revisar el registro de cambios', templateOrder: 8, estimatedEndDate: '2026-09-01', status: 'DONE', progressPct: 1 }),
]

const OPCIONES = prepararOpciones(PLAN, HOY)
const ids = (r: { opciones: readonly { id: string }[] }) => r.opciones.map((o) => o.id)

describe('las líneas con el mismo título se distinguen', () => {
  it('cada una lleva la ruta de sus ancestros', () => {
    const fw3 = OPCIONES.find((o) => o.id === 'fw3')!
    expect(fw3.ruta).toEqual(['Ola 3 QA/DEV - 12 servidores', 'Preparar la red de la ola'])
  })

  it('«firewall ola 3» encuentra sólo la de la Ola 3', () => {
    // El caso exacto que el desplegable no podía resolver: once renglones iguales.
    expect(ids(buscarLineas(OPCIONES, 'firewall ola 3'))).toEqual(['fw3'])
  })

  it('el orden de las palabras no importa', () => {
    expect(ids(buscarLineas(OPCIONES, 'ola 3 firewall'))).toEqual(['fw3'])
  })

  it('un número se busca entero: el «3» no coincide con «13 servidores»', () => {
    // Se vio en la vista previa: «firewall ola 3» devolvía también la Ola 4, porque su nombre dice
    // «13 servidores» y el 3 se buscaba como subcadena.
    const plan = prepararOpciones(
      [
        linea({ id: 'o3', title: 'Ola 3 QA/DEV - 12 servidores', templateOrder: 1 }),
        linea({ id: 'f3', title: 'Solicitar reglas en el firewall', parentId: 'o3', templateOrder: 2 }),
        linea({ id: 'o4', title: 'Ola 4 PROD - 13 servidores', templateOrder: 3 }),
        linea({ id: 'f4', title: 'Solicitar reglas en el firewall', parentId: 'o4', templateOrder: 4 }),
        linea({ id: 'o30', title: 'Ola 30', templateOrder: 5 }),
        linea({ id: 'f30', title: 'Solicitar reglas en el firewall', parentId: 'o30', templateOrder: 6 }),
      ],
      HOY
    )
    expect(ids(buscarLineas(plan, 'firewall ola 3'))).toEqual(['f3'])
  })

  it('las letras sí se buscan dentro de la palabra: «wall» encuentra «firewall»', () => {
    expect(ids(buscarLineas(OPCIONES, 'wall'))).toEqual(['fw2', 'fw3'])
  })

  it('sin la ola, salen las dos, en el orden del plan', () => {
    expect(ids(buscarLineas(OPCIONES, 'firewall'))).toEqual(['fw2', 'fw3'])
  })
})

describe('la búsqueda perdona acentos y mayúsculas', () => {
  it('«migracion» encuentra «Migración»', () => {
    expect(ids(buscarLineas(OPCIONES, 'migracion'))).toEqual(['mig'])
  })

  it('«MIGRACIÓN» también', () => {
    expect(ids(buscarLineas(OPCIONES, 'MIGRACIÓN'))).toEqual(['mig'])
  })

  it('normalizar quita tildes y baja a minúsculas', () => {
    expect(normalizar('Migración ÁÉÍÓÚ Ñ')).toBe('migracion aeiou n')
  })
})

describe('el orden de los resultados', () => {
  it('lo que coincide en el título va antes que lo que sólo coincide en la ruta', () => {
    // «red» aparece en el TÍTULO de red2/red3 y sólo en la RUTA de fw2/fw3. Buscar «red» tiene que
    // poner primero las líneas que hablan de la red.
    const r = ids(buscarLineas(OPCIONES, 'red'))
    expect(r.slice(0, 2).sort()).toEqual(['red2', 'red3'])
    expect(r.slice(2).sort()).toEqual(['fw2', 'fw3'])
  })

  it('las ejecutables van antes que los grupos cuando las dos coinciden en el título', () => {
    const plan = prepararOpciones(
      [
        linea({ id: 'grupo', title: 'Construir la red', templateOrder: 1 }),
        linea({ id: 'hoja', title: 'Construir la red de tránsito', parentId: 'grupo', templateOrder: 2 }),
      ],
      HOY
    )
    expect(ids(buscarLineas(plan, 'construir red'))).toEqual(['hoja', 'grupo'])
  })

  it('las terminadas van al final', () => {
    const plan = prepararOpciones(
      [
        linea({ id: 'hecha', title: 'Revisar la red', templateOrder: 1, status: 'DONE', progressPct: 1 }),
        linea({ id: 'abierta', title: 'Revisar la red', templateOrder: 2 }),
      ],
      HOY
    )
    expect(ids(buscarLineas(plan, 'revisar'))).toEqual(['abierta', 'hecha'])
  })

  it('el orden de base es el del plan, no el alfabético', () => {
    // El desplegable de antes ordenaba por título: «[Banco]…» arriba y lo que en el plan está junto,
    // a cientos de renglones de distancia.
    const plan = prepararOpciones(
      [
        linea({ id: 'z', title: 'Zeta', templateOrder: 1 }),
        linea({ id: 'a', title: 'Alfa', templateOrder: 2 }),
      ],
      HOY
    )
    expect(plan.map((o) => o.id)).toEqual(['z', 'a'])
  })
})

describe('sin escribir nada', () => {
  it('sugiere las atrasadas, de la más antigua a la más reciente', () => {
    // Un bloqueo casi siempre explica trabajo que ya va tarde.
    const r = buscarLineas(OPCIONES, '')
    expect(r.sonSugerencias).toBe(true)
    expect(ids(r)).toEqual(['fw2', 'fw3'])
  })

  it('no sugiere lo terminado aunque su fecha haya pasado', () => {
    expect(ids(buscarLineas(OPCIONES, ''))).not.toContain('reg')
  })

  it('no marca como atrasada una línea de agrupación', () => {
    // Su fecha es el envoltorio de las de abajo; el atraso real está en sus hijas.
    const plan = prepararOpciones(
      [
        linea({ id: 'grupo', title: 'Grupo', estimatedEndDate: '2026-09-01' }),
        linea({ id: 'hoja', title: 'Hoja', parentId: 'grupo', estimatedEndDate: '2026-12-01' }),
      ],
      HOY
    )
    expect(plan.find((o) => o.id === 'grupo')!.atrasada).toBe(false)
  })

  it('lo que vence hoy todavía no está atrasado', () => {
    const plan = prepararOpciones([linea({ id: 'hoy', title: 'Hoy', estimatedEndDate: '2026-09-22' })], HOY)
    expect(plan[0].atrasada).toBe(false)
  })

  it('ofrece como mucho ocho, aunque haya más', () => {
    const muchas = prepararOpciones(
      Array.from({ length: 20 }, (_, i) =>
        linea({ id: `a${i}`, title: `Atrasada ${i}`, templateOrder: i, estimatedEndDate: '2026-08-01' })
      ),
      HOY
    )
    const r = buscarLineas(muchas, '')
    expect(r.opciones).toHaveLength(8)
    expect(r.total).toBe(20)
  })
})

describe('los límites', () => {
  it('recorta a lo que cabe en pantalla, pero cuenta todas', () => {
    const muchas = prepararOpciones(
      Array.from({ length: 120 }, (_, i) => linea({ id: `l${i}`, title: `Servidor ${i}`, templateOrder: i })),
      HOY
    )
    const r = buscarLineas(muchas, 'servidor')
    expect(r.opciones).toHaveLength(50)
    expect(r.total).toBe(120)
  })

  it('un ciclo en la jerarquía no cuelga la pantalla', () => {
    // Si la base trae un ciclo por error, la ruta queda incompleta en vez de entrar en un bucle.
    const plan = prepararOpciones(
      [linea({ id: 'a', title: 'A', parentId: 'b' }), linea({ id: 'b', title: 'B', parentId: 'a' })],
      HOY
    )
    expect(plan).toHaveLength(2)
  })

  it('una consulta que no coincide con nada devuelve cero, no las sugerencias', () => {
    const r = buscarLineas(OPCIONES, 'kubernetes')
    expect(r.sonSugerencias).toBe(false)
    expect(r.total).toBe(0)
  })
})

describe('el resaltado', () => {
  it('marca la coincidencia en su posición real aunque haya acentos antes', () => {
    // Normalizar la cadena entera correría las posiciones; se normaliza carácter por carácter.
    const trozos = resaltar('Migración de bases', 'bases')
    expect(trozos.filter((t) => t.coincide).map((t) => t.texto)).toEqual(['bases'])
    expect(trozos.map((t) => t.texto).join('')).toBe('Migración de bases')
  })

  it('marca también cuando se busca sin tilde una palabra que la lleva', () => {
    const trozos = resaltar('Migración', 'migracion')
    expect(trozos).toEqual([{ texto: 'Migración', coincide: true }])
  })

  it('un número sólo se marca donde aparece entero', () => {
    const marcados = resaltar('Ola 3 · 13 servidores', '3')
      .filter((t) => t.coincide)
      .map((t) => t.texto)
    expect(marcados).toEqual(['3'])
    // Y ese 3 es el de «Ola 3», no el de «13».
    expect(resaltar('Ola 3 · 13 servidores', '3').map((t) => t.texto).join('')).toBe('Ola 3 · 13 servidores')
    expect(resaltar('13 servidores', '3').every((t) => !t.coincide)).toBe(true)
  })

  it('sin consulta devuelve el texto entero sin marcar', () => {
    expect(resaltar('Texto', '')).toEqual([{ texto: 'Texto', coincide: false }])
  })
})

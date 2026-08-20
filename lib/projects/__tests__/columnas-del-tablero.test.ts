import { describe, expect, it } from 'vitest'

import {
  type ColumnaDelTablero,
  avisoDeBorrado,
  destinosPosibles,
  hayQuePreguntarDestino,
  ordenTrasMover,
  porQueNoEsUnOrdenValido,
  porQueNoSePuedeBorrar,
} from '../columnas-del-tablero'

/**
 * Las reglas de las columnas del tablero (§5, §5.5).
 *
 * Son las mismas que aplica el servidor, y por eso se prueban aquí: que la pantalla ofrezca lo que
 * el servidor rechaza es la forma más barata de que alguien pierda un minuto averiguando por qué un
 * botón no hace nada.
 */

const col = (sobre: Partial<ColumnaDelTablero> & Pick<ColumnaDelTablero, 'id'>): ColumnaDelTablero => ({
  nombre: 'Por hacer',
  orden: 1,
  esInicial: false,
  esTerminado: false,
  tarjetas: 0,
  ...sobre,
})

const TABLERO = [
  col({ id: 'a', nombre: 'Backlog', orden: 0, esInicial: true }),
  col({ id: 'b', nombre: 'En curso', orden: 1, tarjetas: 30 }),
  col({ id: 'c', nombre: 'Terminado', orden: 2, esTerminado: true }),
]

describe('Las dos columnas que no se pueden quedar sin dueño', () => {
  it('la inicial no se borra: es donde nacen las tareas', () => {
    // Sin ella, crear una tarea fallaría, y el fallo aparecería mucho después de la decisión.
    expect(porQueNoSePuedeBorrar(TABLERO[0]!, TABLERO)).toContain('nacen las tareas')
  })

  it('la de terminado tampoco: de ella depende el avance al 100 %', () => {
    expect(porQueNoSePuedeBorrar(TABLERO[2]!, TABLERO)).toContain('avance al 100')
  })

  it('una columna corriente sí', () => {
    expect(porQueNoSePuedeBorrar(TABLERO[1]!, TABLERO)).toBeNull()
  })

  it('y la última que quede, no: un tablero sin columnas no es un tablero', () => {
    const sola = [col({ id: 'z', nombre: 'La única' })]
    expect(porQueNoSePuedeBorrar(sola[0]!, sola)).toContain('no es un tablero')
  })
})

describe('A dónde van las tarjetas', () => {
  it('se pregunta sólo si las tiene', () => {
    // Preguntar por una columna vacía es un paso de más en el caso corriente —limpiar una columna
    // que sobra— y los pasos de más se acaban pulsando sin leer.
    expect(hayQuePreguntarDestino(TABLERO[1]!)).toBe(true)
    expect(hayQuePreguntarDestino(TABLERO[0]!)).toBe(false)
  })

  it('el destino puede ser cualquier otra, nunca ella misma', () => {
    const destinos = destinosPosibles(TABLERO[1]!, TABLERO).map((c) => c.id)
    expect(destinos).toEqual(['a', 'c'])
  })
})

describe('Lo que se avisa antes de borrar', () => {
  it('con tarjetas dentro, dice cuántas', () => {
    // «Borrar» sobre una columna vacía y sobre una con treinta tareas son dos decisiones distintas,
    // y la única forma de distinguirlas es el número.
    expect(avisoDeBorrado(TABLERO[1]!)).toContain('30 tarjetas')
  })

  it('con destino elegido, dice a dónde van', () => {
    expect(avisoDeBorrado(TABLERO[1]!, TABLERO[0]!)).toContain('a «Backlog»')
  })

  it('vacía, lo dice y ya', () => {
    expect(avisoDeBorrado(TABLERO[0]!)).toContain('está vacía')
  })

  it('una sola tarjeta se dice en singular', () => {
    expect(avisoDeBorrado(col({ id: 'x', nombre: 'Una', tarjetas: 1 }))).toContain('1 tarjeta.')
  })
})

describe('Una respuesta rara no tira la pantalla', () => {
  it('las reglas aguantan una lista vacía', () => {
    // Es el caso de un proyecto recién creado, y también el de una respuesta a medias: ninguna de
    // las dos cosas puede reventar la pestaña del tablero.
    const sola = col({ id: 'x' })
    expect(porQueNoSePuedeBorrar(sola, [])).toContain('no es un tablero')
    expect(destinosPosibles(sola, [])).toEqual([])
  })
})

describe('§5 · reordenar las columnas', () => {
  const TABLERO = [
    col({ id: 'a', nombre: 'Backlog', orden: 0, esInicial: true }),
    col({ id: 'b', nombre: 'En curso', orden: 1 }),
    col({ id: 'c', nombre: 'Revisión', orden: 2 }),
    col({ id: 'd', nombre: 'Hecho', orden: 3, esTerminado: true }),
  ]

  it('subir una columna la intercambia con la de arriba', () => {
    expect(ordenTrasMover(TABLERO, 'c', 'ARRIBA')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('bajarla, con la de abajo', () => {
    expect(ordenTrasMover(TABLERO, 'b', 'ABAJO')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('devuelve la lista ENTERA, no sólo la que se movió', () => {
    // Es lo que hace posible la operación: el índice único obliga al servidor a recolocarlas todas,
    // así que dárselas ya ordenadas le ahorra adivinar qué hacer con la que ocupaba el puesto.
    expect(ordenTrasMover(TABLERO, 'a', 'ABAJO')).toHaveLength(TABLERO.length)
  })

  it('la primera no sube y la última no baja: devuelve null, no la misma lista', () => {
    // Distinguir «no se movió» de «se movió y quedó igual» importa para la pantalla y para deshacer.
    expect(ordenTrasMover(TABLERO, 'a', 'ARRIBA')).toBeNull()
    expect(ordenTrasMover(TABLERO, 'd', 'ABAJO')).toBeNull()
  })

  it('una columna que no es del tablero devuelve null en vez de reventar', () => {
    expect(ordenTrasMover(TABLERO, 'no-existe', 'ARRIBA')).toBeNull()
  })

  it('ordena por el campo orden, no por cómo venga el array', () => {
    // El servidor devuelve ordenado, pero una pantalla que filtre o reordene por otra cosa no debe
    // cambiar lo que significa «arriba».
    const revuelto = [TABLERO[2], TABLERO[0], TABLERO[3], TABLERO[1]]
    expect(ordenTrasMover(revuelto, 'c', 'ARRIBA')).toEqual(['a', 'c', 'b', 'd'])
  })

  it('mover la inicial o la de terminado se permite: su puesto no es su papel', () => {
    // La protegida es contra el BORRADO, no contra el orden. Un tablero que empieza por «Hecho» es
    // raro, pero es una decisión de quien lo lleva, no un estado imposible.
    expect(ordenTrasMover(TABLERO, 'd', 'ARRIBA')).toEqual(['a', 'b', 'd', 'c'])
  })
})

describe('§5 · qué órdenes admite el servidor', () => {
  const TABLERO = [
    col({ id: 'a', orden: 0 }),
    col({ id: 'b', orden: 1 }),
    col({ id: 'c', orden: 2 }),
  ]

  it('la lista completa y sin repetir, sí', () => {
    expect(porQueNoEsUnOrdenValido(TABLERO, ['c', 'a', 'b'])).toBeNull()
  })

  it('vacía, no', () => {
    expect(porQueNoEsUnOrdenValido(TABLERO, [])).toContain('ninguna columna')
  })

  it('con una repetida, no', () => {
    expect(porQueNoEsUnOrdenValido(TABLERO, ['a', 'a', 'b'])).toContain('repetida')
  })

  it('con una que no es del tablero, no, y la nombra', () => {
    expect(porQueNoEsUnOrdenValido(TABLERO, ['a', 'b', 'zzz'])).toContain('zzz')
  })

  it('incompleta, no — y ésta es la que importa', () => {
    /**
     * Con una lista parcial, la segunda vuelta del corrimiento dejaría a las que faltan en su puesto
     * viejo y a las enviadas encima: choque de clave única a mitad de la transacción, o —peor— una
     * columna abandonada en un puesto negativo, que el tablero dibujaría antes que todas para
     * siempre.
     */
    const motivo = porQueNoEsUnOrdenValido(TABLERO, ['a', 'b'])
    expect(motivo).toContain('2')
    expect(motivo).toContain('3')
  })
})

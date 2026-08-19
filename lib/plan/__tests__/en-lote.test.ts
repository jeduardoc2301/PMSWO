import { describe, expect, it, vi } from 'vitest'

import { aplicarEnLote, contarLoQuePaso } from '../en-lote'

/**
 * Operaciones en lote (§4.6, conmutador 1).
 *
 * El caso que decide el diseño: cincuenta líneas seleccionadas y la veintitrés falla. Parar y dejar
 * veintidós movidas en silencio es lo que sale solo si nadie piensa en esto, y es lo peor de las
 * tres opciones. Aquí se sigue y se cuenta exactamente qué pasó.
 */

describe('Aplicar a varias líneas', () => {
  it('las recorre en orden', () => {
    const vistas: string[] = []
    return aplicarEnLote(['a', 'b', 'c'], async (id) => {
      vistas.push(id)
    }).then(() => {
      expect(vistas).toEqual(['a', 'b', 'c'])
    })
  })

  it('cuando todas van bien, lo dice', async () => {
    const r = await aplicarEnLote(['a', 'b'], async () => {})
    expect(r).toMatchObject({ total: 2, bien: 2, mal: 0, completo: true })
  })

  it('NO se detiene cuando una falla', async () => {
    // Las operaciones de este módulo son independientes: mover la 24 no depende de que se moviera
    // la 23. Parar dejaría el resto sin intentar por una razón que no existe.
    const vistas: string[] = []
    const r = await aplicarEnLote(['a', 'mala', 'c'], async (id) => {
      vistas.push(id)
      if (id === 'mala') throw new Error('No se pudo')
    })
    expect(vistas).toEqual(['a', 'mala', 'c'])
    expect(r).toMatchObject({ bien: 2, mal: 1, completo: false })
  })

  it('guarda el motivo de cada fallo', async () => {
    const r = await aplicarEnLote(['mala'], async () => {
      throw new Error('Eso haría un ciclo')
    })
    expect(r.resultados[0]).toMatchObject({ id: 'mala', bien: false, motivo: 'Eso haría un ciclo' })
  })

  it('un fallo sin mensaje también se cuenta', async () => {
    const r = await aplicarEnLote(['x'], async () => {
      throw 'algo'
    })
    expect(r.resultados[0]!.motivo).toBe('Falló sin motivo.')
  })

  it('avisa del avance en cada línea', async () => {
    // Una operación de cincuenta líneas tarda segundos, y una pantalla quieta durante segundos
    // parece rota.
    const avances: number[] = []
    await aplicarEnLote(['a', 'b', 'c'], async () => {}, (hechas) => avances.push(hechas))
    expect(avances).toEqual([1, 2, 3])
  })

  it('de una en una, no todas a la vez', async () => {
    // Cincuenta escrituras simultáneas sobre el mismo plan compiten por las mismas filas, y el
    // servidor reprograma en cada una. En serie es la única forma de que repetir dé lo mismo.
    let simultaneas = 0
    let maximo = 0
    await aplicarEnLote(['a', 'b', 'c'], async () => {
      simultaneas += 1
      maximo = Math.max(maximo, simultaneas)
      await Promise.resolve()
      simultaneas -= 1
    })
    expect(maximo).toBe(1)
  })

  it('sin líneas no llama a nadie y sale completo', async () => {
    const op = vi.fn()
    const r = await aplicarEnLote([], op)
    expect(op).not.toHaveBeenCalled()
    expect(r.completo).toBe(true)
  })
})

describe('Contarlo como se le cuenta a una persona', () => {
  const resumen = (bien: number, total: number) => ({
    total,
    bien,
    mal: total - bien,
    resultados: [],
    completo: bien === total,
  })

  it('todo bien: la cifra sola', () => {
    expect(contarLoQuePaso(resumen(3, 3), 'movidas')).toBe('3 líneas movidas.')
  })

  it('una sola concuerda en singular', () => {
    expect(contarLoQuePaso(resumen(1, 1), 'movidas')).toBe('1 línea movida.')
  })

  it('a medias: se dicen LAS DOS cifras', () => {
    // «12 movidas» esconde las veintiocho que no. «12 de 40» no.
    expect(contarLoQuePaso(resumen(12, 40), 'movidas')).toBe('12 de 40 movidas; 28 no.')
  })

  it('ninguna: se dice sin rodeos', () => {
    expect(contarLoQuePaso(resumen(0, 5), 'movidas')).toBe('Ninguna de las 5 se pudo mover.')
  })

  it('lo que quedó fuera de la vista se cuenta aparte, no se calla', () => {
    const frase = contarLoQuePaso(resumen(12, 12), 'movidas', 28)
    expect(frase).toContain('12 líneas movidas.')
    expect(frase).toContain('Quedaron fuera 28')
    expect(frase).toContain('no se tocaron')
  })

  it('sin nada fuera de la vista, no se menciona', () => {
    expect(contarLoQuePaso(resumen(2, 2), 'movidas', 0)).not.toContain('fuera')
  })
})

describe('§10.6 · un lote se deshace con el padre guardado, no con la operación inversa', () => {
  /**
   * La razón por la que el lote guarda el padre de cada línea antes de tocarla.
   *
   * Al sangrar cuatro hermanas, cada una queda colgando de la anterior. Si después se «anula la
   * sangría» de las cuatro, cada una sube a su abuela — que ya no es su padre original. La
   * operación inversa NO devuelve el árbol, y comprobarlo aquí evita que alguien la use para
   * deshacer creyendo que sí.
   */
  const sangrarTodas = (arbol: Record<string, string | null>, orden: string[]) => {
    const despues = { ...arbol }
    for (let i = 1; i < orden.length; i += 1) despues[orden[i]!] = orden[i - 1]!
    return despues
  }

  it('la operación inversa NO devuelve el árbol', () => {
    const original: Record<string, string | null> = { a: 'p', b: 'p', c: 'p' }
    const sangrado = sangrarTodas(original, ['a', 'b', 'c'])
    // Anular sangría: cada una sube a la abuela, que es el padre de su padre actual.
    const anulado: Record<string, string | null> = {}
    for (const [id, padre] of Object.entries(sangrado)) {
      anulado[id] = padre === null ? null : (sangrado[padre] ?? null)
    }
    expect(anulado).not.toEqual(original)
  })

  it('el padre guardado sí lo devuelve', () => {
    const original: Record<string, string | null> = { a: 'p', b: 'p', c: 'p' }
    const guardados = new Map(Object.entries(original))
    const sangrado = sangrarTodas(original, ['a', 'b', 'c'])
    expect(sangrado).not.toEqual(original)

    const restaurado = Object.fromEntries([...guardados.entries()])
    expect(restaurado).toEqual(original)
  })
})

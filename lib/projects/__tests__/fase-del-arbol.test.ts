import { describe, it, expect } from 'vitest'
import { construirFases, compararFases, SIN_FASE, type LineaDelArbol } from '../fase-del-arbol'

const linea = (id: string, title: string, parentId: string | null, templateOrder?: number): LineaDelArbol =>
  ({ id, title, parentId, templateOrder: templateOrder ?? null }) as LineaDelArbol

/**
 * Un plan de cuatro niveles, como el de verdad: etapa, fase, bloque, tarea.
 */
const PLAN: LineaDelArbol[] = [
  linea('e1', 'ETAPA MOBILIZE', null, 0),
  linea('f1', 'Inicio', 'e1', 1),
  linea('b1', 'Bloque de arranque', 'f1', 2),
  linea('t1', 'Presentar el plan', 'b1', 3),
  linea('t2', 'Aprobar el plan', 'b1', 4),
  linea('f2', 'Planificación', 'e1', 5),
  linea('t3', 'Diseñar los documentos', 'f2', 6),
  linea('e2', 'ETAPA MIGRATE', null, 7),
  linea('f3', 'Ola 0', 'e2', 8),
  linea('t4', 'Cortar el viernes', 'f3', 9),
]

describe('§6.1 · la fase sale del árbol', () => {
  const { faseDe } = construirFases(PLAN)

  it('una hoja honda lleva el nombre de su antepasado de nivel 1', () => {
    expect(faseDe('t1')).toBe('Inicio')
    expect(faseDe('t2')).toBe('Inicio')
    expect(faseDe('t3')).toBe('Planificación')
    expect(faseDe('t4')).toBe('Ola 0')
  })

  it('y un bloque intermedio, la misma', () => {
    expect(faseDe('b1')).toBe('Inicio')
  })

  it('la fase se nombra a sí misma, que es lo que hacía el importador', () => {
    // `plan-import.service.ts`: `if (fila.level === 1) return fila.name`.
    expect(faseDe('f1')).toBe('Inicio')
    expect(faseDe('f3')).toBe('Ola 0')
  })

  it('la etapa no tiene fase: ella es la etapa', () => {
    expect(faseDe('e1')).toBeNull()
    expect(faseDe('e2')).toBeNull()
  })

  it('y una línea que no está en el plan tampoco', () => {
    expect(faseDe('no-existe')).toBeNull()
  })
})

describe('§6.1 · quién encabeza una banda y quién no', () => {
  it('un nivel 1 sin hijas no es una fase: es una tarea colgada de la etapa', () => {
    // Darle banda propia repetiría la misma frase en la cabecera y en la única tarjeta.
    const con = [...PLAN, linea('suelta', 'Firmar el acta', 'e1', 10)]
    expect(construirFases(con).faseDe('suelta')).toBeNull()
  })

  it('pero en cuanto le cuelga algo, sí', () => {
    const con = [
      ...PLAN,
      linea('suelta', 'Firmar el acta', 'e1', 10),
      linea('hija', 'Recoger las firmas', 'suelta', 11),
    ]
    const { faseDe } = construirFases(con)
    expect(faseDe('suelta')).toBe('Firmar el acta')
    expect(faseDe('hija')).toBe('Firmar el acta')
  })
})

describe('§6.1 · la respuesta no depende del orden en que se pregunte', () => {
  /**
   * El ascenso memoriza el camino para no repetir tramos. La primera versión guardaba el camino
   * entero con una sola respuesta, y la raíz iba en ese camino: la primera hoja que preguntara le
   * dejaba pegada su fase a la etapa. Es la peor clase de fallo —se ve o no se ve según por dónde
   * empiece a dibujar—, así que se comprueba preguntando en los dos sentidos.
   */
  it('de la hoja hacia arriba', () => {
    const { faseDe } = construirFases(PLAN)
    expect(faseDe('t1')).toBe('Inicio')
    expect(faseDe('b1')).toBe('Inicio')
    expect(faseDe('f1')).toBe('Inicio')
    expect(faseDe('e1')).toBeNull()
  })

  it('y de la etapa hacia abajo', () => {
    const { faseDe } = construirFases(PLAN)
    expect(faseDe('e1')).toBeNull()
    expect(faseDe('f1')).toBe('Inicio')
    expect(faseDe('b1')).toBe('Inicio')
    expect(faseDe('t1')).toBe('Inicio')
  })

  it('con el plan contado al revés, lo mismo', () => {
    const { faseDe } = construirFases([...PLAN].reverse())
    expect(faseDe('t1')).toBe('Inicio')
    expect(faseDe('e1')).toBeNull()
  })
})

describe('§6.1 · un ciclo no cuelga el ascenso', () => {
  it('dos líneas que se cuelgan la una de la otra se resuelven sin fase', () => {
    // No debería pasar, y si pasa la vista tiene que dibujarse igual en vez de quedarse girando.
    const ciclo = [linea('a', 'A', 'b', 0), linea('b', 'B', 'a', 1)]
    const { faseDe } = construirFases(ciclo)
    expect(faseDe('a')).toBeNull()
    expect(faseDe('b')).toBeNull()
  })
})

describe('§6.1 · el orden de las bandas es el del nodo de fase', () => {
  const { rangoDeFases } = construirFases(PLAN)

  it('cada fase toma su propio sitio en el plan, no el de sus hijas', () => {
    expect(rangoDeFases.get('Inicio')).toBe(1)
    expect(rangoDeFases.get('Planificación')).toBe(5)
    expect(rangoDeFases.get('Ola 0')).toBe(8)
  })

  it('y así las bandas salen en el orden del plan, no alfabético', () => {
    const orden = [...rangoDeFases.keys()].sort(compararFases(rangoDeFases))
    expect(orden).toEqual(['Inicio', 'Planificación', 'Ola 0'])
  })

  it('«sin fase» va siempre al final', () => {
    const orden = ['Ola 0', SIN_FASE, 'Inicio'].sort(compararFases(rangoDeFases))
    expect(orden[orden.length - 1]).toBe(SIN_FASE)
  })

  it('aunque alguna hija se haya quedado con un orden más bajo que su madre', () => {
    // Antes el rango salía del `templateOrder` más bajo de las líneas de esa fase, y eso sólo
    // funciona mientras la madre venga delante. Una línea capturada a mano que hereda un orden raro
    // adelantaba la banda entera. El nodo sabe dónde está: no hace falta deducirlo.
    const conUnaFueraDeSitio = PLAN.map((l) => (l.id === 't3' ? { ...l, templateOrder: 2 } : l))
    expect(construirFases(conUnaFueraDeSitio).rangoDeFases.get('Planificación')).toBe(5)
  })
})

describe('§6.1 · de qué etapa cuelga cada fase', () => {
  const { etapaDeLaFase } = construirFases(PLAN)

  it('la cabecera se lee como una rama', () => {
    expect(etapaDeLaFase.get('Inicio')).toBe('ETAPA MOBILIZE')
    expect(etapaDeLaFase.get('Planificación')).toBe('ETAPA MOBILIZE')
    expect(etapaDeLaFase.get('Ola 0')).toBe('ETAPA MIGRATE')
  })

  it('pero no se repite el nombre cuando la etapa es la fase misma', () => {
    // Un plan de dos niveles: la raíz tiene hijas, así que sus hijas son de nivel 1 y se nombran a
    // sí mismas si encabezan algo. Poner la raíz encima con el mismo texto no informaría de nada.
    const dosNiveles = [
      linea('r', 'Raíz', null, 0),
      linea('f', 'Raíz', 'r', 1),
      linea('h', 'Hoja', 'f', 2),
    ]
    expect(construirFases(dosNiveles).etapaDeLaFase.has('Raíz')).toBe(false)
  })
})

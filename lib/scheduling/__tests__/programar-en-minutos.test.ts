import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import { toDayNumber } from '../date'
import { schedulePlan } from '../schedule'
import { comoHora, crearJornada, crearReloj, fechaDe } from '../reloj'
import { holgurasEnMinutos, programarEnMinutos } from '../programar-en-minutos'
import type { Dependency, PlanTask } from '../types'

const reloj = crearReloj(createWorkCalendar())
const LUNES = '2026-06-01'

function programar(tasks: PlanTask[], dependencies: Dependency[] = [], r = reloj) {
  const programa = programarEnMinutos({ tasks, dependencies, reloj: r, comienzo: LUNES })
  return (id: string) => {
    const linea = programa.porId.get(id)!
    return `${comoHora(linea.comienzo)} → ${comoHora(linea.fin)}`
  }
}

describe('El pase adelante en minutos', () => {
  it('lo que no depende de nadie empieza cuando abre el plan', () => {
    const cuando = programar([{ id: 'a', name: 'Sola', duration: 1, duracionMin: 480 }])
    expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-01 18:00')
  })

  it('media jornada termina a la una, y la siguiente empieza a las dos', () => {
    // Es lo que el motor de días no puede decir: las dos caben el mismo día. En días, la segunda
    // empezaría el martes porque el lunes «ya está ocupado».
    const cuando = programar(
      [
        { id: 'a', name: 'Mañana', duration: 1, duracionMin: 240 },
        { id: 'b', name: 'Tarde', duration: 1, duracionMin: 240 },
      ],
      [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }],
    )

    expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-01 13:00')
    expect(cuando('b')).toBe('2026-06-01 14:00 → 2026-06-01 18:00')
  })

  it('el que cierra la jornada empuja al siguiente al día siguiente, sin sumar un día de más', () => {
    // El motor de días dice `fin + 1` porque su fin es el último día trabajado. Aquí ese `+1` no
    // existe y ponerlo sería una jornada entera de más: el fin ya es el instante en que se para.
    const cuando = programar(
      [
        { id: 'a', name: 'Un día', duration: 1, duracionMin: 480 },
        { id: 'b', name: 'El siguiente', duration: 1, duracionMin: 480 },
      ],
      [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }],
    )

    expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-01 18:00')
    expect(cuando('b')).toBe('2026-06-02 09:00 → 2026-06-02 18:00')
  })

  it('el fin de semana no cuenta, ni para la duración ni para el salto', () => {
    const cuando = programar(
      [
        { id: 'a', name: 'Cinco días', duration: 5, duracionMin: 2400 },
        { id: 'b', name: 'Detrás', duration: 1, duracionMin: 480 },
      ],
      [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }],
    )

    expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-05 18:00')
    expect(cuando('b')).toBe('2026-06-08 09:00 → 2026-06-08 18:00')
  })

  describe('los cuatro tipos de vínculo', () => {
    const DOS: PlanTask[] = [
      { id: 'a', name: 'Primera', duration: 2, duracionMin: 960 },
      { id: 'b', name: 'Segunda', duration: 2, duracionMin: 960 },
    ]

    it('SS une los comienzos', () => {
      const cuando = programar(DOS, [{ predecessorId: 'a', successorId: 'b', type: 'SS', lag: 0 }])
      expect(cuando('b')).toBe('2026-06-01 09:00 → 2026-06-02 18:00')
    })

    it('FF une los finales, retrocediendo la duración con el calendario', () => {
      const cuando = programar(
        [
          { id: 'a', name: 'Primera', duration: 6, duracionMin: 2880 },
          { id: 'b', name: 'Segunda', duration: 4, duracionMin: 1920 },
        ],
        [{ predecessorId: 'a', successorId: 'b', type: 'FF', lag: 0 }],
      )
      // A cierra el lunes siguiente a las seis —seis jornadas cruzando el fin de semana—; B dura
      // cuatro, así que abre el miércoles anterior y las dos cierran a la vez.
      expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-08 18:00')
      expect(cuando('b')).toBe('2026-06-03 09:00 → 2026-06-08 18:00')
    })

    it('SF va del comienzo de una al fin de la otra', () => {
      const cuando = programar(
        [
          { id: 'x', name: 'Antes', duration: 3, duracionMin: 1440 },
          { id: 'a', name: 'Primera', duration: 2, duracionMin: 960 },
          { id: 'b', name: 'Segunda', duration: 2, duracionMin: 960 },
        ],
        [
          { predecessorId: 'x', successorId: 'a', type: 'FS', lag: 0 },
          { predecessorId: 'a', successorId: 'b', type: 'SF', lag: 0 },
        ],
      )
      // A abre el jueves y B tiene que haber terminado para entonces. «Para entonces» incluye el
      // jueves: el §12 caso 6 dice que B no puede terminar **antes** de que A empiece, y terminar el
      // mismo día es un relevo, no un solapamiento. Así que B cierra el jueves y abre el miércoles.
      expect(cuando('a')).toBe('2026-06-04 09:00 → 2026-06-05 18:00')
      expect(cuando('b')).toBe('2026-06-03 09:00 → 2026-06-04 18:00')
    })

    it('y el arranque del plan es un suelo: lo que pediría empezar antes se queda el primer día', () => {
      // Igual que en el motor de días. Un `FF` con una sucesora larga pide arrancar antes de que el
      // plan exista; adelantarla sería prometer trabajo en un día que no es del proyecto.
      const cuando = programar(
        [DOS[0], { id: 'b', name: 'Segunda', duration: 4, duracionMin: 1920 }],
        [{ predecessorId: 'a', successorId: 'b', type: 'FF', lag: 0 }],
      )
      expect(cuando('b')).toBe('2026-06-01 09:00 → 2026-06-04 18:00')
    })

    it('y el desfase se cuenta en tiempo laborable, no de calendario', () => {
      const cuando = programar(DOS, [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 3 }])
      // A cierra el martes; tres jornadas de espera son miércoles, jueves y viernes, así que B
      // abre el lunes siguiente y no el viernes.
      expect(cuando('b')).toBe('2026-06-08 09:00 → 2026-06-09 18:00')
    })

    it('un desfase negativo adelanta, y tampoco cuenta el fin de semana', () => {
      const cuando = programar(DOS, [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: -2 }])
      // A cierra el martes a las seis; dos jornadas hacia atrás es el lunes a las nueve.
      expect(cuando('b')).toBe('2026-06-01 09:00 → 2026-06-02 18:00')
    })
  })

  it('un hito no dura: empieza y termina en el mismo instante', () => {
    const cuando = programar(
      [
        { id: 'a', name: 'Trabajo', duration: 1, duracionMin: 480 },
        { id: 'h', name: 'Listo', duration: 0, kind: 'HITO', duracionMin: 0 },
      ],
      [{ predecessorId: 'a', successorId: 'h', type: 'FS', lag: 0 }],
    )
    expect(cuando('h')).toBe('2026-06-02 09:00 → 2026-06-02 09:00')
  })

  it('una línea sin minutos se programa por sus días, para poder correr un plan a medio migrar', () => {
    const cuando = programar([{ id: 'a', name: 'Sin migrar', duration: 3 }])
    expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-03 18:00')
  })

  it('y la jornada del proyecto manda: con siete horas, la misma tarea cierra a las cuatro', () => {
    const deSiete = crearReloj(createWorkCalendar(), crearJornada([{ desde: 9 * 60, hasta: 16 * 60 }]))
    const cuando = programar([{ id: 'a', name: 'Una jornada', duration: 1, duracionMin: 420 }], [], deSiete)
    expect(cuando('a')).toBe('2026-06-01 09:00 → 2026-06-01 16:00')
  })
})

describe('El pase atrás en minutos', () => {
  function holguras(tasks: PlanTask[], dependencies: Dependency[] = []) {
    const entrada = { tasks, dependencies, reloj, comienzo: LUNES }
    const programa = programarEnMinutos(entrada)
    const h = holgurasEnMinutos(entrada, programa)
    return (id: string) => ({
      total: h.total.get(id)! / 480,
      libre: h.libre.get(id)! / 480,
      tardio: comoHora(h.finTardio.get(id)!),
    })
  }

  it('lo que fija el cierre del plan no tiene holgura', () => {
    const h = holguras(
      [
        { id: 'a', name: 'Larga', duration: 5, duracionMin: 2400 },
        { id: 'b', name: 'Detrás', duration: 2, duracionMin: 960 },
      ],
      [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }],
    )
    expect(h('a').total).toBe(0)
    expect(h('b').total).toBe(0)
  })

  it('una rama corta en paralelo tiene la holgura que le sobra', () => {
    // La larga fija el cierre; la corta puede atrasarse tres jornadas sin moverlo.
    const h = holguras([
      { id: 'larga', name: 'Cinco jornadas', duration: 5, duracionMin: 2400 },
      { id: 'corta', name: 'Dos jornadas', duration: 2, duracionMin: 960 },
    ])
    expect(h('larga').total).toBe(0)
    expect(h('corta').total).toBe(3)
    expect(h('corta').tardio).toBe('2026-06-05 18:00')
  })

  it('la libre y la total son dos preguntas distintas', () => {
    // A tiene tres jornadas de total —el plan cierra el viernes— y **cero** de libre: al primer
    // minuto empuja a B, que arranca pegada a ella.
    const h = holguras(
      [
        { id: 'a', name: 'Primera', duration: 1, duracionMin: 480 },
        { id: 'b', name: 'Segunda', duration: 1, duracionMin: 480 },
        { id: 'largo', name: 'Lo que fija el cierre', duration: 5, duracionMin: 2400 },
      ],
      [{ predecessorId: 'a', successorId: 'b', type: 'FS', lag: 0 }],
    )
    expect(h('a').total).toBe(3)
    expect(h('a').libre).toBe(0)
    expect(h('b').total).toBe(3)
    expect(h('b').libre).toBe(3)
  })

  it('y la holgura se cuenta en minutos: media jornada de margen son 240', () => {
    const entrada = {
      tasks: [
        { id: 'corta', name: 'Media mañana', duration: 1, duracionMin: 240 },
        { id: 'larga', name: 'Una jornada', duration: 1, duracionMin: 480 },
      ],
      dependencies: [],
      reloj,
      comienzo: LUNES,
    }
    const h = holgurasEnMinutos(entrada, programarEnMinutos(entrada))
    // Lo que el motor de días no puede decir: a la corta le sobran cuatro horas del mismo día.
    expect(h.total.get('corta')).toBe(240)
    expect(h.total.get('larga')).toBe(0)
  })
})

/**
 * Los cuatro techos del fin tardío, comparados con el motor de días.
 *
 * No se comprueban contra números escritos a mano sino contra el otro motor: es la misma pregunta
 * que contesta la comparación sobre el plan de referencia, en casos que ese plan no tiene. Si los
 * dos motores dicen lo mismo en un caso que ninguno de los dos ha visto antes, la regla está bien
 * entendida y no sólo bien copiada.
 */
describe('Los cuatro techos, contra el motor de días', () => {
  function comparar(
    tasks: PlanTask[],
    dependencies: Dependency[] = [],
    opciones: { deadline?: string; terminales?: 'CIERRE_DEL_PLAN' | 'FIN_PROPIO' } = {},
  ) {
    const calendar = createWorkCalendar()
    const enDias = schedulePlan({ tasks, dependencies, calendar, start: LUNES })
    const analisis = analyzeCriticalPath(enDias, {
      ...(opciones.deadline ? { deadline: opciones.deadline } : {}),
      ...(opciones.terminales ? { terminalPolicy: opciones.terminales } : {}),
    })
    const entrada = { tasks, dependencies, reloj, comienzo: LUNES }
    const h = holgurasEnMinutos(entrada, programarEnMinutos(entrada), opciones)

    return tasks.map((t) => ({
      id: t.id,
      dias: analisis.totalFloat.get(t.id)!,
      minutos: h.total.get(t.id)! / 480,
    }))
  }

  const UNA: PlanTask[] = [{ id: 'a', name: 'Sola', duration: 2, duracionMin: 960 }]

  it('el deadline del plan aprieta a todas', () => {
    // Sin deadline, la única tarea del plan fija el cierre y no tiene holgura. Con uno una semana
    // más tarde, le sobran los días de en medio — y el compromiso es terminar el día ANTERIOR.
    expect(comparar(UNA)).toEqual([{ id: 'a', dias: 0, minutos: 0 }])
    // Comprometerse para el 8 es terminar **el 8**, no el 7: son cuatro jornadas de margen y no tres.
    expect(comparar(UNA, [], { deadline: '2026-06-08' })).toEqual([{ id: 'a', dias: 4, minutos: 4 }])
  })

  it('el compromiso propio de la línea también, y manda el más apretado', () => {
    const conDue: PlanTask[] = [{ ...UNA[0], dueDate: '2026-06-04' }]
    expect(comparar(conDue, [], { deadline: '2026-06-12' })).toEqual([{ id: 'a', dias: 2, minutos: 2 }])
  })

  it('«no empieza después de» amarra el arranque, y el techo del fin es esa fecha más la duración', () => {
    const conSnlt: PlanTask[] = [
      { ...UNA[0], compromiso: { type: 'NO_EMPIEZA_DESPUES_DE', date: '2026-06-03' } },
    ]
    expect(comparar(conSnlt, [], { deadline: '2026-06-12' })).toEqual([{ id: 'a', dias: 2, minutos: 2 }])
  })

  it('y con «fin propio», lo que no tiene sucesoras se queda sin holgura', () => {
    const dos: PlanTask[] = [
      { id: 'a', name: 'Corta', duration: 1, duracionMin: 480 },
      { id: 'b', name: 'Larga', duration: 4, duracionMin: 1920 },
    ]
    expect(comparar(dos)).toEqual([
      { id: 'a', dias: 3, minutos: 3 },
      { id: 'b', dias: 0, minutos: 0 },
    ])
    expect(comparar(dos, [], { terminales: 'FIN_PROPIO' })).toEqual([
      { id: 'a', dias: 0, minutos: 0 },
      { id: 'b', dias: 0, minutos: 0 },
    ])
  })
})

/**
 * Las ausencias, contra el motor de días.
 *
 * Otra vez la comparación en vez de números a mano: la regla es que una línea cuenta jornadas
 * **trabajadas** y no transcurridas, y equivocarse aquí no se ve —la fecha sale, sólo que es la de
 * una persona que ese día no estaba—.
 */
describe('Las ausencias, contra el motor de días', () => {
  const calendar = createWorkCalendar()
  /** Los ordinales de esos días hábiles, que es como los pide el motor. */
  const ordinales = (...fechas: string[]) =>
    new Set(fechas.map((f) => calendar.ordinalOf(toDayNumber(f))))

  function comparar(tasks: PlanTask[], noDisponible: ReadonlyMap<string, ReadonlySet<number>>) {
    const enDias = schedulePlan({ tasks, dependencies: [], calendar, start: LUNES, noDisponible })
    const enMinutos = programarEnMinutos({ tasks, dependencies: [], reloj, comienzo: LUNES, noDisponible })
    return tasks.map((t) => ({
      id: t.id,
      dias: `${enDias.byId.get(t.id)!.start} → ${enDias.byId.get(t.id)!.finish}`,
      minutos: `${fechaDe(enMinutos.porId.get(t.id)!.comienzo)} → ${fechaDe(enMinutos.porId.get(t.id)!.fin)}`,
    }))
  }

  it('una línea de cinco jornadas con tres días de ausencia en medio termina tres días más tarde', () => {
    const filas = comparar(
      [{ id: 'a', name: 'Cinco jornadas', duration: 5, duracionMin: 2400 }],
      new Map([['a', ordinales('2026-06-03', '2026-06-04', '2026-06-05')]]),
    )
    expect(filas[0].minutos).toBe(filas[0].dias)
    expect(filas[0].minutos).toBe('2026-06-01 → 2026-06-10')
  })

  it('y si su gente no está el día en que le tocaba empezar, empieza cuando vuelve', () => {
    const filas = comparar(
      [{ id: 'a', name: 'Dos jornadas', duration: 2, duracionMin: 960 }],
      new Map([['a', ordinales('2026-06-01', '2026-06-02')]]),
    )
    expect(filas[0].minutos).toBe(filas[0].dias)
    expect(filas[0].minutos).toBe('2026-06-03 → 2026-06-04')
  })

  it('un hito no se mueve por una ausencia: no es trabajo, es una marca', () => {
    const filas = comparar(
      [{ id: 'h', name: 'Listo', duration: 0, kind: 'HITO', duracionMin: 0 }],
      new Map([['h', ordinales('2026-06-01', '2026-06-02')]]),
    )
    expect(filas[0].minutos).toBe(filas[0].dias)
    expect(filas[0].minutos).toBe('2026-06-01 → 2026-06-01')
  })

  it('sin ausencias capturadas, las dos cuentas coinciden como siempre', () => {
    const filas = comparar(
      [{ id: 'a', name: 'Tres jornadas', duration: 3, duracionMin: 1440 }],
      new Map(),
    )
    expect(filas[0].minutos).toBe(filas[0].dias)
  })
})

describe('El desfase en minutos (§2.2)', () => {
  it('dos horas de espera son dos horas, no cero días ni uno', () => {
    // Es el caso que el modelo en días no podía guardar: «espera a que fragüe dos horas» tenía que
    // elegir entre no esperar nada o esperar una jornada entera.
    const tasks: PlanTask[] = [
      { id: 'a', name: 'Vaciar', duration: 1, duracionMin: 480 },
      { id: 'b', name: 'Desencofrar', duration: 1, duracionMin: 480 },
    ]
    const entrada = {
      tasks,
      dependencies: [{ predecessorId: 'a', successorId: 'b', type: 'FS' as const, lag: 0, lagMin: 120 }],
      reloj,
      comienzo: LUNES,
    }
    const p = programarEnMinutos(entrada)

    expect(comoHora(p.porId.get('a')!.fin)).toBe('2026-06-01 18:00')
    // Dos horas después del cierre del lunes es el martes a las once: el desfase se cuenta en
    // tiempo laborable, así que la noche no corre.
    expect(comoHora(p.porId.get('b')!.comienzo)).toBe('2026-06-02 11:00')
  })

  it('y los minutos mandan sobre los días cuando el vínculo lleva los dos', () => {
    const tasks: PlanTask[] = [
      { id: 'a', name: 'Primera', duration: 1, duracionMin: 480 },
      { id: 'b', name: 'Segunda', duration: 1, duracionMin: 480 },
    ]
    const conAmbos = {
      tasks,
      dependencies: [{ predecessorId: 'a', successorId: 'b', type: 'FS' as const, lag: 5, lagMin: 120 }],
      reloj,
      comienzo: LUNES,
    }
    // Si ganaran los días, B abriría el 8 de junio. Gana el dato fino.
    expect(comoHora(programarEnMinutos(conAmbos).porId.get('b')!.comienzo)).toBe('2026-06-02 11:00')
  })

  it('un desfase negativo en minutos adelanta el solape esas horas', () => {
    const tasks: PlanTask[] = [
      { id: 'a', name: 'Primera', duration: 2, duracionMin: 960 },
      { id: 'b', name: 'Segunda', duration: 1, duracionMin: 480 },
    ]
    const entrada = {
      tasks,
      dependencies: [{ predecessorId: 'a', successorId: 'b', type: 'FS' as const, lag: 0, lagMin: -120 }],
      reloj,
      comienzo: LUNES,
    }
    // A cierra el martes a las seis; dos horas antes es el martes a las cuatro.
    expect(comoHora(programarEnMinutos(entrada).porId.get('b')!.comienzo)).toBe('2026-06-02 16:00')
  })
})

describe('Una línea que declara su hora (§2.1)', () => {
  it('empieza a las dos de la tarde si eso es lo que dice', () => {
    // Es el ejemplo que pone el spec al pedir que las fechas lleven hora: «una tarea puede empezar
    // a las 14:00». Antes la restricción amarraba el día y la línea abría con la jornada.
    const tasks: PlanTask[] = [
      {
        id: 'a',
        name: 'Ventana de corte',
        duration: 1,
        duracionMin: 240,
        constraint: { type: 'NO_ANTES_DE', date: LUNES, minuto: 14 * 60 },
      },
    ]
    const p = programarEnMinutos({ tasks, dependencies: [], reloj, comienzo: LUNES })

    expect(comoHora(p.porId.get('a')!.comienzo)).toBe('2026-06-01 14:00')
    expect(comoHora(p.porId.get('a')!.fin)).toBe('2026-06-01 18:00')
  })

  it('y una hora en la que no se trabaja se normaliza a cuando se abre', () => {
    // Las siete de la mañana no son una hora laborable: amarrar ahí es amarrar a la apertura, no
    // adelantar la jornada. Sin normalizar, la línea diría que empieza a una hora en la que nadie
    // está trabajando.
    const tasks: PlanTask[] = [
      { id: 'a', name: 'Temprano', duration: 1, duracionMin: 480, constraint: { type: 'NO_ANTES_DE', date: LUNES, minuto: 7 * 60 } },
    ]
    const p = programarEnMinutos({ tasks, dependencies: [], reloj, comienzo: LUNES })

    expect(comoHora(p.porId.get('a')!.comienzo)).toBe('2026-06-01 09:00')
  })

  it('sin hora declarada sigue amarrando el día, como las 1 368 del plan importado', () => {
    const tasks: PlanTask[] = [
      { id: 'a', name: 'De siempre', duration: 1, duracionMin: 480, constraint: { type: 'NO_ANTES_DE', date: LUNES } },
    ]
    const p = programarEnMinutos({ tasks, dependencies: [], reloj, comienzo: LUNES })

    expect(comoHora(p.porId.get('a')!.comienzo)).toBe('2026-06-01 09:00')
  })
})

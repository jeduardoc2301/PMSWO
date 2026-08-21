import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY, toDayNumber, weekdayOf } from '../date'
import {
  JORNADA_PARTIDA,
  comoHora,
  crearJornada,
  crearReloj,
  instanteDe,
} from '../reloj'

/**
 * El 1 de junio de 2026 es lunes, y es el arranque del plan de referencia. Se afirma aquí porque
 * todas las cuentas de abajo cuelgan de ello: si algún día deja de ser lunes, que se caiga esta
 * prueba y no las quince siguientes con fechas que parecen erróneas por otra razón.
 */
const LUNES = '2026-06-01'
const VIERNES = '2026-06-05'

const reloj = crearReloj(createWorkCalendar())
const alas = (fecha: string, hora: number, minuto = 0) => instanteDe(fecha, hora * 60 + minuto)

describe('El reloj laborable', () => {
  it('arranca donde dice que arranca', () => {
    expect(weekdayOf(toDayNumber(LUNES))).toBe(MONDAY)
    expect(weekdayOf(toDayNumber(VIERNES))).toBe(FRIDAY)
    expect(JORNADA_PARTIDA.minutos).toBe(480)
  })

  describe('la jornada partida por la comida', () => {
    it('a la hora de comer no se trabaja', () => {
      expect(reloj.esLaborable(alas(LUNES, 9))).toBe(true)
      expect(reloj.esLaborable(alas(LUNES, 13, 30))).toBe(false)
      expect(reloj.esLaborable(alas(LUNES, 15))).toBe(true)
      // El minuto en el que se cierra ya no se trabaja: si contara, dos jornadas seguidas
      // compartirían un minuto y la suma de un mes saldría con veintitantos minutos de más.
      expect(reloj.esLaborable(alas(LUNES, 18))).toBe(false)
    })

    it('abrir y cerrar a la hora de comer no dan lo mismo, y no deben darlo', () => {
      // Es el caso que se equivoca solo: una tarea que termina a las 13:00 se cierra a las 13:00,
      // pero la que empieza a las 13:00 empieza a las 14:00. Con una sola función, una de las dos
      // queda mal, y la que queda mal es siempre la que alguien mira en una reunión.
      expect(comoHora(reloj.abrir(alas(LUNES, 13, 30)))).toBe('2026-06-01 14:00')
      expect(comoHora(reloj.cerrar(alas(LUNES, 13, 30)))).toBe('2026-06-01 13:00')
    })

    it('cuatro horas desde las nueve terminan a la una, no a las dos', () => {
      // El límite **entre turnos**, que es el mismo problema que el límite del día y se me pasó:
      // 240 minutos trabajados se pueden decir «el cierre de la mañana» o «la apertura de la tarde»,
      // y para un fin es lo primero. Lo encontró el panel de detalle en pantalla diciendo que una
      // tarea de cuatro horas iba «de 09:00 a 14:00».
      expect(comoHora(reloj.sumar(alas(LUNES, 9), 240))).toBe('2026-06-01 13:00')
    })

    it('y ese fin, leído como comienzo, sí es la apertura de la tarde', () => {
      // Las dos lecturas son legítimas y por eso hay dos funciones: `sumar` cierra, `abrir` abre.
      expect(comoHora(reloj.abrir(reloj.sumar(alas(LUNES, 9), 240)))).toBe('2026-06-01 14:00')
    })

    it('cinco horas desde las nueve terminan a las tres, saltándose la comida', () => {
      expect(comoHora(reloj.sumar(alas(LUNES, 9), 300))).toBe('2026-06-01 15:00')
    })

    it('y la comida tampoco se cuenta al medir entre dos instantes', () => {
      // De 12:00 a 15:00 hay tres horas de reloj y dos de trabajo.
      expect(reloj.entre(alas(LUNES, 12), alas(LUNES, 15))).toBe(120)
    })
  })

  describe('los límites del día', () => {
    it('ocho horas desde el lunes a las nueve terminan el lunes, no el martes', () => {
      // Caer justo en el cierre se contesta cerrando: decir «martes 09:00» pintaría la barra dos
      // días de ancho y dispararía un día tarde todo lo que cuelgue de este fin.
      expect(comoHora(reloj.sumar(alas(LUNES, 9), 480))).toBe('2026-06-01 18:00')
    })

    it('un minuto más ya es del día siguiente', () => {
      expect(comoHora(reloj.sumar(alas(LUNES, 9), 481))).toBe('2026-06-02 09:01')
    })

    it('lo que empieza fuera de horario empieza cuando se abre', () => {
      expect(comoHora(reloj.sumar(alas(LUNES, 19), 60))).toBe('2026-06-02 10:00')
    })

    it('y el fin de semana no cuenta', () => {
      // Viernes a las 17:00 quedan sesenta minutos de viernes; los otros sesenta son del lunes.
      expect(comoHora(reloj.sumar(alas(VIERNES, 17), 120))).toBe('2026-06-08 10:00')
    })
  })

  describe('la duración cero, que es un hito', () => {
    it('no mueve nada si ya se está trabajando', () => {
      expect(comoHora(reloj.sumar(alas(LUNES, 10), 0))).toBe('2026-06-01 10:00')
    })

    it('pero un hito puesto en sábado cae el lunes a primera hora', () => {
      expect(weekdayOf(toDayNumber('2026-06-06'))).toBe(SATURDAY)
      expect(comoHora(reloj.sumar(alas('2026-06-06', 10), 0))).toBe('2026-06-08 09:00')
    })
  })

  describe('los festivos consecutivos', () => {
    // Martes y miércoles seguidos. Es el caso que rompe cualquier atajo del tipo «si cae en festivo,
    // suma un día»: con dos seguidos hay que volver a preguntar, y con tres, otra vez.
    const conPuente = crearReloj(
      createWorkCalendar({ holidays: ['2026-06-02', '2026-06-03'] }),
    )

    it('el lunes entero sigue siendo el lunes', () => {
      expect(comoHora(conPuente.sumar(alas(LUNES, 9), 480))).toBe('2026-06-01 18:00')
    })

    it('y el minuto siguiente se lo salta los dos de golpe', () => {
      expect(weekdayOf(toDayNumber('2026-06-04'))).toBe(THURSDAY)
      expect(comoHora(conPuente.sumar(alas(LUNES, 9), 481))).toBe('2026-06-04 09:01')
    })

    it('medir a través del puente no cuenta lo que no se trabajó', () => {
      // De lunes 09:00 a jueves 09:00 hay tres días de calendario y una sola jornada de trabajo.
      expect(conPuente.entre(alas(LUNES, 9), alas('2026-06-04', 9))).toBe(480)
    })
  })

  describe('la semana de seis días', () => {
    const conSabado = crearReloj(
      createWorkCalendar({ workingWeekdays: [MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY] }),
    )

    it('el viernes por la tarde ya no desemboca en el lunes', () => {
      expect(comoHora(conSabado.sumar(alas(VIERNES, 17), 120))).toBe('2026-06-06 10:00')
    })

    it('y el domingo sigue sin contar', () => {
      expect(weekdayOf(toDayNumber('2026-06-07'))).toBe(SUNDAY)
      expect(conSabado.entre(alas('2026-06-07', 0), alas('2026-06-08', 0))).toBe(0)
    })
  })

  describe('el cruce de medianoche', () => {
    // Cruzar la medianoche funciona cuando el que cruza es el trabajo: con jornada corrida de 24 h
    // y siete días laborables, las cinco horas que empiezan a las 23:00 terminan a las 04:00.
    const sinParar = crearReloj(
      createWorkCalendar({ workingWeekdays: [SUNDAY, MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY] }),
      crearJornada([{ desde: 0, hasta: 1440 }]),
    )

    it('cinco horas desde las once de la noche terminan a las cuatro de la mañana', () => {
      expect(comoHora(sinParar.sumar(alas(LUNES, 23), 300))).toBe('2026-06-02 04:00')
    })

    it('y el turno nocturno se rechaza al construirlo, en vez de contestar cualquier cosa', () => {
      expect(() => crearJornada([{ desde: 22 * 60, hasta: 30 * 60 }])).toThrow(RangeError)
      expect(() => crearJornada([{ desde: 22 * 60, hasta: 30 * 60 }])).toThrow(/cruza la medianoche/)
    })
  })

  describe('el horario de verano', () => {
    it('no existe aquí, y la semana del cambio dura lo mismo que cualquier otra', () => {
      // Los instantes son minutos UTC y el calendario no tiene zona: no hay salto que modelar. El
      // último domingo de marzo de 2026 la mitad de Europa adelanta el reloj, y la semana laboral
      // que lo contiene sigue midiendo cinco jornadas exactas.
      expect(reloj.entre(alas('2026-03-27', 9), alas('2026-04-03', 9))).toBe(5 * 480)
    })
  })

  describe('ir y volver', () => {
    it('restar lo que se sumó devuelve al comienzo', () => {
      const comienzo = alas(LUNES, 9)
      for (const minutos of [1, 59, 60, 240, 480, 481, 2400, 100_000]) {
        expect(comoHora(reloj.restar(reloj.sumar(comienzo, minutos), minutos))).toBe(comoHora(comienzo))
      }
    })

    it('y lo que se mide entre dos instantes es lo que se sumó', () => {
      const comienzo = alas(LUNES, 9)
      for (const minutos of [1, 480, 481, 100_000]) {
        expect(reloj.entre(comienzo, reloj.sumar(comienzo, minutos))).toBe(minutos)
      }
    })

    it('restar cero no mueve nada: cierra donde estaba', () => {
      // Parece una perogrullada y no lo es: `restar` devuelve un comienzo, así que la forma de
      // abrir contestaría «el día siguiente a las nueve» —el mismo instante de trabajo acumulado,
      // otro día del calendario—. Un hito atado con `FF+0` al fin de una tarea cae **el día en que
      // esa tarea termina**, y con la forma de abrir caía al siguiente: son 47 hitos del plan real.
      expect(comoHora(reloj.restar(alas(LUNES, 18), 0))).toBe('2026-06-01 18:00')
      expect(comoHora(reloj.restar(alas(LUNES, 13), 0))).toBe('2026-06-01 13:00')
    })

    it('al revés no da negativo: da cero', () => {
      expect(reloj.entre(alas(VIERNES, 9), alas(LUNES, 9))).toBe(0)
    })
  })

  describe('sin recorrer el calendario', () => {
    /**
     * La prueba que sustituye al índice de quince minutos que pide el spec.
     *
     * No mide segundos —eso depende de la máquina y de lo que esté haciendo el portátil— sino
     * cuántas veces se toca el calendario. Si alguien mete un bucle día a día, la cuenta crece con
     * la distancia y esto se pone rojo; mientras la cuenta no dependa de la distancia, no hay bucle.
     */
    function contando() {
      const real = createWorkCalendar()
      let llamadas = 0
      const cuenta = <T extends (...a: never[]) => unknown>(f: T): T =>
        ((...a: Parameters<T>) => {
          llamadas += 1
          return f(...a)
        }) as T
      // Envoltorio a mano y no un `Proxy`: el calendario viene congelado, y un `Proxy` no puede
      // devolver algo distinto de lo que hay en una propiedad no configurable. Se cuentan las tres
      // que usa el reloj, que son las tres por las que entraría un bucle.
      const espia = {
        ...real,
        ordinalOf: cuenta(real.ordinalOf),
        dayOfOrdinal: cuenta(real.dayOfOrdinal),
        isWorkingDay: cuenta(real.isWorkingDay),
      }
      return { reloj: crearReloj(espia), cuantas: () => llamadas }
    }

    it('avanzar diez minutos y avanzar diecinueve años cuestan lo mismo', () => {
      const corto = contando()
      corto.reloj.sumar(alas(LUNES, 9), 10)

      const larguisimo = contando()
      // Diez millones de minutos laborables son unos diecinueve años de jornadas: con un bucle día
      // a día serían cinco mil vueltas, y el índice del spec ni siquiera llegaría —lo precomputa
      // para un año arriba y abajo—.
      larguisimo.reloj.sumar(alas(LUNES, 9), 10_000_000)

      expect(larguisimo.cuantas()).toBe(corto.cuantas())
    })

    it('y medir un día o veinte años, también', () => {
      const corto = contando()
      corto.reloj.entre(alas(LUNES, 9), alas('2026-06-02', 9))

      const largo = contando()
      largo.reloj.entre(alas(LUNES, 9), alas('2046-06-01', 9))

      expect(largo.cuantas()).toBe(corto.cuantas())
    })

    it('la cuenta a veinte años sigue siendo exacta, no sólo barata', () => {
      // Que sea O(1) no vale de nada si además es mentira. Veinte años de lunes a viernes desde el
      // 2026-06-01 hasta el 2046-06-01 son 5 218 días hábiles contados por el calendario de días,
      // y el reloj tiene que decir exactamente esos días en minutos.
      const dias = createWorkCalendar().countBetween(toDayNumber(LUNES), toDayNumber('2046-05-31'))
      expect(reloj.entre(alas(LUNES, 0), alas('2046-06-01', 0))).toBe(dias * 480)
    })
  })

  describe('la jornada, al construirla', () => {
    it('no acepta un tramo al revés ni uno que se sale del día', () => {
      expect(() => crearJornada([{ desde: 600, hasta: 600 }])).toThrow(/termina antes de empezar/)
      expect(() => crearJornada([{ desde: -60, hasta: 600 }])).toThrow(/se sale del día/)
    })

    it('ni dos tramos que se pisan, ni ninguno', () => {
      expect(() => crearJornada([{ desde: 540, hasta: 780 }, { desde: 700, hasta: 1080 }])).toThrow(/pisa al anterior/)
      expect(() => crearJornada([])).toThrow(/sin tramos/)
    })

    it('y los ordena, para que dé igual en qué orden lleguen', () => {
      const jornada = crearJornada([{ desde: 840, hasta: 1080 }, { desde: 540, hasta: 780 }])
      expect(jornada.turnos.map((t) => t.desde)).toEqual([540, 840])
      expect(jornada.minutos).toBe(480)
    })
  })
})

import { describe, expect, it } from 'vitest'

import { createWorkCalendar } from '../calendar'
import { estadoAlCorte, varianceAtCutoff } from '../schedule-variance'

const calendar = createWorkCalendar()

/**
 * Prueba de aceptación de E5 y E6.
 *
 * La especificación es **la fórmula del archivo de referencia**, leída de sus propias celdas
 * (columnas I y J de la hoja «Plan»):
 *
 *     I: IF(H=1,"Cerrado",IF(H=0,"No iniciado","En curso"))
 *     J: IF(G=0, IF(H=1,0, IF(FechaCorte<=F, 0, -(NETWORKDAYS(F,FechaCorte)-1))),
 *              ROUND((H - MIN(1,MAX(0, NETWORKDAYS(E,MIN(FechaCorte,F))/G))) * G, 1))
 *
 * Los casos numéricos usan filas reales del plan (fechas y duraciones del archivo) con avances de
 * ejemplo, y el valor esperado es el que esas fórmulas producen. Si esta aritmética se aparta de la
 * del archivo, la plataforma y el Excel dirían atrasos distintos sobre el mismo plan — y esa
 * discrepancia mata la confianza en los dos.
 */
describe('El atraso al corte reproduce la fórmula del archivo', () => {
  const CORTE = '2026-08-16'

  it('fila 3 «Presentar el plan» · 12-jun→18-jun, 5 días, 80% → −1.0', () => {
    const v = varianceAtCutoff(
      { start: '2026-06-12', finish: '2026-06-18', duration: 5, progress: 0.8, cutoff: CORTE },
      calendar,
    )
    expect(v.deltaDays).toBe(-1.0)
    expect(v.expected).toBe(1)
  })

  it('fila 4 «Aprobar el plan» · 19-jun, 1 día, 50% → −0.5', () => {
    const v = varianceAtCutoff(
      { start: '2026-06-19', finish: '2026-06-19', duration: 1, progress: 0.5, cutoff: CORTE },
      calendar,
    )
    expect(v.deltaDays).toBe(-0.5)
  })

  it('fila 2 fase «Inicio» · 12-jun→19-jun, 6 días, 75% → −1.5', () => {
    const v = varianceAtCutoff(
      { start: '2026-06-12', finish: '2026-06-19', duration: 6, progress: 0.75, cutoff: CORTE },
      calendar,
    )
    expect(v.deltaDays).toBe(-1.5)
  })

  it('fila 123 «Gestión del Cambio» · 28-jul→19-ago, 17 días, sin empezar → −14.0', () => {
    const v = varianceAtCutoff(
      { start: '2026-07-28', finish: '2026-08-19', duration: 17, progress: 0, cutoff: CORTE },
      calendar,
    )
    expect(v.deltaDays).toBe(-14.0)
    expect(v.estado).toBe('NO_INICIADO')
  })
})

describe('El esperado', () => {
  it('antes del inicio no se le debe nada a la línea', () => {
    const v = varianceAtCutoff(
      { start: '2026-09-01', finish: '2026-09-14', duration: 10, progress: 0, cutoff: '2026-08-16' },
      calendar,
    )
    expect(v.expected).toBe(0)
    expect(v.deltaDays).toBe(0)
  })

  it('después del fin se espera completa, no más', () => {
    const v = varianceAtCutoff(
      { start: '2026-06-01', finish: '2026-06-05', duration: 5, progress: 1, cutoff: '2026-08-16' },
      calendar,
    )
    expect(v.expected).toBe(1)
    expect(v.deltaDays).toBe(0)
  })

  it('a media línea se espera la fracción transcurrida, en días hábiles', () => {
    // 10 días del lunes 1-jun al viernes 12; corte el viernes 5: van 5 de 10.
    const v = varianceAtCutoff(
      { start: '2026-06-01', finish: '2026-06-12', duration: 10, progress: 0.5, cutoff: '2026-06-05' },
      calendar,
    )
    expect(v.expected).toBe(0.5)
    expect(v.deltaDays).toBe(0)
  })

  it('el fin de semana no cuenta como tiempo debido', () => {
    // Corte el domingo 7: los transcurridos siguen siendo los 5 hábiles (NETWORKDAYS ignora S y D).
    const v = varianceAtCutoff(
      { start: '2026-06-01', finish: '2026-06-12', duration: 10, progress: 0.5, cutoff: '2026-06-07' },
      calendar,
    )
    expect(v.expected).toBe(0.5)
  })

  it('ir adelantado da ventaja con signo positivo', () => {
    const v = varianceAtCutoff(
      { start: '2026-06-01', finish: '2026-06-12', duration: 10, progress: 0.9, cutoff: '2026-06-05' },
      calendar,
    )
    expect(v.deltaDays).toBe(4) // (0.9 − 0.5) × 10
  })

  /**
   * `MIN(FechaCorte, F)`: el transcurrido se topa en el fin de la línea. Con datos incoherentes
   * —fechas que abarcan menos días que la duración declarada— manda el calendario de la línea,
   * igual que en el archivo: el esperado no llega a 1 aunque el corte esté lejos.
   */
  it('el transcurrido se topa en el fin de la línea, como en el archivo', () => {
    // Duración declarada 10, pero la ventana 1-jun→5-jun solo abarca 5 hábiles.
    const v = varianceAtCutoff(
      { start: '2026-06-01', finish: '2026-06-05', duration: 10, progress: 0.5, cutoff: '2026-08-16' },
      calendar,
    )
    expect(v.expected).toBe(0.5)
    expect(v.deltaDays).toBe(0)
  })
})

describe('El estado mira el avance, no el calendario', () => {
  it('cero es no iniciado aunque ya debiera haber empezado', () => {
    expect(estadoAlCorte(0)).toBe('NO_INICIADO')
  })

  it('cualquier avance parcial es en curso', () => {
    expect(estadoAlCorte(0.01)).toBe('EN_CURSO')
    expect(estadoAlCorte(0.99)).toBe('EN_CURSO')
  })

  it('completo es cerrado aunque haya cerrado tarde', () => {
    expect(estadoAlCorte(1)).toBe('CERRADO')
  })
})

/**
 * La rama de los hitos de la fórmula J: sin trabajo que medir, la deuda es de calendario puro.
 * Un hito vencido y no cerrado acumula un día por cada día hábil desde su fecha.
 */
describe('Los hitos', () => {
  it('cerrado: cero, aunque haya cerrado tarde', () => {
    const v = varianceAtCutoff(
      { start: '2026-06-19', finish: '2026-06-19', duration: 0, progress: 1, cutoff: '2026-08-16' },
      calendar,
    )
    expect(v.deltaDays).toBe(0)
    expect(v.estado).toBe('CERRADO')
  })

  it('todavía no vence: cero', () => {
    const v = varianceAtCutoff(
      { start: '2026-09-30', finish: '2026-09-30', duration: 0, progress: 0, cutoff: '2026-08-16' },
      calendar,
    )
    expect(v.deltaDays).toBe(0)
  })

  it('vencido y sin cerrar: un día de atraso por cada día hábil desde su fecha', () => {
    // Hito el viernes 19-jun, corte el 16-ago: NETWORKDAYS(19-jun, 16-ago) = 41 → −(41−1) = −40.
    const v = varianceAtCutoff(
      { start: '2026-06-19', finish: '2026-06-19', duration: 0, progress: 0, cutoff: '2026-08-16' },
      calendar,
    )
    expect(v.deltaDays).toBe(-40)
    expect(v.estado).toBe('NO_INICIADO')
  })

  it('el corte en el día del hito todavía no es deuda', () => {
    const v = varianceAtCutoff(
      { start: '2026-06-19', finish: '2026-06-19', duration: 0, progress: 0, cutoff: '2026-06-19' },
      calendar,
    )
    expect(v.deltaDays).toBe(0)
  })
})

describe('El redondeo', () => {
  it('va a décimas, con ROUND(…, 1) como el archivo', () => {
    // La etapa completa: 81 días desde el 12-jun; 46 transcurridos al corte → esperado 0.5679…
    const v = varianceAtCutoff(
      { start: '2026-06-12', finish: '2026-10-02', duration: 81, progress: 0.526, cutoff: '2026-08-16' },
      calendar,
    )
    expect(v.deltaDays).toBe(-3.4)
  })

  it('nunca muestra menos cero', () => {
    const v = varianceAtCutoff(
      { start: '2026-06-01', finish: '2026-06-03', duration: 3, progress: 0.999, cutoff: '2026-08-16' },
      calendar,
    )
    expect(Object.is(v.deltaDays, -0)).toBe(false)
  })
})

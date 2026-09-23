import { describe, expect, it } from 'vitest'

import { calcularAtrasos, type LineaDelPlan } from '../atrasos'
import { createWorkCalendar } from '@/lib/scheduling/calendar'

/**
 * El agregador de atrasos.
 *
 * Aquí se fijan las tres decisiones que impiden que el reporte mienta: solo hojas, días hábiles,
 * y lo que vence hoy todavía no está atrasado. Las tres estaban mal en la primera versión del
 * correo y las tres producían números que un cliente podía desmentir en la reunión.
 */

const CAL = createWorkCalendar()
const HOY = '2026-09-22' // martes
const INICIO = new Date('2026-06-12T00:00:00.000Z')
const FIN = new Date('2026-11-30T00:00:00.000Z')

function linea(over: Partial<LineaDelPlan> & { id: string }): LineaDelPlan {
  return {
    parentId: null,
    title: `Tarea ${over.id}`,
    phase: null,
    kind: 'ACTIVIDAD',
    party: 'PROVEEDOR',
    status: 'TODO',
    progressPct: 0,
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    estimatedEndDate: new Date('2026-09-10T00:00:00.000Z'),
    ...over,
  }
}

function correr(lineas: LineaDelPlan[]) {
  return calcularAtrasos({
    lineas,
    calendar: CAL,
    corte: HOY,
    inicioDelProyecto: INICIO,
    finDelProyecto: FIN,
  })
}

describe('solo se cuentan las hojas', () => {
  it('excluye la línea que tiene hijas, aunque ella misma se vea vencida', () => {
    // El caso exacto que rompía el reporte: el renglón de agrupación está en TODO y al 0 % porque
    // el acumulado se calcula al dibujar, así que siempre se ve vencido. Contarlo suma el atraso
    // de sus hijas por segunda vez.
    const r = correr([
      linea({ id: 'madre' }),
      linea({ id: 'hija-1', parentId: 'madre' }),
      linea({ id: 'hija-2', parentId: 'madre' }),
    ])
    expect(r.hojasExaminadas).toBe(2)
    expect(r.atrasadas.map((a) => a.id)).toEqual(['hija-1', 'hija-2'])
  })

  it('excluye la madre aunque TODAS sus hijas estén terminadas', () => {
    // De los 75 resúmenes que el reporte anterior marcaba como vencidos, 23 tenían todas sus hojas
    // en DONE: trabajo terminado reportado al cliente como atrasado.
    const r = correr([
      linea({ id: 'madre' }),
      linea({ id: 'hija', parentId: 'madre', status: 'DONE', progressPct: 1 }),
    ])
    expect(r.atrasadas).toHaveLength(0)
  })

  it('usa «tener hijas» y no el kind RESUMEN', () => {
    // No coinciden: en el plan real son 125 contra 121. Cuatro líneas con hijas se escapan por el
    // kind, y esas cuatro volverían a duplicar el conteo.
    const r = correr([
      linea({ id: 'agrupa', kind: 'ACTIVIDAD' }),
      linea({ id: 'hija', parentId: 'agrupa' }),
      linea({ id: 'rotulada-resumen', kind: 'RESUMEN' }),
    ])
    expect(r.atrasadas.map((a) => a.id).sort()).toEqual(['hija', 'rotulada-resumen'])
  })
})

describe('la frontera de «atrasada»', () => {
  it('lo que vence HOY no está atrasado', () => {
    // Comparar contra la marca de tiempo completa marcaba como incumplidas once tareas del plan
    // real cuyo plazo vencía al cierre de ese mismo día. Es indefendible si el cliente lo revisa.
    const r = correr([linea({ id: 'vence-hoy', estimatedEndDate: new Date('2026-09-22T00:00:00.000Z') })])
    expect(r.atrasadas).toHaveLength(0)
  })

  it('lo que venció ayer sí está atrasado', () => {
    const r = correr([linea({ id: 'ayer', estimatedEndDate: new Date('2026-09-21T00:00:00.000Z') })])
    expect(r.atrasadas).toHaveLength(1)
  })

  it('lo que está al 100 % no está atrasado aunque su fecha haya pasado', () => {
    const r = correr([linea({ id: 'hecha', progressPct: 1 })])
    expect(r.atrasadas).toHaveLength(0)
  })

  it('lo que está en estado terminal no está atrasado', () => {
    const r = correr([linea({ id: 'cerrada', status: 'DONE' })])
    expect(r.atrasadas).toHaveLength(0)
  })
})

describe('los días son hábiles', () => {
  it('no cuenta el fin de semana', () => {
    // Del viernes 18 al martes 22 hay 4 días naturales pero solo 2 hábiles de por medio.
    const r = correr([linea({ id: 'viernes', estimatedEndDate: new Date('2026-09-18T00:00:00.000Z') })])
    expect(r.atrasadas[0].diasHabilesDeAtraso).toBe(2)
  })

  it('nunca reporta cero para algo que sí está atrasado', () => {
    // Un plazo el sábado, mirado el lunes: en ordinales hábiles los dos caen en el mismo sitio y
    // la resta da cero. Cero días de atraso sobre algo vencido se lee como «al corriente».
    const lunes = '2026-09-21'
    const r = calcularAtrasos({
      lineas: [linea({ id: 'sabado', estimatedEndDate: new Date('2026-09-19T00:00:00.000Z') })],
      calendar: CAL,
      corte: lunes,
      inicioDelProyecto: INICIO,
      finDelProyecto: FIN,
    })
    expect(r.atrasadas[0].diasHabilesDeAtraso).toBeGreaterThanOrEqual(1)
  })
})

describe('el reparto entre compromisos y ejecución', () => {
  it('separa hitos, entregas y aprobaciones de las actividades', () => {
    const r = correr([
      linea({ id: 'hito', kind: 'HITO' }),
      linea({ id: 'entrega', kind: 'ENTREGA_CLIENTE' }),
      linea({ id: 'aprob', kind: 'APROBACION_CLIENTE' }),
      linea({ id: 'compuerta', kind: 'COMPUERTA' }),
      linea({ id: 'punto', kind: 'PUNTO_DE_CONTROL' }),
      linea({ id: 'act', kind: 'ACTIVIDAD' }),
    ])
    expect(r.compromisos.map((c) => c.id).sort()).toEqual(['aprob', 'compuerta', 'entrega', 'hito', 'punto'])
    expect(r.ejecucion.map((c) => c.id)).toEqual(['act'])
  })

  it('aparta las líneas de cadencia para que no encabecen el ranking', () => {
    // Un comité semanal con la barra corriendo desde el arranque acumula más atraso que cualquier
    // entregable real. Presentarlo como la mayor falla del proyecto tapa lo que importa.
    const r = correr([
      linea({
        id: 'comite',
        startDate: INICIO,
        estimatedEndDate: new Date('2026-09-15T00:00:00.000Z'),
      }),
      linea({ id: 'normal' }),
    ])
    expect(r.cadencia.map((c) => c.id)).toEqual(['comite'])
    expect(r.ejecucion.map((c) => c.id)).toEqual(['normal'])
  })
})

describe('el reparto de responsabilidad', () => {
  it('cuenta por separado lo que responde el cliente', () => {
    // Es el dato que hace útil el reporte en una reunión de gobierno: qué está esperando a quién.
    const r = correr([
      linea({ id: 'a', party: 'CLIENTE' }),
      linea({ id: 'b', party: 'CLIENTE' }),
      linea({ id: 'c', party: 'PROVEEDOR' }),
    ])
    expect(r.porParte).toEqual({ CLIENTE: 2, PROVEEDOR: 1 })
  })

  it('cuenta cuántas atrasadas ni siquiera arrancaron', () => {
    const r = correr([
      linea({ id: 'cero' }),
      linea({ id: 'media', progressPct: 0.5 }),
    ])
    expect(r.sinArrancar).toBe(1)
  })
})

describe('cómo se describe el tamaño del atraso', () => {
  it('no expone la suma de los atrasos', () => {
    // La suma NO es un periodo de tiempo: las actividades corren en paralelo. En el plan real daba
    // 2 188 días hábiles, que leídos como duración son casi nueve años, y el primer lector lo
    // rechazó — con razón. El campo no existe para que nadie lo vuelva a publicar.
    const r = correr([linea({ id: 'a' }), linea({ id: 'b' })])
    expect(r).not.toHaveProperty('deudaDiasHabiles')
  })

  it('la mediana es el atraso de la actividad que está justo a la mitad', () => {
    const r = correr([
      linea({ id: 'a', estimatedEndDate: new Date('2026-09-21T00:00:00.000Z') }),
      linea({ id: 'b', estimatedEndDate: new Date('2026-09-11T00:00:00.000Z') }),
      linea({ id: 'c', estimatedEndDate: new Date('2026-08-18T00:00:00.000Z') }),
    ])
    // Se comprueba contra los atrasos que el propio recorrido calculó, en vez de contra números
    // de días hábiles escritos a mano: contar días hábiles a ojo en una prueba es justo el tipo de
    // aritmética que se equivoca y deja la prueba verde por el motivo equivocado.
    const ordenados = r.atrasadas.map((x) => x.diasHabilesDeAtraso).sort((x, y) => x - y)
    expect(r.medianaDiasHabiles).toBe(ordenados[1])
    expect(r.maximoDiasHabiles).toBe(ordenados[2])
  })

  it('el reparto por tramos cuadra con los atrasos individuales', () => {
    const r = correr([
      linea({ id: 'a', estimatedEndDate: new Date('2026-09-21T00:00:00.000Z') }),
      linea({ id: 'b', estimatedEndDate: new Date('2026-09-18T00:00:00.000Z') }),
      linea({ id: 'c', estimatedEndDate: new Date('2026-09-11T00:00:00.000Z') }),
      linea({ id: 'd', estimatedEndDate: new Date('2026-09-01T00:00:00.000Z') }),
      linea({ id: 'e', estimatedEndDate: new Date('2026-07-01T00:00:00.000Z') }),
    ])

    for (const tramo of r.reparto) {
      const cuentaReal = r.atrasadas.filter(
        (x) =>
          x.diasHabilesDeAtraso >= tramo.desde &&
          (tramo.hasta === null || x.diasHabilesDeAtraso <= tramo.hasta)
      ).length
      expect(tramo.cuantas).toBe(cuentaReal)
    }
    // Ninguna actividad puede quedarse fuera de todos los tramos ni caer en dos.
    expect(r.reparto.reduce((s, t) => s + t.cuantas, 0)).toBe(r.atrasadas.length)
  })

  it('no truena con cero atrasadas', () => {
    const r = correr([linea({ id: 'al-dia', estimatedEndDate: new Date('2026-12-01T00:00:00.000Z') })])
    expect(r.medianaDiasHabiles).toBe(0)
    expect(r.maximoDiasHabiles).toBe(0)
    expect(r.reparto.every((t) => t.cuantas === 0)).toBe(true)
  })
})

describe('el orden', () => {
  it('va de la más atrasada a la menos', () => {
    const r = correr([
      linea({ id: 'poco', estimatedEndDate: new Date('2026-09-18T00:00:00.000Z') }),
      linea({ id: 'mucho', estimatedEndDate: new Date('2026-08-03T00:00:00.000Z') }),
      linea({ id: 'medio', estimatedEndDate: new Date('2026-09-01T00:00:00.000Z') }),
    ])
    expect(r.atrasadas.map((a) => a.id)).toEqual(['mucho', 'medio', 'poco'])
  })
})

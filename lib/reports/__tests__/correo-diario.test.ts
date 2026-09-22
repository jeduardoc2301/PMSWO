import { describe, expect, it } from 'vitest'

import { armarCorreoDiario } from '../correo-diario'
import { buildProjectSnapshot } from '../project-snapshot'

/**
 * El correo diario.
 *
 * Lo que se prueba aquí es lo que no se ve al abrirlo una vez: el escape de lo que viene de la
 * base, que las barras no se salgan de su ancho, y que el asunto cambie cuando cambia el estado.
 * El diseño se revisa a ojo con `npm run reporte:ver`; esto cuida lo que el ojo no atrapa.
 */

const DIA = 86400000
const HOY = new Date('2026-09-22T15:00:00.000Z')
const dias = (n: number) => new Date(HOY.getTime() + n * DIA)

const PROYECTO = {
  name: 'Migración',
  client: 'Cliente',
  status: 'IN_PROGRESS',
  startDate: dias(-60),
  estimatedEndDate: dias(30),
}

function correo(over: Parameters<typeof buildProjectSnapshot>[0] | null = null, brief?: any) {
  const snapshot = buildProjectSnapshot(
    over ?? { project: PROYECTO, workItems: [], blockers: [], risks: [], now: HOY }
  )
  return armarCorreoDiario({ project: PROYECTO, snapshot, brief })
}

describe('el escape de lo que viene de la base', () => {
  it('neutraliza HTML en el nombre del proyecto', () => {
    const snapshot = buildProjectSnapshot({
      project: { ...PROYECTO, name: '<script>alert(1)</script>' },
      workItems: [],
      blockers: [],
      risks: [],
      now: HOY,
    })
    const { html } = armarCorreoDiario({
      project: { ...PROYECTO, name: '<script>alert(1)</script>' },
      snapshot,
    })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('neutraliza HTML en el título de una tarea vencida', () => {
    const entrada = {
      project: PROYECTO,
      workItems: [
        { title: '<img src=x onerror=1>', status: 'TODO', estimatedEndDate: dias(-4), completedAt: null },
      ],
      blockers: [],
      risks: [],
      now: HOY,
    }
    const { html } = correo(entrada)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
  })

  it('neutraliza HTML en la narrativa del modelo', () => {
    // El modelo devuelve texto libre. Aunque hoy no escriba etiquetas, el correo no debe depender
    // de que no lo haga.
    const { html } = correo(null, { lead: 'riesgo <b>alto</b>', verdict: 'En curso' })
    expect(html).toContain('&lt;b&gt;alto&lt;/b&gt;')
  })
})

describe('las barras', () => {
  it('no se pasan de su ancho cuando el calendario ya se agotó', () => {
    const entrada = {
      project: { ...PROYECTO, startDate: dias(-120), estimatedEndDate: dias(-30) },
      workItems: [],
      blockers: [],
      risks: [],
      now: HOY,
    }
    const { html } = correo(entrada)
    // Ninguna celda de barra puede declarar más de los 380px del canal.
    const anchos = [...html.matchAll(/height="10" style="width:(\d+)px/g)].map((m) => Number(m[1]))
    expect(anchos.length).toBeGreaterThan(0)
    for (const a of anchos) expect(a).toBeLessThanOrEqual(380)
  })

  it('deja ver un mínimo cuando el avance es casi cero pero no cero', () => {
    const entrada = {
      project: PROYECTO,
      workItems: Array.from({ length: 300 }, (_, i) => ({
        title: `t${i}`,
        status: i === 0 ? 'DONE' : 'TODO',
        estimatedEndDate: dias(20),
        completedAt: i === 0 ? dias(-1) : null,
      })),
      blockers: [],
      risks: [],
      now: HOY,
    }
    const { html } = correo(entrada)
    expect(html).toMatch(/background-color:#006786/)
  })
})

describe('las fichas de cifras', () => {
  it('encogen la letra cuando el número es largo, en vez de encimarse con la de al lado', () => {
    // La columna mide 132px. Con ocho tareas, «3/8» cabe de sobra; con las 1368 de un plan real,
    // «342/1368» a 30px se sale y pisa la ficha siguiente. Se vio con datos de producción.
    const muchas = Array.from({ length: 1368 }, (_, i) => ({
      title: `t${i}`,
      status: i < 342 ? 'DONE' : 'TODO',
      estimatedEndDate: dias(20),
      completedAt: i < 342 ? dias(-1) : null,
    }))
    const { html } = correo({
      project: PROYECTO,
      workItems: muchas,
      blockers: [],
      risks: [],
      now: HOY,
    })

    const ficha = html.match(/font-size:(\d+)px; line-height:34px[^>]*>342\/1368</)
    expect(ficha).not.toBeNull()
    expect(Number(ficha![1])).toBeLessThan(30)
  })

  it('deja el tamaño grande cuando el número es corto', () => {
    const { html } = correo()
    expect(html).toMatch(/font-size:30px; line-height:34px/)
  })
})

describe('la fase de una tarea vencida', () => {
  const vencida = (title: string, phase: string | null) => ({
    project: PROYECTO,
    workItems: [{ title, status: 'TODO', phase, estimatedEndDate: dias(-5), completedAt: null }],
    blockers: [],
    risks: [],
    now: HOY,
  })

  it('se omite cuando repite el título palabra por palabra', () => {
    // Pasa en planes importados: `phase` trae exactamente el mismo texto que `title` y el renglón
    // sale diciendo lo mismo dos veces.
    const t = 'Inicio: presentar y aprobar el plan de trabajo'
    const { html } = correo(vencida(t, t))
    expect(html.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1)
  })

  it('se reduce al rótulo cuando viene como frase completa', () => {
    const { html } = correo(
      vencida('Documento 1', 'Planificación: diseñar los doce documentos entregables de Mobilize')
    )
    expect(html).toContain('Planificación…')
    expect(html).not.toContain('doce documentos entregables')
  })

  it('se deja tal cual cuando ya es un rótulo corto', () => {
    const { html } = correo(vencida('Tarea', 'Construcción'))
    expect(html).toContain('Construcción')
    expect(html).not.toContain('Construcción…')
  })
})

describe('el asunto', () => {
  it('lleva el veredicto y el conteo de vencidas', () => {
    const entrada = {
      project: PROYECTO,
      workItems: [
        { title: 'a', status: 'TODO', estimatedEndDate: dias(-3), completedAt: null },
        { title: 'b', status: 'TODO', estimatedEndDate: dias(-2), completedAt: null },
      ],
      blockers: [],
      risks: [],
      now: HOY,
    }
    const { subject } = correo(entrada)
    expect(subject).toContain('Migración')
    expect(subject).toContain('2 vencidas')
  })

  it('usa el singular con una sola vencida', () => {
    const entrada = {
      project: PROYECTO,
      workItems: [{ title: 'a', status: 'TODO', estimatedEndDate: dias(-3), completedAt: null }],
      blockers: [],
      risks: [],
      now: HOY,
    }
    expect(correo(entrada).subject).toContain('1 vencida ·')
  })

  it('no menciona vencidas cuando no hay', () => {
    expect(correo().subject).not.toContain('vencida')
  })
})

describe('el veredicto', () => {
  it('respeta el del modelo cuando viene', () => {
    const { html } = correo(null, { verdict: 'En riesgo' })
    expect(html).toContain('En riesgo')
  })

  it('lo deduce de las cifras cuando el modelo no contestó', () => {
    // Un bloqueo crítico manda, aunque el índice de avance se vea bien.
    const entrada = {
      project: PROYECTO,
      workItems: [],
      blockers: [{ description: 'parado', severity: 'CRITICAL', resolvedAt: null }],
      risks: [],
      now: HOY,
    }
    expect(correo(entrada).html).toContain('En riesgo')
  })
})

describe('bloqueos y riesgos', () => {
  it('se distinguen por etiqueta, no solo por color', () => {
    const entrada = {
      project: PROYECTO,
      workItems: [],
      blockers: [{ description: 'falta la ventana', severity: 'CRITICAL', resolvedAt: null }],
      risks: [{ description: 'cierre contable', riskLevel: 'HIGH', status: 'OPEN' }],
      now: HOY,
    }
    const { html, text } = correo(entrada)
    expect(html).toContain('Bloqueo')
    expect(html).toContain('Riesgo')
    expect(text).toContain('Bloqueo (CRITICAL): falta la ventana')
    expect(text).toContain('Riesgo (HIGH): cierre contable')
  })
})

describe('la alternativa en texto plano', () => {
  it('trae las mismas cifras que el HTML', () => {
    const entrada = {
      project: PROYECTO,
      workItems: [
        { title: 'hecha', status: 'DONE', estimatedEndDate: dias(-5), completedAt: dias(-5) },
        { title: 'tarde', status: 'TODO', estimatedEndDate: dias(-3), completedAt: null },
      ],
      blockers: [],
      risks: [],
      now: HOY,
    }
    const { text } = correo(entrada)
    expect(text).toContain('Tareas cerradas ....... 1/2')
    expect(text).toContain('LO QUE YA VENCIÓ (1)')
    expect(text).not.toContain('<')
  })
})

describe('el preencabezado', () => {
  it('no queda vacío aunque no haya narrativa', () => {
    // Sin él, Outlook rellena la vista previa con lo primero del cuerpo —el nombre de la marca—
    // y se pierde la única línea que decide si alguien abre el correo.
    const { html } = correo()
    const m = html.match(/opacity:0; overflow:hidden;">([^<]+)</)
    expect(m?.[1]?.trim().length ?? 0).toBeGreaterThan(20)
  })
})

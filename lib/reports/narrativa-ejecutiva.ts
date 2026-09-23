/**
 * La lectura en prosa del reporte ejecutivo.
 *
 * El modelo **no decide nada**: recibe las cifras ya calculadas y las interpreta. No elige el
 * veredicto —ese sale de `veredictoDeLasCifras` y viaja en el asunto del correo—, no inventa
 * números y no ve un solo campo que no esté en la lista de hechos de abajo.
 *
 * ## Por qué se valida lo que devuelve
 *
 * Este texto llega al comité de un banco. El parseo anterior hacía `verdict: parsed.verdict` sin
 * lista blanca: si el modelo devolvía «Crítico», eso se imprimía tal cual en el asunto. Aquí todo
 * pasa por Zod y lo que no cuadre se descarta entero — el correo sale con cifras y sin prosa, que
 * es una degradación aceptable. Prosa sin verificar delante de un cliente no lo es.
 *
 * ## Qué NO se le manda al modelo, a propósito
 *
 * **`zeroFloatPct`.** Vale 95 % en este plan. Un modelo que lo vea escribirá «el 95 % del proyecto
 * está en riesgo», y eso es alarmista y falso: un plan armado hacia atrás desde una fecha
 * comprometida queda encadenado por aritmética, no por enfermedad. La primera pregunta del cliente
 * hundiría el reporte entero.
 *
 * **Nombres propios de los compromisos del cliente.** El campo trae hoy el nombre del PM del
 * proveedor. Ver la cabecera de `correo-ejecutivo.ts`.
 */
import { z } from 'zod'
import { AIService } from '@/lib/services/ai-service'
import { logWarning } from '@/lib/logger'
import type { Expediente } from '@/services/expediente-del-reporte.service'

const esquema = z.object({
  entradilla: z.string().min(40).max(700),
  secciones: z
    .array(
      z.object({
        rotulo: z.string().min(3).max(40),
        afirmacion: z.string().min(10).max(120),
        parrafos: z.array(z.string().min(20).max(900)).min(1).max(2),
      })
    )
    .min(1)
    .max(3),
  peticiones: z
    .array(
      z.object({
        texto: z.string().min(10).max(220),
        aQuien: z.string().max(80).optional(),
        paraCuando: z.string().max(60).optional(),
      })
    )
    .min(1)
    .max(5),
})

export type NarrativaEjecutiva = z.infer<typeof esquema>

/** Lo que ve el modelo. Todo calculado, nada que tenga que deducir. */
export function hechosDelExpediente(e: Expediente): Record<string, unknown> {
  const m = e.panel.metricas
  const a = e.atrasos
  const p = e.plan?.proyeccion
  const cc = e.plan?.informe

  return {
    proyecto: e.proyecto.nombre,
    cliente: e.proyecto.cliente,
    fechaComprometida: e.proyecto.comprometidoPara.toISOString().slice(0, 10),
    corte: e.corte,

    laPreguntaDeLaFecha: p
      ? {
          cierreDelPlanTalComoEstaCapturado: p.cierreDelPlan,
          advertenciaSobreEseNumero:
            'Coincide con el compromiso porque cada línea está anclada en su fecha pactada. No mira el avance real y no empeora aunque el proyecto se atrase. No lo presentes como buena noticia.',
          actividadesAtrasadas: a.atrasadas.length,
          medianaDeAtrasoEnDiasHabiles: a.medianaDiasHabiles,
          peorAtrasoEnDiasHabiles: a.maximoDiasHabiles,
          advertenciaSobreSumarAtrasos:
            'No sumes los atrasos de las actividades: corren en paralelo y la suma no es un periodo de tiempo. Usa la mediana y el máximo.',
          cierreProyectado: p.cierreProyectado,
          corrimientoEnDiasHabiles: p.corrimientoDiasHabiles,
          supuestoDeLaProyeccion:
            'Se reanclan a hoy las actividades abiertas que ya debieron arrancar y se reprograma. Es el suelo mecánico, no un pronóstico.',
        }
      : null,

    avance: {
      realPonderadoPorDuracion: Number((m.proyecto.progresoGlobal * 100).toFixed(1)),
      calendarioLaborableConsumido: Number((m.avanceTemporal.planificado * 100).toFixed(1)),
      desviacionEnPuntos: Number((m.avanceTemporal.desviacion * 100).toFixed(1)),
      actividadesEjecutables: m.tareas.hojas,
      hitosTotales: m.hitos.total,
      hitosAtrasados: m.hitos.atrasados,
    },

    atrasos: {
      total: a.atrasadas.length,
      sinArrancar: a.sinArrancar,
      repartoPorTramo: a.reparto.map((t) => ({ tramo: t.rotulo, actividades: t.cuantas })),
      respondeSoftwareOne: a.porParte.PROVEEDOR,
      respondeElCliente: a.porParte.CLIENTE,
      hitosEntregasYAprobacionesAtrasados: a.compromisos.slice(0, 8).map((c) => ({
        actividad: c.titulo,
        clase: c.clase,
        diasHabilesDeAtraso: c.diasHabilesDeAtraso,
        responde: c.parte === 'CLIENTE' ? 'el cliente' : 'SoftwareOne',
      })),
      ejecucionAtrasada: a.ejecucion.slice(0, 5).map((c) => ({
        actividad: c.titulo,
        diasHabilesDeAtraso: c.diasHabilesDeAtraso,
        avanceCapturado: c.avancePct,
      })),
    },

    dependenciasDelCliente: cc
      ? {
          compromisos: cc.clientCommitments,
          vencidos: cc.clientOverdue,
          porVencer: cc.clientAtRisk,
          lineasDelPlanDetenidas: cc.linesBlockedByClient,
          losQueMasDetienen: cc.whatCanMoveIt.slice(0, 5).map((r) => ({
            compromiso: r.name,
            comprometidoPara: r.dueDate,
            lineasQueDetiene: r.blocks,
            porQueNoSeArreglaConMasGente: r.why,
          })),
        }
      : null,

    registroDeGobierno: {
      bloqueosRegistrados: e.bloqueos.length,
      riesgosRegistrados: e.riesgos.length,
      acuerdosRegistrados: e.acuerdos.length,
      estaVacio: e.gobiernoVacio,
    },
  }
}

function construirPrompt(hechos: Record<string, unknown>): string {
  return `Eres el director de entrega de SoftwareOne. Escribes la lectura de un reporte que se presenta al COMITÉ DIRECTIVO DEL CLIENTE. Te leen el patrocinador, el director de TI y, a veces, el director general. No son técnicos y no van a leer el plan.

DATOS (ya calculados — úsalos, no inventes ninguno):
${JSON.stringify(hechos, null, 2)}

REGLAS, en orden de importancia:

1. NO INVENTES UNA SOLA CIFRA. Solo puedes citar números que estén arriba. Si quieres decir algo que no se sostiene con estos datos, no lo digas.
2. No repartas culpas. Reparte responsabilidad: «esto está en manos del cliente, esto en las nuestras». El comité tiene que salir sabiendo qué le toca, no sintiéndose acusado.
3. Nada de jerga. Prohibidas: «holgura», «ruta crítica», «línea base», «pase atrás», «desfase», «WBS», «CPM», «hitos críticos». Si una palabra técnica es inevitable, explícala en la misma frase.
4. Cada sección abre con una AFIRMACIÓN, no con un rótulo genérico. «El diseño de red no está aprobado y detiene la construcción» sirve; «Estado del proyecto» no.
5. Cuando cites días de atraso, di «días hábiles». No los conviertas a naturales ni los mezcles.
6. NO escribas un veredicto ni una calificación del proyecto: el reporte ya lleva uno calculado de las cifras.
7. Prosa corrida en español neutro. Sin viñetas, sin markdown, sin negritas.
8. Si el registro de gobierno está vacío, dilo como lo que es: los riesgos existen, lo que falta es escribirlos. No lo presentes como que no hay riesgos.

Responde ÚNICAMENTE con este JSON, sin markdown ni texto adicional:
{
  "entradilla": "dos o tres frases con la lectura general. Es lo primero que lee el comité; que la primera frase diga lo que pasa.",
  "secciones": [
    { "rotulo": "ROTULO CORTO EN VERSALITAS", "afirmacion": "afirmación de 6 a 12 palabras", "parrafos": ["párrafo", "párrafo"] }
  ],
  "peticiones": [
    { "texto": "la decisión concreta que se pide en esta reunión", "aQuien": "a quién se le pide", "paraCuando": "plazo" }
  ]
}

Entre 2 y 3 secciones. Entre 3 y 5 peticiones, y que sean decisiones que este comité pueda tomar hoy, no tareas de equipo.`
}

/**
 * Pide la lectura al modelo y la valida.
 *
 * Devuelve `undefined` ante cualquier problema. El correo sale igual: las cifras son el reporte,
 * la prosa lo acompaña.
 */
export async function generarNarrativaEjecutiva(
  e: Expediente
): Promise<NarrativaEjecutiva | undefined> {
  try {
    const crudo = await AIService.runRawPrompt(construirPrompt(hechosDelExpediente(e)), {
      maxTokens: 3000,
      temperature: 0.35,
    })

    let json = crudo.trim()
    if (json.startsWith('```')) json = json.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim()
    const primera = json.indexOf('{')
    const ultima = json.lastIndexOf('}')
    if (primera >= 0 && ultima > primera) json = json.slice(primera, ultima + 1)

    const resultado = esquema.safeParse(JSON.parse(json))
    if (!resultado.success) {
      logWarning('[Narrativa] el modelo devolvió algo que no cuadra con el esquema', {
        problemas: resultado.error.issues.slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`),
      })
      return undefined
    }
    return resultado.data
  } catch (error) {
    logWarning('[Narrativa] no se pudo generar; el correo sale solo con cifras', {
      error: (error as Error).message,
    })
    return undefined
  }
}

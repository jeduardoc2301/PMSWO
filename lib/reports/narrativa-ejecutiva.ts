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

/**
 * Un texto que se pasa del largo se recorta en la última palabra completa, no se rechaza.
 *
 * Rechazarlo tiraba la lectura entera —entradilla, secciones y peticiones— porque un rótulo traía
 * 63 caracteres en vez de 60. El comité se quedaba sin prosa por un detalle de conteo.
 */
const recortado = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .transform((t) => {
      const limpio = t.trim()
      if (limpio.length <= max) return limpio
      const corte = limpio.slice(0, max - 1)
      // Si el corte cae justo al final de una palabra, esa palabra se queda.
      const espacio = limpio[max - 1] === ' ' ? corte.length : corte.lastIndexOf(' ')
      return `${(espacio > max / 2 ? corte.slice(0, espacio) : corte).replace(/[\s,;:·—-]+$/, '')}…`
    })

const esquema = z.object({
  entradilla: recortado(40, 700),
  secciones: z
    .array(
      z.object({
        rotulo: recortado(3, 60),
        afirmacion: recortado(10, 160),
        // Se acepta de más y se recorta: descartar una lectura buena porque trajo un párrafo extra
        // deja al comité sin prosa por un detalle de conteo. Lo que no cabe simplemente no sale.
        parrafos: z
          .array(recortado(20, 900))
          .min(1)
          .transform((p) => p.slice(0, 2)),
      })
    )
    .min(1)
    .transform((s) => s.slice(0, 3)),
  peticiones: z
    .array(
      z.object({
        texto: recortado(10, 300),
        aQuien: recortado(0, 80).optional(),
        paraCuando: recortado(0, 60).optional(),
      })
    )
    .min(1)
    .transform((p) => p.slice(0, 5)),
})

export type NarrativaEjecutiva = z.infer<typeof esquema>

/** Lo que ve el modelo. Todo calculado, nada que tenga que deducir. */
export function hechosDelExpediente(e: Expediente): Record<string, unknown> {
  const m = e.panel.metricas
  const a = e.atrasos
  const p = e.plan?.proyeccion
  const cc = e.plan?.informe
  const oyf = e.plan?.olasYFrentes

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

    olasDeMigracion: oyf
      ? {
          queSignificaAtrasoReal:
            'Días hábiles entre el corte comprometido en el plan y el corte proyectado con el mismo método que el cierre. Semáforo: 0 en tiempo, 1 a 5 atención, más de 5 en riesgo.',
          olas: oyf.olas.map((o) => ({
            ola: o.numero,
            ambiente: o.ambiente,
            servidores: o.servidores,
            fase: o.fase,
            corteComprometido: o.corteComprometido,
            corteProyectado: o.corteProyectado,
            yaSeCorto: o.cortada,
            atrasoRealEnDiasHabiles: o.atrasoDiasHabiles,
            avanceReal: Math.round(o.avanceReal * 100),
            avanceEsperado: Math.round(o.avanceEsperado * 100),
            condicionadaPor: o.compuertas,
          })),
          compuertas: oyf.compuertas.map((c) => ({
            compuerta: `${c.codigo} · ${c.nombre}`,
            habilitaOlas: c.olas,
            listas: c.listas,
            total: c.total,
            vencidas: c.vencidas,
            comprometida: c.comprometida,
            atrasoRealEnDiasHabiles: c.atrasoDiasHabiles,
          })),
          alertas: oyf.alertas,
        }
      : null,

    frentesDePlataforma: oyf
      ? oyf.frentes.map((f) => ({
          frente: f.nombre,
          avanceReal: Math.round(f.avanceReal * 100),
          avanceEsperado: Math.round(f.avanceEsperado * 100),
          comprometido: f.comprometido,
          proyectado: f.proyectado,
          atrasoRealEnDiasHabiles: f.atrasoDiasHabiles,
          terminado: f.terminado,
          actividadesVencidas: f.vencidas,
        }))
      : null,

    registroDeGobierno: {
      estaVacio: e.gobiernoVacio,
      bloqueosAbiertos: e.bloqueos
        .filter((b) => !b.resuelto)
        .map((b) => ({ bloqueo: b.descripcion, severidad: b.severidad, bloqueadoPor: b.bloqueadoPor, diasAbierto: b.diasAbierto })),
      riesgos: e.riesgos
        .filter((r) => r.estado !== 'CLOSED')
        .map((r) => ({ riesgo: r.descripcion, nivel: r.nivel, estado: r.estado, mitigacion: r.mitigacion })),
      acuerdos: e.acuerdos.map((a2) => ({ acuerdo: a2.titulo, estado: a2.estado, acordadoEl: a2.acordadoEl.toISOString().slice(0, 10) })),
    },
  }
}

/** Qué versión del reporte se está redactando. */
export type VersionDelReporte = 'EJECUTIVO' | 'COMPARTIBLE'

const porcentaje = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0)

/**
 * Los hechos de la versión para compartir.
 *
 * El reporte es interno, pero se da por hecho que alguien va a copiar y pegar un párrafo en un
 * correo al banco. Así que el modelo **no ve** lo que no debe salir: las cantidades de actividades
 * (se publican como porcentaje), quién responde por cada atraso, las líneas que detiene cada
 * compromiso del cliente y los avisos de calidad de captura. Lo que el modelo no ve, no lo puede
 * escribir.
 */
export function hechosParaCompartir(e: Expediente): Record<string, unknown> {
  const m = e.panel.metricas
  const a = e.atrasos
  const p = e.plan?.proyeccion
  const cc = e.plan?.informe
  const oyf = e.plan?.olasYFrentes
  const limite = e.proyecto.comprometidoPara.toISOString().slice(0, 10)

  return {
    proyecto: e.proyecto.nombre,
    cliente: e.proyecto.cliente,
    fechaComprometida: limite,
    corte: e.corte,
    avance: {
      realPonderadoPorDuracion: Number((m.proyecto.progresoGlobal * 100).toFixed(1)),
      calendarioLaborableConsumido: Number((m.avanceTemporal.planificado * 100).toFixed(1)),
      diferenciaEnPuntos: Number((m.avanceTemporal.desviacion * 100).toFixed(1)),
      porcentajeDeHitosConAtraso: porcentaje(m.hitos.atrasados, m.hitos.total),
    },
    atrasos: {
      porcentajeDeActividadesConAtraso: porcentaje(a.atrasadas.length, m.tareas.hojas),
      medianaDeAtrasoEnDiasHabiles: a.medianaDiasHabiles,
      repartoPorTramo: a.reparto.map((t) => ({
        tramo: t.rotulo,
        porcentajeDeLasAtrasadas: porcentaje(t.cuantas, a.atrasadas.length),
      })),
    },
    fecha: p
      ? {
          cierreProyectadoAlRitmoActual: p.cierreProyectado,
          diasHabilesPorRecuperar:
            p.margenProyectadoDiasHabiles != null && p.margenProyectadoDiasHabiles < 0 ? -p.margenProyectadoDiasHabiles : 0,
          supuesto:
            'Es la fecha si desde hoy todo corre según lo planeado y no se recupera nada. No es un pronóstico: es lo que hay que revertir.',
        }
      : null,
    olas: oyf
      ? oyf.olas.map((o) => ({
          ola: o.numero,
          ambiente: o.ambiente,
          fase: o.fase.startsWith('Corte al') ? 'En corte' : o.fase,
          corteComprometido: o.corteComprometido,
          corteProyectado: o.corteProyectado,
          yaSeCorto: o.cortada,
          desplazamientoEnDiasHabiles: o.atrasoDiasHabiles,
          quedaDespuesDeLaFechaComprometida: !o.cortada && o.corteProyectado !== null && o.corteProyectado > limite,
          dependeDe: o.compuertas,
        }))
      : null,
    compuertas: oyf
      ? oyf.compuertas.map((c) => ({
          compuerta: `${c.codigo} · ${c.nombre}`,
          habilitaOlas: c.olas,
          porcentajeListo: porcentaje(c.listas, c.total),
          desplazamientoEnDiasHabiles: c.atrasoDiasHabiles,
        }))
      : null,
    frentesDePlataforma: oyf
      ? oyf.frentes.map((f) => ({
          frente: f.nombre,
          avanceReal: Math.round(f.avanceReal * 100),
          avanceEsperado: Math.round(f.avanceEsperado * 100),
          desplazamientoEnDiasHabiles: f.atrasoDiasHabiles,
          terminado: f.terminado,
        }))
      : null,
    decisionesQueNecesitamosDelCliente: cc
      ? cc.whatCanMoveIt.slice(0, 5).map((r) => ({ decision: r.name, comprometidaPara: r.dueDate }))
      : null,
    temasAbiertos: {
      bloqueos: e.bloqueos.filter((b) => !b.resuelto).map((b) => b.descripcion),
      riesgos: e.riesgos
        .filter((r) => r.estado !== 'CLOSED')
        .map((r) => ({ riesgo: r.descripcion, mitigacion: r.mitigacion })),
      acuerdosPendientes: e.acuerdos
        .filter((x) => x.estado === 'PENDING' || x.estado === 'IN_PROGRESS')
        .map((x) => x.titulo),
    },
  }
}

function construirPromptCompartible(hechos: Record<string, unknown>): string {
  const cliente = String(hechos.cliente ?? 'el cliente')
  return `Eres el director de entrega de SoftwareOne. Escribes la lectura de un reporte INTERNO que leen los líderes y los PMs de SoftwareOne.

Supón SIEMPRE que un PM va a copiar y pegar cualquier párrafo tuyo en un correo al banco. Todo lo que escribas tiene que poder leerse frente al cliente: sereno, profesional, sin alarma y sin señalar culpables. Pero sin ocultar nada: si una fecha está en riesgo, se dice.

DATOS (ya calculados — úsalos, no inventes ninguno):
${JSON.stringify(hechos, null, 2)}

REGLAS, en orden de importancia:

1. NO INVENTES UNA SOLA CIFRA NI UNA ACCIÓN. Solo puedes citar lo que está arriba. No digas que el equipo «ya está haciendo» algo que no esté en los datos.
2. Cantidades de actividades, NUNCA. Usa porcentajes («el 16 % de las actividades»). Los días sí van como número, siempre como «días hábiles».
3. Palabras prohibidas: «catastrófico», «crítico», «crisis», «grave», «alarmante», «deuda», «fracaso», «imposible», «culpa», «incumplimiento», «fallo», «suelo mecánico». Usa «requiere atención», «en riesgo», «desplazamiento», «por recuperar».
4. Cada problema va seguido de lo que hace falta para resolverlo: qué compuerta o frente hay que destrabar y qué decisión se necesita y de quién, por papel («el equipo de SoftwareOne», «${cliente}»), nunca por nombre de persona.
5. Nada de culpas: lo que depende del cliente se escribe como «decisiones que necesitamos», con su fecha.
6. Nada de jerga: prohibidas «holgura», «ruta crítica», «línea base», «desfase», «WBS», «CPM».
7. NO escribas un veredicto ni califiques el proyecto.
8. Prosa corrida en español neutro. Sin viñetas, sin markdown, sin negritas.
9. Si las olas van encadenadas, dilo una sola vez: el desplazamiento de las primeras se traslada a las demás, y recuperarlas recupera el resto.
10. No menciones problemas de captura de datos ni la calidad del registro.
11. Como máximo 3 secciones, cada una con 1 o 2 párrafos, y hasta 5 peticiones. El rótulo de cada sección lleva de 2 a 5 palabras (menos de 40 caracteres).

Responde ÚNICAMENTE con este JSON, sin markdown ni texto adicional:
{
  "entradilla": "dos o tres frases con la lectura general, en tono sereno. La primera dice dónde está el proyecto; la segunda, qué hace falta.",
  "secciones": [
    { "rotulo": "ROTULO CORTO", "afirmacion": "afirmación de 6 a 12 palabras", "parrafos": ["párrafo", "párrafo"] }
  ],
  "peticiones": [
    { "texto": "acción o decisión concreta para recuperar la fecha", "aQuien": "el equipo de SoftwareOne o ${cliente}, por papel", "paraCuando": "plazo" }
  ]
}

Entre 2 y 3 secciones. Entre 3 y 5 peticiones.`
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
9. Si hay olas de migración, conecta efecto y causa: qué olas se corren y qué frente de plataforma o compuerta las está deteniendo. Si los bloqueos o riesgos registrados explican esa causa, cítalos por su contenido.
10. Si hay una alerta de orden de corte, no afirmes cuál ola se cortó realmente: pide que se confirme la captura.

11. Como máximo 3 secciones, cada una con 1 o 2 párrafos, y hasta 5 peticiones. El rótulo de cada sección lleva de 2 a 5 palabras (menos de 40 caracteres).

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
  e: Expediente,
  version: VersionDelReporte = 'EJECUTIVO'
): Promise<NarrativaEjecutiva | undefined> {
  try {
    const prompt =
      version === 'COMPARTIBLE'
        ? construirPromptCompartible(hechosParaCompartir(e))
        : construirPrompt(hechosDelExpediente(e))
    const crudo = await AIService.runRawPrompt(prompt, {
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

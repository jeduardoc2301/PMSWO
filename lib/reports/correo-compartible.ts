/**
 * El reporte diario, versión 2: interno, pero escrito para poder compartirse.
 *
 * La versión 1 (`correo-ejecutivo.ts`) se sigue mandando tal cual. Ésta existe porque el reporte es
 * interno pero se da por hecho que alguien va a copiar y pegar un pedazo en un correo al banco. Así
 * que la regla de diseño es una sola: **cualquier párrafo de este correo se puede pegar frente al
 * cliente sin hacer daño**. El fondo es el mismo —las mismas cifras, las mismas olas fuera de fecha—;
 * cambia cómo se dice y en qué orden.
 *
 * ## Lo que cambia respecto de la versión 1
 *
 *   - **Arriba, un texto ya redactado para compartir.** Si alguien va a copiar algo, que copie lo que
 *     se escribió para eso. Es determinista, no lo escribe el modelo: sale aunque Bedrock falle y no
 *     puede inventar nada.
 *   - **Porcentajes, no cantidades.** «16 % de las actividades», no «201 actividades».
 *   - **El rojo, sólo para lo que pide una decisión**: las olas que ya caen después de la fecha
 *     límite. Diez filas iguales en rojo cuentan un solo problema diez veces.
 *   - **Cada problema con su salida**: qué hace falta para volver a la fecha comprometida.
 *   - **Lo del cliente, como decisiones que necesitamos**, con su fecha, no como «vencido, responde el
 *     cliente».
 *   - **Lo que no le sirve al cliente va al final, bajo una franja de uso interno**: calidad de
 *     captura, listados de actividades y el método. También en tono neutro: la franja es una red,
 *     no un permiso para ser duros.
 */
import type { Expediente } from '@/services/expediente-del-reporte.service'
import type { NarrativaEjecutiva } from './narrativa-ejecutiva'
import type { OlasYFrentes } from './olas-y-frentes'
import { C, SANS, SERIF, esc, parrafo, seccion, shell } from '@/lib/email/html'
import {
  ANCHO,
  COLOR_SEMAFORO,
  ESTADO_ACUERDO,
  ESTADO_RIESGO,
  alerta,
  deIso,
  fechaCorta,
  fechaLarga,
  fechaMedia,
  ficha,
  graficaDeCortes,
  listaDeOlas,
  medida,
  nota,
  pct,
  porSeveridad,
  renglonDeVeredicto,
  tablaDeColumnas,
  tablaDeLineas,
  textoDeAlerta,
  veredictoDeLasCifras,
  type CorreoArmado,
  type Veredicto,
} from './correo-ejecutivo'

const AMBAR = COLOR_SEMAFORO['Atención']

/** El mismo veredicto de las cifras, dicho como lo que pide y no como calificación. */
const ETIQUETA: Record<Veredicto, string> = {
  'En riesgo': 'Requiere decisiones',
  'Atención': 'Requiere atención',
  'En curso': 'En curso',
}
const COLOR_ETIQUETA: Record<Veredicto, string> = {
  'En riesgo': AMBAR,
  'Atención': AMBAR,
  'En curso': C.teal,
}

const porcentaje = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0)

/** «I-04 · [Banco] Política de seguridad…» → «Política de seguridad…». El código interno no le dice nada a quien lo lee. */
function limpiarTitulo(t: string): string {
  return t
    .replace(/^\s*[A-Z]{1,5}-\d+\s*·\s*/, '')
    .replace(/^\s*\[[^\]]+\]\s*/, '')
    .trim()
}

/** «EN-01 · Landing Zone» → «Landing Zone (EN-01)». */
function nombreDeFrente(n: string): string {
  const m = n.match(/^(EN-\d+)\s*·\s*(.+)$/)
  return m ? `${m[2]} (${m[1]})` : n
}

/** «a, b y c». */
function enumerar(cosas: readonly string[]): string {
  if (cosas.length <= 1) return cosas.join('')
  return `${cosas.slice(0, -1).join(', ')} y ${cosas[cosas.length - 1]}`
}

interface Lectura {
  readonly avance: number
  readonly calendario: number
  readonly puntos: number
  readonly pctAtrasadas: number
  readonly pctHitos: number
  readonly limite: string
  /** Días hábiles que hay que recuperar para volver a la fecha comprometida. */
  readonly porRecuperar: number
  readonly olasFuera: readonly number[]
  readonly o: OlasYFrentes | null
}

function leer(e: Expediente): Lectura {
  const m = e.panel.metricas
  const p = e.plan?.proyeccion
  const limite = e.proyecto.comprometidoPara.toISOString().slice(0, 10)
  const o = e.plan?.olasYFrentes ?? null
  return {
    avance: Math.round(m.proyecto.progresoGlobal * 100),
    calendario: Math.round(m.avanceTemporal.planificado * 100),
    puntos: Math.round(m.avanceTemporal.desviacion * 100),
    pctAtrasadas: porcentaje(e.atrasos.atrasadas.length, m.tareas.hojas),
    pctHitos: porcentaje(m.hitos.atrasados, m.hitos.total),
    limite,
    porRecuperar:
      p?.margenProyectadoDiasHabiles != null && p.margenProyectadoDiasHabiles < 0 ? -p.margenProyectadoDiasHabiles : 0,
    olasFuera: (o?.olas ?? [])
      .filter((x) => !x.cortada && x.corteProyectado !== null && x.corteProyectado > limite)
      .map((x) => x.numero),
    o,
  }
}

/** Las palancas: lo que, destrabado, recupera la fecha. Compuertas abiertas y frentes desplazados. */
function palancas(o: OlasYFrentes | null) {
  const compuertas = (o?.compuertas ?? [])
    .filter((c) => !c.terminada && c.atrasoDiasHabiles > 0)
    .sort((a, b) => b.atrasoDiasHabiles - a.atrasoDiasHabiles)
  const frentes = (o?.frentes ?? [])
    .filter((f) => !f.terminado && f.atrasoDiasHabiles > 5)
    .sort((a, b) => b.atrasoDiasHabiles - a.atrasoDiasHabiles)
    .slice(0, 4)
  return { compuertas, frentes }
}

/**
 * El texto para compartir, redactado de las cifras.
 *
 * Determinista a propósito: es lo que un PM va a pegar en un correo al banco sin leerlo dos veces.
 * No puede depender de que el modelo haya contestado, ni puede traer una cifra que no esté en el plan.
 */
export function textoParaCompartir(e: Expediente): string[] {
  const l = leer(e)
  const parrafos: string[] = []

  parrafos.push(
    `Al ${fechaLarga(deIso(e.corte))}, el proyecto lleva ${l.avance}% de avance, contra ${l.calendario}% del calendario transcurrido.`
  )

  if (l.o && l.o.olas.length > 0) {
    const cortadas = l.o.olas.filter((x) => x.cortada).length
    const total = l.o.olas.length
    const pendientes = l.o.olas.filter((x) => !x.cortada && x.atrasoDiasHabiles !== null)
    const mayor = Math.max(0, ...pendientes.map((x) => x.atrasoDiasHabiles ?? 0))
    const encadenadas = l.o.alertas.find((a) => a.tipo === 'encadenadas')
    let t = `${cortadas === 1 ? 'Se ha cortado 1' : `Se han cortado ${cortadas}`} de las ${total} olas de migración.`
    if (mayor > 0) {
      t += encadenadas
        ? ` Al ritmo actual, las olas pendientes se desplazan ${mayor} días hábiles`
        : ` Al ritmo actual, las olas pendientes se desplazan hasta ${mayor} días hábiles`
      t += l.olasFuera.length
        ? `; ${l.olasFuera.length === 1 ? `la ola ${l.olasFuera[0]} quedaría` : `las olas ${enumerar(l.olasFuera.map(String))} quedarían`} después del ${fechaMedia(deIso(l.limite))}.`
        : `, y todas siguen dentro del ${fechaMedia(deIso(l.limite))}.`
    }
    parrafos.push(t)
  }

  const { compuertas, frentes } = palancas(l.o)
  const prioridades = [
    ...compuertas.slice(0, 2).map((c) => `${c.nombre.charAt(0).toLowerCase()}${c.nombre.slice(1)} (${c.codigo})`),
    ...frentes.slice(0, 2).map((f) => nombreDeFrente(f.nombre)),
  ]
  if (prioridades.length > 0) {
    parrafos.push(
      `${l.porRecuperar > 0 ? `Para recuperar los ${l.porRecuperar} días hábiles y volver a la fecha comprometida, lo` : 'Lo'} prioritario es avanzar en ${enumerar(prioridades)}.`
    )
  }

  const decisiones = (e.plan?.informe?.whatCanMoveIt ?? []).slice(0, 3)
  if (decisiones.length > 0) {
    parrafos.push(
      `De ${e.proyecto.cliente} necesitamos: ${enumerar(decisiones.map((d) => limpiarTitulo(d.name).replace(/\.$/, '')))}.`
    )
  }
  return parrafos
}

export function armarCorreoCompartible(
  e: Expediente,
  narrativa: NarrativaEjecutiva | undefined,
  opciones: { appUrl?: string } = {}
): CorreoArmado {
  const l = leer(e)
  const a = e.atrasos
  const p = e.plan?.proyeccion
  const veredicto = veredictoDeLasCifras(e)
  const compromiso = e.proyecto.comprometidoPara
  const limiteMedio = fechaMedia(compromiso)

  const subject = `${e.proyecto.nombre} · Reporte diario · ${fechaMedia(deIso(e.corte))}`
  const compartir = textoParaCompartir(e)
  const preheader = compartir[0] ?? `Avance ${l.avance}% contra ${l.calendario}% de calendario.`

  const partes: string[] = []

  // ── Masthead y encabezado ─────────────────────────────────────────────────────────────────
  partes.push(`<tr><td class="pad" style="background-color:#000000; padding:16px 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td style="font-family:${SANS}; font-size:13px; letter-spacing:3px; color:#FFFFFF; font-weight:bold;">SOFTWAREONE</td>
      <td align="right" style="font-family:${SANS}; font-size:10px; letter-spacing:1.4px; text-transform:uppercase; color:#9C9A99;">Reporte diario · uso interno</td>
    </tr>
  </table>
</td></tr>`)

  partes.push(`<tr><td class="pad" style="padding:30px 36px 0 36px;">
  <div style="font-family:${SANS}; font-size:11px; letter-spacing:1.4px; text-transform:uppercase; color:${C.grayLight};">Corte al ${esc(fechaLarga(deIso(e.corte)))}</div>
  <div style="font-family:${SERIF}; font-size:27px; line-height:33px; color:${C.ink}; padding-top:6px;">${esc(e.proyecto.nombre)}</div>
  <div style="font-family:${SANS}; font-size:13px; color:${C.gray}; padding-top:5px;">${esc(e.proyecto.cliente)} · comprometido para el ${esc(limiteMedio)} de ${compromiso.getUTCFullYear()}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
    <tr><td bgcolor="${COLOR_ETIQUETA[veredicto]}" style="background-color:${COLOR_ETIQUETA[veredicto]}; padding:5px 13px; font-family:${SANS}; font-size:11px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; color:#FFFFFF;">${esc(ETIQUETA[veredicto])}</td></tr>
  </table>
</td></tr>`)

  // ── Texto para compartir ──────────────────────────────────────────────────────────────────
  partes.push(`<tr><td class="pad" style="padding:22px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px; background-color:#F4F7F8; border-left:3px solid ${C.teal};">
    <tr><td style="padding:14px 16px 4px 16px; font-family:${SANS}; font-size:10px; letter-spacing:1.2px; text-transform:uppercase; color:${C.teal}; font-weight:bold;">Texto para compartir · se puede copiar tal cual</td></tr>
    ${compartir
      .map(
        (t) =>
          `<tr><td style="padding:6px 16px; font-family:${SERIF}; font-size:14px; line-height:22px; color:${C.ink};">${esc(t)}</td></tr>`
      )
      .join('')}
    <tr><td style="padding:0 0 10px 0; font-size:0; line-height:0;">&nbsp;</td></tr>
  </table>
</td></tr>`)

  if (narrativa?.entradilla) partes.push(parrafo(narrativa.entradilla, 'padding-top:20px;'))

  // ── ¿Llegamos? ────────────────────────────────────────────────────────────────────────────
  partes.push(seccion(`¿Llegamos al ${limiteMedio}?`))
  const renglones = [
    renglonDeVeredicto(
      'Avance',
      `${l.avance}% real contra ${l.calendario}% del calendario`,
      l.puntos < 0
        ? `${Math.abs(l.puntos)} puntos por detrás del calendario transcurrido.`
        : 'Al parejo o por delante del calendario transcurrido.',
      C.ink,
      true
    ),
    renglonDeVeredicto(
      'Actividades con atraso',
      `${l.pctAtrasadas}% de las actividades`,
      `La mitad de ellas lleva ${a.medianaDiasHabiles} días hábiles o menos de atraso.`,
      l.pctAtrasadas > 0 ? AMBAR : C.teal,
      false
    ),
  ]
  if (p) {
    const cierre = deIso(p.cierreProyectado)
    renglones.push(
      renglonDeVeredicto(
        'Fecha proyectada al ritmo actual',
        `${fechaMedia(cierre)} de ${cierre.getUTCFullYear()}${l.porRecuperar > 0 ? ` · ${l.porRecuperar} días hábiles por recuperar` : ''}`,
        'Es la fecha si desde hoy todo sigue según lo planeado y no se recupera nada. No es un pronóstico: es lo que hay que revertir.',
        l.porRecuperar > 0 ? C.crimson : C.teal,
        false
      )
    )
  }
  partes.push(`<tr><td class="pad" style="padding:16px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">${renglones.join('')}</table>
</td></tr>`)

  if (l.o) partes.push(...graficaDeCortes(l.o.olas, l.limite, e.corte, 'limite'))

  // ── Qué hace falta para volver a la fecha ─────────────────────────────────────────────────
  const { compuertas, frentes } = palancas(l.o)
  const decisiones = (e.plan?.informe?.whatCanMoveIt ?? []).slice(0, 5)
  if (l.porRecuperar > 0 || compuertas.length > 0 || frentes.length > 0 || decisiones.length > 0) {
    partes.push(seccion(`Qué hace falta para volver al ${limiteMedio}`))
    if (l.porRecuperar > 0) {
      partes.push(
        parrafo(
          `Hay que recuperar ${l.porRecuperar} días hábiles.${l.olasFuera.length ? ` Hoy ${l.olasFuera.length === 1 ? `queda fuera de la fecha la ola ${l.olasFuera[0]}` : `quedan fuera de la fecha las olas ${enumerar(l.olasFuera.map(String))}`}.` : ''} Esto es lo que más acerca la fecha:`,
          'padding-top:12px; font-size:14px;'
        )
      )
    }
    const filas = [
      ...compuertas.map((c) => ({
        izq: `${c.codigo} · ${c.nombre}`,
        sub: `Habilita ${c.olas.length === 1 ? 'la' : 'las'} ${listaDeOlas(c.olas)} · ${porcentaje(c.listas, c.total)}% lista`,
        der: `+${c.atrasoDiasHabiles} d`,
      })),
      ...frentes.map((f) => ({
        izq: nombreDeFrente(f.nombre),
        sub: `Avance ${pct(f.avanceReal)} de ${pct(f.avanceEsperado)} esperado`,
        der: `+${f.atrasoDiasHabiles} d`,
      })),
    ]
    if (filas.length) partes.push(tablaDeLineas(filas, AMBAR))

    if (decisiones.length > 0) {
      partes.push(
        parrafo(`Decisiones que necesitamos de ${e.proyecto.cliente}:`, 'padding-top:18px; font-size:14px;')
      )
      partes.push(
        tablaDeLineas(
          decisiones.map((d) => ({
            izq: limpiarTitulo(d.name),
            sub: `Comprometida para el ${fechaMedia(deIso(d.dueDate))}`,
            der: fechaCorta(d.dueDate),
          })),
          C.ink
        )
      )
    }
    partes.push(nota('El desplazamiento se mide en días hábiles entre la fecha comprometida y la proyectada al ritmo actual.'))
  }

  // ── Olas ──────────────────────────────────────────────────────────────────────────────────
  if (l.o && l.o.olas.length > 0) {
    const cortadas = l.o.olas.filter((x) => x.cortada).length
    partes.push(seccion(`Olas de migración · ${cortadas} de ${l.o.olas.length} cortadas`))
    const encadenadas = l.o.alertas.find((x) => x.tipo === 'encadenadas')
    if (encadenadas && encadenadas.tipo === 'encadenadas') {
      partes.push(
        alerta(
          `Las olas van encadenadas: el desplazamiento de las primeras se traslada a las demás (${encadenadas.diasHabiles} días hábiles). Recuperar las primeras olas recupera el resto.`,
          AMBAR
        )
      )
    }
    partes.push(
      tablaDeColumnas(
        [
          { titulo: 'Ola', ancho: 200 },
          { titulo: 'Corte comprometido → proyectado', ancho: 124 },
          { titulo: 'Avance real / esperado', ancho: 84 },
          { titulo: 'Desplazamiento', ancho: 120, alinear: 'right' },
        ],
        l.o.olas.map((x) => {
          const fuera = l.olasFuera.includes(x.numero)
          const comprometido = x.corteComprometido ? fechaCorta(x.corteComprometido) : '—'
          return [
            {
              texto: `Ola ${x.numero}${x.ambiente ? ` · ${x.ambiente}` : ''}`,
              negrita: true,
              sub: [
                x.servidores ? `${x.servidores} servidores` : null,
                x.fase.startsWith('Corte al') ? 'En corte' : x.fase,
              ]
                .filter(Boolean)
                .join(' · '),
            },
            {
              texto: x.cortada
                ? `${comprometido} · cortada`
                : `${comprometido} → ${x.corteProyectado ? fechaCorta(x.corteProyectado) : '—'}`,
            },
            { texto: x.avanceReal === 0 && x.avanceEsperado === 0 ? '—' : `${pct(x.avanceReal)} / ${pct(x.avanceEsperado)}` },
            x.cortada
              ? { texto: 'Cortada', color: C.gray, negrita: true }
              : !x.atrasoDiasHabiles
                ? { texto: 'En fecha', color: C.teal, negrita: true }
                : {
                    texto: fuera ? `+${x.atrasoDiasHabiles} d · fuera de fecha` : `+${x.atrasoDiasHabiles} d`,
                    color: fuera ? C.crimson : AMBAR,
                    negrita: true,
                  },
          ]
        })
      )
    )

    if (l.o.compuertas.length > 0) {
      partes.push(
        parrafo(
          'Las compuertas son lo que la plataforma debe tener listo antes de cada grupo de olas.',
          'padding-top:18px; font-size:14px;'
        )
      )
      partes.push(
        tablaDeColumnas(
          [
            { titulo: 'Compuerta', ancho: 250 },
            { titulo: 'Lista', ancho: 70 },
            { titulo: 'Comprometida → proyectada', ancho: 110 },
            { titulo: 'Desplazamiento', ancho: 98, alinear: 'right' },
          ],
          l.o.compuertas.map((c) => [
            {
              texto: `${c.codigo} · ${c.nombre}`,
              negrita: true,
              sub: c.olas.length ? `Habilita ${c.olas.length === 1 ? 'la' : 'las'} ${listaDeOlas(c.olas)}` : undefined,
            },
            { texto: `${porcentaje(c.listas, c.total)}%` },
            { texto: c.terminada ? fechaCorta(c.comprometida) : `${fechaCorta(c.comprometida)} → ${fechaCorta(c.proyectada)}` },
            c.terminada
              ? { texto: 'Lista', color: C.teal, negrita: true }
              : c.atrasoDiasHabiles > 0
                ? { texto: `+${c.atrasoDiasHabiles} d`, color: AMBAR, negrita: true }
                : { texto: 'En fecha', color: C.teal, negrita: true },
          ])
        )
      )
    }
  }

  // ── Frentes ───────────────────────────────────────────────────────────────────────────────
  if (l.o && l.o.frentes.length > 0) {
    partes.push(seccion('Frentes de plataforma'))
    partes.push(
      tablaDeColumnas(
        [
          { titulo: 'Frente', ancho: 200 },
          { titulo: 'Comprometido → proyectado', ancho: 124 },
          { titulo: 'Avance real / esperado', ancho: 84 },
          { titulo: 'Desplazamiento', ancho: 120, alinear: 'right' },
        ],
        l.o.frentes.map((f) => [
          { texto: f.nombre, negrita: true },
          { texto: f.terminado ? fechaCorta(f.comprometido) : `${fechaCorta(f.comprometido)} → ${fechaCorta(f.proyectado)}` },
          { texto: f.terminado ? '100%' : `${pct(f.avanceReal)} / ${pct(f.avanceEsperado)}` },
          f.terminado
            ? { texto: 'Terminado', color: C.teal, negrita: true }
            : f.atrasoDiasHabiles > 0
              ? { texto: `+${f.atrasoDiasHabiles} d`, color: AMBAR, negrita: true }
              : { texto: 'En fecha', color: C.teal, negrita: true },
        ])
      )
    )
  }

  // ── Dónde está hoy ────────────────────────────────────────────────────────────────────────
  partes.push(seccion('Dónde está el proyecto hoy'))
  partes.push(`<tr><td class="pad" style="padding:16px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">
    <tr>
      ${ficha(`${l.avance}%`, 'Avance real', C.ink)}
      ${ficha(`${l.puntos > 0 ? '+' : ''}${l.puntos} pp`, 'Contra calendario', l.puntos < 0 ? AMBAR : C.teal)}
      ${ficha(`${l.pctHitos}%`, 'Hitos con atraso', l.pctHitos > 0 ? AMBAR : C.ink)}
      ${ficha(`${l.pctAtrasadas}%`, 'Actividades con atraso', l.pctAtrasadas > 0 ? AMBAR : C.ink)}
    </tr>
  </table>
</td></tr>`)
  partes.push(medida('Avance real', l.avance, C.teal))
  partes.push(medida('Calendario', l.calendario, C.gray))

  // ── Temas abiertos ────────────────────────────────────────────────────────────────────────
  const bloqueos = e.bloqueos.filter((b) => !b.resuelto).sort((x, y) => porSeveridad(x.severidad, y.severidad))
  const riesgos = e.riesgos.filter((r) => r.estado !== 'CLOSED').sort((x, y) => porSeveridad(x.nivel, y.nivel))
  const acuerdos = e.acuerdos.filter((x) => x.estado !== 'CANCELLED')
  if (bloqueos.length || riesgos.length || acuerdos.length) {
    partes.push(seccion('Temas abiertos'))
    if (bloqueos.length) {
      partes.push(parrafo('Bloqueos', 'padding-top:12px; font-size:14px; font-weight:bold;'))
      partes.push(
        tablaDeLineas(
          bloqueos.slice(0, 6).map((b) => ({ izq: b.descripcion, sub: `Abierto hace ${b.diasAbierto} días`, der: `${b.diasAbierto} d` })),
          C.ink
        )
      )
    }
    if (riesgos.length) {
      partes.push(parrafo('Riesgos y su mitigación', 'padding-top:16px; font-size:14px; font-weight:bold;'))
      partes.push(
        tablaDeLineas(
          riesgos.slice(0, 6).map((r) => ({
            izq: r.descripcion,
            sub: `${ESTADO_RIESGO[r.estado] ?? r.estado}${r.mitigacion ? ` · mitigación: ${r.mitigacion}` : ''}`,
            der: `${r.diasAbierto} d`,
          })),
          C.ink
        )
      )
    }
    if (acuerdos.length) {
      partes.push(parrafo('Acuerdos', 'padding-top:16px; font-size:14px; font-weight:bold;'))
      partes.push(
        tablaDeLineas(
          acuerdos.slice(0, 6).map((ac) => ({
            izq: ac.titulo,
            sub: `${ESTADO_ACUERDO[ac.estado] ?? ac.estado} · acordado el ${fechaMedia(ac.acordadoEl)}`,
            der: fechaCorta(ac.acordadoEl.toISOString().slice(0, 10)),
          })),
          C.ink
        )
      )
    }
  }

  // ── La lectura ────────────────────────────────────────────────────────────────────────────
  for (const s of narrativa?.secciones?.slice(0, 3) ?? []) {
    partes.push(seccion(s.rotulo))
    if (s.afirmacion) {
      partes.push(
        `<tr><td class="pad" style="padding:12px 36px 0 36px; font-family:${SERIF}; font-size:18px; line-height:25px; color:${C.ink};">${esc(s.afirmacion)}</td></tr>`
      )
    }
    for (const t of s.parrafos?.slice(0, 2) ?? []) partes.push(parrafo(t))
  }
  if (narrativa?.peticiones?.length) {
    partes.push(seccion('Acciones y decisiones para recuperar la fecha'))
    const filas = narrativa.peticiones
      .slice(0, 5)
      .map((q, i) => {
        const meta = [q.aQuien, q.paraCuando].filter(Boolean).join(' · ')
        return `<tr>
  <td valign="top" width="26" style="width:26px; padding:10px 0 0 0; font-family:${SERIF}; font-size:15px; color:${C.teal};">${i + 1}.</td>
  <td style="padding:10px 0 0 0; font-family:${SANS}; font-size:13px; line-height:19px; color:${C.ink};">${esc(q.texto)}${meta ? `<div style="font-family:${SANS}; font-size:11px; color:${C.grayLight}; padding-top:3px;">${esc(meta)}</div>` : ''}</td>
</tr>`
      })
      .join('')
    partes.push(`<tr><td class="pad" style="padding:6px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">${filas}</table>
</td></tr>`)
  }

  // ── Franja de uso interno ─────────────────────────────────────────────────────────────────
  const interno: string[] = []
  for (const al of l.o?.alertas ?? []) {
    if (al.tipo === 'orden') interno.push(alerta(`Revisar la captura: ${textoDeAlerta(al)}`, AMBAR))
  }
  if (a.compromisos.length > 0) {
    interno.push(parrafo('Hitos, entregas y aprobaciones con mayor atraso', 'padding-top:14px; font-size:14px; font-weight:bold;'))
    interno.push(
      tablaDeLineas(
        a.compromisos.slice(0, 5).map((c) => ({
          izq: c.titulo,
          sub: `Comprometido para el ${fechaMedia(c.comprometidaPara)}`,
          der: `${c.diasHabilesDeAtraso} d`,
        })),
        C.ink
      )
    )
  }
  if (a.ejecucion.length > 0) {
    interno.push(parrafo('Actividades de ejecución con mayor atraso', 'padding-top:14px; font-size:14px; font-weight:bold;'))
    interno.push(
      tablaDeLineas(
        a.ejecucion.slice(0, 5).map((c) => ({
          izq: c.titulo,
          sub: c.avancePct > 0 ? `${c.avancePct}% capturado · comprometida para el ${fechaMedia(c.comprometidaPara)}` : `Sin arrancar · comprometida para el ${fechaMedia(c.comprometidaPara)}`,
          der: `${c.diasHabilesDeAtraso} d`,
        })),
        C.ink
      )
    )
  }
  if (p) {
    interno.push(
      nota(
        `Cómo se calcula la fecha proyectada: las actividades abiertas que el plan decía que ya debieron arrancar se mueven a hoy, descontando el avance que ya tienen, y se reprograma la cadena completa. Es la fecha más temprana posible si todo sigue según lo planeado, no un pronóstico.`
      )
    )
  }
  if (interno.length) {
    partes.push(`<tr><td class="pad" style="padding:34px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">
    <tr><td bgcolor="${C.ink}" style="background-color:${C.ink}; padding:8px 14px; font-family:${SANS}; font-size:10px; letter-spacing:1.6px; text-transform:uppercase; color:#FFFFFF; font-weight:bold;">Uso interno · no reenviar</td></tr>
  </table>
</td></tr>`)
    partes.push(...interno)
  }

  if (opciones.appUrl) {
    const url = `${opciones.appUrl.replace(/\/$/, '')}/es/projects/${e.proyecto.id}`
    partes.push(`<tr><td class="pad" align="left" style="padding:26px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td bgcolor="${C.ink}" style="background-color:${C.ink}; padding:11px 22px;">
      <a href="${esc(url)}" style="font-family:${SANS}; font-size:13px; font-weight:bold; letter-spacing:0.4px; color:#FFFFFF; text-decoration:none; display:inline-block;">Abrir el plan completo</a>
    </td></tr>
  </table>
</td></tr>`)
  }

  partes.push(`<tr><td class="pad" style="padding:30px 36px 32px 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr><td style="border-top:1px solid ${C.rule}; padding-top:14px; font-family:${SANS}; font-size:11px; line-height:17px; color:${C.grayLight};">
      Reporte interno de PM SWO con los datos del plan al ${esc(fechaLarga(deIso(e.corte)))}. Está redactado para que cualquier parte, salvo la franja de uso interno, se pueda compartir. Las cifras se calculan del plan; los párrafos en prosa los redacta un modelo a partir de esas mismas cifras y, ante cualquier diferencia, mandan las cifras.
    </td></tr>
  </table>
</td></tr>`)

  const html = shell({ title: subject, preheader, body: partes.join('\n') })
  return { subject, html, text: armarTextoPlano(e, narrativa, veredicto, compartir) }
}

function armarTextoPlano(
  e: Expediente,
  narrativa: NarrativaEjecutiva | undefined,
  veredicto: Veredicto,
  compartir: readonly string[]
): string {
  const l = leer(e)
  const p = e.plan?.proyeccion
  const L: string[] = [
    'SOFTWAREONE · REPORTE DIARIO · USO INTERNO',
    `Corte al ${fechaLarga(deIso(e.corte))}`,
    '',
    e.proyecto.nombre,
    `${e.proyecto.cliente} · comprometido para el ${fechaMedia(e.proyecto.comprometidoPara)}`,
    `Estado: ${ETIQUETA[veredicto]}`,
    '',
    'TEXTO PARA COMPARTIR (se puede copiar tal cual)',
    ...compartir.map((t) => `  ${t}`),
    '',
  ]
  if (narrativa?.entradilla) L.push(narrativa.entradilla, '')

  L.push(
    `¿LLEGAMOS AL ${fechaMedia(e.proyecto.comprometidoPara).toUpperCase()}?`,
    `  Avance ..................... ${l.avance}% real contra ${l.calendario}% del calendario`,
    `  Actividades con atraso ..... ${l.pctAtrasadas}%`
  )
  if (p) {
    L.push(`  Fecha proyectada ........... ${p.cierreProyectado}${l.porRecuperar > 0 ? ` (${l.porRecuperar} días hábiles por recuperar)` : ''}`)
  }
  L.push('')

  if (l.o && l.o.olas.length > 0) {
    L.push('OLAS DE MIGRACIÓN')
    for (const x of l.o.olas) {
      const d = x.cortada ? 'cortada' : !x.atrasoDiasHabiles ? 'en fecha' : `+${x.atrasoDiasHabiles} d${l.olasFuera.includes(x.numero) ? ' · fuera de fecha' : ''}`
      L.push(`  Ola ${x.numero} ${x.ambiente} — ${x.corteComprometido ?? '—'} → ${x.corteProyectado ?? '—'} — ${d}`)
    }
    L.push('')
  }
  if (l.o && l.o.frentes.length > 0) {
    L.push('FRENTES DE PLATAFORMA')
    for (const f of l.o.frentes) {
      L.push(`  ${f.nombre} — ${f.terminado ? 'terminado' : `${pct(f.avanceReal)} / ${pct(f.avanceEsperado)} — ${f.atrasoDiasHabiles > 0 ? `+${f.atrasoDiasHabiles} d` : 'en fecha'}`}`)
    }
    L.push('')
  }
  if (narrativa?.peticiones?.length) {
    L.push('ACCIONES Y DECISIONES PARA RECUPERAR LA FECHA')
    narrativa.peticiones.slice(0, 5).forEach((q, i) => {
      L.push(`  ${i + 1}. ${q.texto}${q.aQuien ? ` — ${q.aQuien}` : ''}${q.paraCuando ? ` (${q.paraCuando})` : ''}`)
    })
    L.push('')
  }
  L.push(
    'Reporte interno de PM SWO. Salvo la franja de uso interno del correo HTML, cualquier parte se puede compartir.',
    'Las cifras salen del plan; ante cualquier diferencia con la prosa, mandan las cifras.'
  )
  return L.join('\n')
}

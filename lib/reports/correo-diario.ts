/**
 * El reporte diario, en HTML de correo.
 *
 * Mismas cifras y misma voz que el reporte en Word, pero aquí no hay adjunto: el correo ES el
 * reporte. Se abre en el teléfono, en tres segundos, camino a una junta. Por eso lo primero que
 * se ve es el veredicto y el número que lo sostiene, y el detalle viene después para quien baje.
 *
 * Decisiones de diseño que no son de gusto:
 *
 * - **Masthead tipográfico, sin imagen.** Outlook corporativo bloquea imágenes externas por
 *   omisión. Un logo que no carga deja un hueco con texto alternativo justo donde va la marca;
 *   la versalita espaciada sobre filete negro se ve siempre, igual en los dos casos.
 * - **Cada barra lleva su número al lado.** El teal institucional no pasa el piso de croma del
 *   validador de paleta —lee casi gris para algunos ojos—, así que la identidad de cada medida la
 *   carga la etiqueta de texto, no el color. El color acompaña; no informa solo.
 * - **El calendario va en gris y el alcance en teal.** El calendario es la referencia contra la
 *   que se mide, no una segunda medida que compita: va neutro para que el ojo lea primero el
 *   avance y después el hueco entre los dos.
 * - **El veredicto es un chip con texto dentro.** Nunca un punto de color: quien no distingue
 *   magenta de teal tiene que poder leer «En riesgo».
 */
import type { ExecutiveBrief } from './project-report-docx'
import type { ProjectSnapshot, SnapshotProject } from './project-snapshot'
import { C, SANS, SERIF, esc, parrafo, seccion, shell } from '@/lib/email/html'

export interface CorreoDiarioInput {
  project: SnapshotProject
  snapshot: ProjectSnapshot
  brief?: ExecutiveBrief
  /** URL pública de la app, para el botón que lleva al proyecto. */
  appUrl?: string
  projectId?: string
}

export interface CorreoArmado {
  subject: string
  html: string
  text: string
}

/** Ancho útil dentro de los márgenes de 36px. Outlook necesita píxeles, no porcentajes. */
const ANCHO = 528
const BARRA = 380

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function fechaLarga(d: Date): string {
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

function fechaCorta(d: Date): string {
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`
}

/**
 * Colores de estado. Reservados: no se reutilizan para «una medida más».
 * Siempre viajan con su etiqueta, nunca solos.
 */
const VEREDICTO: Record<string, { fondo: string; texto: string }> = {
  'En riesgo': { fondo: C.crimson, texto: '#FFFFFF' },
  'Atención': { fondo: '#B45309', texto: '#FFFFFF' },
  'En curso': { fondo: C.teal, texto: '#FFFFFF' },
}

/** Deduce el veredicto de las cifras cuando el modelo no dio uno. */
function veredictoDeCifras(snap: ProjectSnapshot): string {
  if (snap.progressIndex < 0.8 || snap.openBlockers.some((b) => b.severity === 'CRITICAL')) {
    return 'En riesgo'
  }
  if (snap.progressIndex < 0.95 || snap.overdue.length > 0) return 'Atención'
  return 'En curso'
}

/**
 * Una barra de medida con su etiqueta y su valor.
 *
 * El relleno y el canal se separan con 2px de blanco en vez de un borde: el borde es tinta que no
 * es dato y engorda la barra; el hueco hace el mismo trabajo sin agregar peso.
 */
function medida(rotulo: string, pct: number, color: string): string {
  const acotado = Math.max(0, Math.min(100, pct))
  // Mínimo visible: un 0.4 % que se redondea a cero deja la barra vacía y parece que no hay dato.
  const relleno = acotado > 0 ? Math.max(3, Math.round((acotado / 100) * BARRA)) : 0
  const hueco = relleno > 0 && relleno < BARRA ? 2 : 0
  const canal = Math.max(0, BARRA - relleno - hueco)

  const celdaRelleno =
    relleno > 0
      ? `<td width="${relleno}" height="10" style="width:${relleno}px; height:10px; background-color:${color}; border-radius:0 4px 4px 0; font-size:0; line-height:0;">&nbsp;</td>`
      : ''
  const celdaHueco =
    hueco > 0
      ? `<td width="2" height="10" style="width:2px; height:10px; background-color:${C.surface}; font-size:0; line-height:0;">&nbsp;</td>`
      : ''
  const celdaCanal =
    canal > 0
      ? `<td width="${canal}" height="10" style="width:${canal}px; height:10px; background-color:${C.track}; font-size:0; line-height:0;">&nbsp;</td>`
      : ''

  return `<tr><td class="pad" style="padding:10px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">
    <tr>
      <td width="92" style="width:92px; font-family:${SANS}; font-size:12px; color:${C.gray}; padding-right:8px;">${esc(rotulo)}</td>
      <td width="${BARRA}" style="width:${BARRA}px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${BARRA}" style="width:${BARRA}px;">
          <tr>${celdaRelleno}${celdaHueco}${celdaCanal}</tr>
        </table>
      </td>
      <td width="56" align="right" style="width:56px; font-family:${SANS}; font-size:13px; font-weight:bold; color:${C.ink};">${acotado.toFixed(0)}%</td>
    </tr>
  </table>
</td></tr>`
}

/**
 * Un dato suelto con su rótulo. La cifra manda; el rótulo explica.
 *
 * El tamaño baja con la longitud porque la columna mide 132px y no se puede recortar un número:
 * «342/1368» a 30px se sale y se encima con la ficha de al lado. Con ocho tareas de ejemplo eso
 * no pasa nunca; con las 1368 de un plan real, pasa siempre. Se mide antes de escribir, en vez de
 * cortar con `overflow:hidden` —que dejaría un número a medias, que es peor que uno chico.
 */
function ficha(valor: string, rotulo: string, color: string): string {
  const tam = valor.length <= 4 ? 30 : valor.length <= 6 ? 24 : 19
  return `<td class="kpi" width="132" valign="top" style="width:132px; padding:0 8px 0 0;">
  <div style="font-family:${SERIF}; font-size:${tam}px; line-height:34px; color:${color};">${esc(valor)}</div>
  <div style="font-family:${SANS}; font-size:10px; line-height:14px; letter-spacing:0.8px; text-transform:uppercase; color:${C.grayLight}; padding-top:2px;">${esc(rotulo)}</div>
</td>`
}

/**
 * La fase, reducida a rótulo.
 *
 * El campo `phase` no siempre trae un rótulo corto: en planes importados trae la frase completa
 * de la fase —«Planificación: diseñar los doce documentos entregables de Mobilize»— y a veces
 * repite el título de la tarea palabra por palabra. Puesta tal cual, la fase pesa más que la
 * tarea y cada renglón se va a dos líneas.
 */
function faseCorta(fase: string | null, titulo: string): string | null {
  if (!fase) return null
  const limpia = fase.trim()
  if (!limpia || limpia === titulo.trim()) return null

  // Las fases con frase suelen traer el rótulo antes de los dos puntos.
  const rotulo = limpia.split(':')[0].trim()
  const base = rotulo.length > 0 && rotulo.length <= 28 ? rotulo : limpia.slice(0, 28).trim()
  return base.length < limpia.length ? `${base}…` : base
}

function boton(url: string, texto: string): string {
  return `<tr><td class="pad" align="left" style="padding:26px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr><td bgcolor="${C.ink}" style="background-color:${C.ink}; padding:11px 22px;">
      <a href="${esc(url)}" style="font-family:${SANS}; font-size:13px; font-weight:bold; letter-spacing:0.4px; color:#FFFFFF; text-decoration:none; display:inline-block;">${esc(texto)}</a>
    </td></tr>
  </table>
</td></tr>`
}

export function armarCorreoDiario(input: CorreoDiarioInput): CorreoArmado {
  const { project, snapshot: s, brief } = input
  const hoy = s.now

  const verdict = brief?.verdict?.trim() || veredictoDeCifras(s)
  const chip = VEREDICTO[verdict] ?? VEREDICTO['Atención']

  const diaActual = Math.min(s.elapsedDays + 1, s.totalDays)
  const vencidas = s.overdue.length
  const bloqueos = s.openBlockers.length

  // ── Asunto ──────────────────────────────────────────────────────────────────────────────────
  // Lleva el estado, no solo el nombre: quien recibe esto todos los días decide desde la bandeja
  // si lo abre ahora o al rato, y un asunto idéntico cada mañana entrena a ignorarlo.
  const alarma = vencidas > 0 ? ` · ${vencidas} vencida${vencidas === 1 ? '' : 's'}` : ''
  const subject = `${project.name} · ${verdict}${alarma} · ${fechaCorta(hoy)}`

  const preheader =
    brief?.deck?.trim() ||
    `Alcance ${s.scopePct}% contra ${s.timePct}% de calendario. ${vencidas} tareas vencidas, ${bloqueos} bloqueos abiertos.`

  const partes: string[] = []

  // Masthead
  partes.push(`<tr><td class="pad" style="background-color:#000000; padding:16px 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td style="font-family:${SANS}; font-size:13px; letter-spacing:3px; color:#FFFFFF; font-weight:bold;">SOFTWAREONE</td>
      <td align="right" style="font-family:${SANS}; font-size:10px; letter-spacing:1.4px; text-transform:uppercase; color:#9C9A99;">Reporte diario</td>
    </tr>
  </table>
</td></tr>`)

  // Encabezado del proyecto
  partes.push(`<tr><td class="pad" style="padding:30px 36px 0 36px;">
  <div style="font-family:${SANS}; font-size:11px; letter-spacing:1.4px; text-transform:uppercase; color:${C.grayLight};">${esc(fechaLarga(hoy))}</div>
  <div style="font-family:${SERIF}; font-size:27px; line-height:33px; color:${C.ink}; padding-top:6px;">${esc(project.name)}</div>
  <div style="font-family:${SANS}; font-size:13px; color:${C.gray}; padding-top:5px;">${esc(project.client)} · día ${diaActual} de ${s.totalDays} · cierra el ${esc(fechaCorta(project.estimatedEndDate))}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
    <tr><td bgcolor="${chip.fondo}" style="background-color:${chip.fondo}; padding:5px 13px; font-family:${SANS}; font-size:11px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; color:${chip.texto};">${esc(verdict)}</td></tr>
  </table>
</td></tr>`)

  if (brief?.lead) {
    partes.push(parrafo(brief.lead, 'padding-top:20px;'))
  }

  // Cifras
  partes.push(seccion('Las cifras de hoy'))
  partes.push(`<tr><td class="pad" style="padding:16px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">
    <tr>
      ${ficha(`${s.done}/${s.total}`, 'Tareas cerradas', C.ink)}
      ${ficha(String(s.remainingDays), 'Días restantes', C.ink)}
      ${ficha(String(vencidas), 'Vencidas', vencidas > 0 ? C.crimson : C.ink)}
      ${ficha(String(bloqueos), 'Bloqueos abiertos', bloqueos > 0 ? C.crimson : C.ink)}
    </tr>
  </table>
</td></tr>`)

  // Avance contra calendario
  partes.push(seccion('Avance contra calendario'))
  partes.push(medida('Alcance', s.scopePct, C.teal))
  partes.push(medida('Calendario', s.timePct, C.gray))
  partes.push(`<tr><td class="pad" style="padding:12px 36px 0 36px; font-family:${SERIF}; font-size:14px; line-height:21px; color:${C.gray};">
  Índice de avance <strong style="color:${s.progressIndex < 0.9 ? C.crimson : C.ink};">${s.progressIndex.toFixed(2)}</strong> —
  ${
    s.progressIndex < 1
      ? 'el alcance va por detrás del calendario consumido.'
      : 'el alcance va al parejo o por delante del calendario consumido.'
  }
</td></tr>`)

  // Vencidas
  if (s.overdue.length > 0) {
    partes.push(seccion(`Lo que ya venció (${s.overdue.length})`))
    const filas = s.overdue
      .slice(0, 6)
      .map((t, i) => {
        const borde = i > 0 ? `border-top:1px solid ${C.rule};` : ''
        const rotulo = faseCorta(t.phase, t.title)
        const fase = rotulo ? `<span style="color:${C.grayLight};"> · ${esc(rotulo)}</span>` : ''
        return `<tr>
  <td style="padding:9px 10px 9px 0; ${borde} font-family:${SANS}; font-size:13px; line-height:18px; color:${C.ink};">${esc(t.title)}${fase}</td>
  <td align="right" valign="top" nowrap="nowrap" style="padding:9px 0; ${borde} font-family:${SANS}; font-size:13px; font-weight:bold; color:${C.crimson}; white-space:nowrap;">${t.daysLate} d</td>
</tr>`
      })
      .join('')
    const resto =
      s.overdue.length > 6
        ? `<div style="font-family:${SANS}; font-size:12px; color:${C.grayLight}; padding-top:10px;">y ${s.overdue.length - 6} más</div>`
        : ''
    partes.push(`<tr><td class="pad" style="padding:12px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">${filas}</table>${resto}
</td></tr>`)
  }

  // Bloqueos y riesgos
  if (s.openBlockers.length > 0 || s.openRisks.length > 0) {
    partes.push(seccion('Bloqueos y riesgos abiertos'))
    // El tipo va escrito, no insinuado con el color de la viñeta: un bloqueo es algo que YA está
    // deteniendo trabajo y un riesgo es algo que podría detenerlo. Se atienden distinto, y en una
    // lista mezclada sin etiqueta los dos se leen igual de urgentes —o igual de ignorables.
    const puntos = [
      ...s.openBlockers.slice(0, 4).map((b) => ({ txt: b.description, tipo: 'Bloqueo', tag: b.severity })),
      ...s.openRisks.slice(0, 4).map((r) => ({ txt: r.description, tipo: 'Riesgo', tag: r.riskLevel })),
    ]
    const lista = puntos
      .map(
        (p) => `<tr>
  <td valign="top" width="6" style="width:6px; padding:7px 10px 0 0;">
    <div style="width:5px; height:5px; background-color:${p.tipo === 'Bloqueo' ? C.crimson : C.gray}; font-size:0; line-height:0;">&nbsp;</div>
  </td>
  <td style="padding:2px 0 6px 0; font-family:${SANS}; font-size:13px; line-height:19px; color:${C.ink};">
    <span style="font-weight:bold; color:${p.tipo === 'Bloqueo' ? C.crimson : C.gray};">${esc(p.tipo)}</span>
    <span style="color:${C.grayLight};"> · ${esc(p.tag)}</span><br />${esc(p.txt)}
  </td>
</tr>`
      )
      .join('')
    partes.push(`<tr><td class="pad" style="padding:12px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">${lista}</table>
</td></tr>`)
  }

  // Secciones narrativas del modelo
  for (const sec of brief?.sections?.slice(0, 3) ?? []) {
    partes.push(seccion(sec.eyebrow))
    if (sec.headline) {
      partes.push(`<tr><td class="pad" style="padding:12px 36px 0 36px; font-family:${SERIF}; font-size:18px; line-height:25px; color:${C.ink};">${esc(sec.headline)}</td></tr>`)
    }
    for (const p of sec.paragraphs?.slice(0, 2) ?? []) partes.push(parrafo(p))
  }

  // Peticiones
  if (brief?.asks?.length) {
    partes.push(seccion('Lo que se pide'))
    const filas = brief.asks
      .slice(0, 4)
      .map((a, i) => {
        const meta =
          a.owner || a.due
            ? `<div style="font-family:${SANS}; font-size:11px; color:${C.grayLight}; padding-top:3px;">${esc([a.owner, a.due].filter(Boolean).join(' · '))}</div>`
            : ''
        return `<tr>
  <td valign="top" width="26" style="width:26px; padding:10px 0 0 0; font-family:${SERIF}; font-size:15px; color:${C.teal};">${i + 1}.</td>
  <td style="padding:10px 0 0 0; font-family:${SANS}; font-size:13px; line-height:19px; color:${C.ink};">${esc(a.text)}${meta}</td>
</tr>`
      })
      .join('')
    partes.push(`<tr><td class="pad" style="padding:6px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">${filas}</table>
</td></tr>`)
  }

  if (input.appUrl && input.projectId) {
    partes.push(boton(`${input.appUrl.replace(/\/$/, '')}/es/projects/${input.projectId}`, 'Abrir el proyecto'))
  }

  // Pie
  const hora = `${String(hoy.getHours()).padStart(2, '0')}:${String(hoy.getMinutes()).padStart(2, '0')}`
  partes.push(`<tr><td class="pad" style="padding:30px 36px 32px 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr><td style="border-top:1px solid ${C.rule}; padding-top:14px; font-family:${SANS}; font-size:11px; line-height:17px; color:${C.grayLight};">
      Generado automáticamente por PM SWO el ${esc(fechaLarga(hoy))} a las ${hora}.${brief?.note ? `<br />${esc(brief.note)}` : ''}
      <br /><br />Para dejar de recibirlo o cambiar destinatarios, responde este correo.
    </td></tr>
  </table>
</td></tr>`)

  const html = shell({ title: subject, preheader, body: partes.join('\n') })

  // ── Texto plano ─────────────────────────────────────────────────────────────────────────────
  // No es un trámite: sin alternativa de texto sube el puntaje de spam, y es lo que leen los
  // relojes y los lectores de pantalla en modo simple.
  const lineas: string[] = [
    'SOFTWAREONE · REPORTE DIARIO',
    fechaLarga(hoy),
    '',
    project.name,
    `${project.client} · día ${diaActual} de ${s.totalDays}`,
    `Veredicto: ${verdict}`,
    '',
  ]
  if (brief?.lead) lineas.push(brief.lead, '')
  lineas.push(
    'LAS CIFRAS DE HOY',
    `  Tareas cerradas ....... ${s.done}/${s.total}`,
    `  Días restantes ........ ${s.remainingDays}`,
    `  Vencidas .............. ${vencidas}`,
    `  Bloqueos abiertos ..... ${bloqueos}`,
    '',
    'AVANCE CONTRA CALENDARIO',
    `  Alcance ............... ${s.scopePct}%`,
    `  Calendario ............ ${s.timePct}%`,
    `  Índice de avance ...... ${s.progressIndex.toFixed(2)}`,
    ''
  )
  if (s.overdue.length > 0) {
    lineas.push(`LO QUE YA VENCIÓ (${s.overdue.length})`)
    for (const t of s.overdue.slice(0, 6)) {
      const rotulo = faseCorta(t.phase, t.title)
      lineas.push(`  - ${t.title}${rotulo ? ` (${rotulo})` : ''} — ${t.daysLate} días`)
    }
    lineas.push('')
  }
  if (s.openBlockers.length > 0 || s.openRisks.length > 0) {
    lineas.push('BLOQUEOS Y RIESGOS ABIERTOS')
    for (const b of s.openBlockers.slice(0, 4)) {
      lineas.push(`  - Bloqueo (${b.severity}): ${b.description}`)
    }
    for (const r of s.openRisks.slice(0, 4)) {
      lineas.push(`  - Riesgo (${r.riskLevel}): ${r.description}`)
    }
    lineas.push('')
  }
  if (brief?.asks?.length) {
    lineas.push('LO QUE SE PIDE')
    brief.asks.slice(0, 4).forEach((a, i) => {
      lineas.push(`  ${i + 1}. ${a.text}${a.owner ? ` — ${a.owner}` : ''}${a.due ? ` (${a.due})` : ''}`)
    })
    lineas.push('')
  }
  if (input.appUrl && input.projectId) {
    lineas.push(`Abrir el proyecto: ${input.appUrl.replace(/\/$/, '')}/es/projects/${input.projectId}`, '')
  }
  lineas.push('Generado automáticamente por PM SWO. Para dejar de recibirlo, responde este correo.')

  return { subject, html, text: lineas.join('\n') }
}

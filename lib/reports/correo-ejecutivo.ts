/**
 * El reporte ejecutivo, en HTML de correo.
 *
 * No es un aviso diario: es el documento con el que se abre una conversación con los directivos
 * del cliente. Puede llegar cualquier día y tiene que sostenerse solo, sin que nadie lo explique.
 *
 * ## El orden, que es un argumento
 *
 * Primero **¿llegamos a la fecha?**, porque es lo único que el comité de verdad vino a preguntar.
 * Después las cifras que sostienen esa respuesta, después qué está atrasado, después de quién
 * depende, y al final el registro de gobierno. Quien solo lea la primera pantalla ya sabe lo
 * esencial; quien baje, encuentra la evidencia.
 *
 * ## La respuesta a «¿llegamos?» va en tres cifras, nunca en una
 *
 * El motor, preguntado a secas, contesta siempre «cierra el 30 de noviembre, margen cero». No
 * porque vaya bien: porque el plan está anclado en sus fechas guardadas y ninguna se pasa del
 * compromiso. Con cero avance capturado diría exactamente lo mismo. Publicar ese margen solo sería
 * decirle al comité «vamos justos pero en fecha» mientras el proyecto arrastra meses de deuda.
 *
 * Así que van las tres, rotuladas:
 *
 *   1. **El plan como está capturado** — lo que dice el documento firmado.
 *   2. **La deuda al corte** — cuántas actividades están atrasadas y con qué forma.
 *   3. **El cierre proyectado** — a dónde llega eso si nadie recupera nada, con su supuesto escrito.
 *
 * Si solo cupiera una, sería la deuda. Nunca el margen.
 *
 * ## La deuda se describe con mediana y máximo, nunca con la suma
 *
 * La primera versión publicaba «247 actividades · 2 188 días hábiles». Los 2 188 son la suma de
 * los atrasos individuales, y leídos como duración son casi nueve años — un número que el primer
 * lector rechaza, con razón. El error no es de escala: es que las actividades corren en paralelo,
 * así que sumar sus atrasos no produce ningún periodo de tiempo. Doscientas cuarenta y siete
 * actividades atrasadas nueve días cada una son nueve días de atraso.
 *
 * Lo que sí se lee: la mediana («la mitad lleva una semana y media o más»), el peor caso, y el
 * reparto por tramos, que distingue cien atrasos pequeños de diez actividades paradas dos meses.
 *
 * ## Tres reglas que evitan mentiras caras
 *
 * **Días hábiles, y se dice la palabra.** Un directivo que lee «72 días» piensa en dos meses y
 * medio de calendario; son catorce semanas. Los naturales se reservan para fechas.
 *
 * **Ningún nombre propio en los compromisos del cliente.** El campo `owner` de un compromiso del
 * cliente trae hoy el nombre del PM del proveedor. Publicar «política de seguridad — vencida —
 * responsable: [PM de SoftwareOne]» ante el comité del banco atribuye setecientas líneas detenidas
 * a la persona equivocada, y del lado equivocado. Se publica el compromiso, su fecha y cuánto
 * detiene; el nombre se queda fuera hasta que el dato sea de fiar.
 *
 * **El veredicto lo deciden las cifras, no el modelo.** El modelo lo justifica, no lo elige.
 */
import type { Expediente } from '@/services/expediente-del-reporte.service'
import type { NarrativaEjecutiva } from './narrativa-ejecutiva'
import type { AlertaDeOlas, OlasYFrentes, Semaforo } from './olas-y-frentes'
import { C, SANS, SERIF, esc, parrafo, seccion, shell } from '@/lib/email/html'

const ANCHO = 528
const BARRA = 380

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function fechaLarga(d: Date): string {
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}
function fechaMedia(d: Date): string {
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}
function deIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}
/** Días hábiles a semanas, para que la cifra se pueda pensar. */
function enSemanas(diasHabiles: number): string {
  const semanas = Math.round(diasHabiles / 5)
  return semanas <= 1 ? 'una semana' : `${semanas} semanas`
}

export type Veredicto = 'En riesgo' | 'Atención' | 'En curso'

const CHIP: Record<Veredicto, string> = {
  'En riesgo': C.crimson,
  'Atención': '#B45309',
  'En curso': C.teal,
}

/**
 * El veredicto sale de las cifras, siempre.
 *
 * Se calcula aquí y no se le pregunta al modelo porque este texto viaja en el ASUNTO del correo
 * que abre una reunión con el comité del cliente. Un modelo que un día devuelva «Crítico» —o
 * cualquier cosa fuera de los tres valores— lo imprimiría tal cual.
 */
export function veredictoDeLasCifras(e: Expediente): Veredicto {
  const desviacion = e.panel.metricas.avanceTemporal.desviacion
  const tarde =
    e.plan?.proyeccion.margenProyectadoDiasHabiles != null &&
    e.plan.proyeccion.margenProyectadoDiasHabiles < 0
      ? -e.plan.proyeccion.margenProyectadoDiasHabiles
      : 0

  // Más de dos semanas hábiles por detrás de la fecha comprometida, o más de diez puntos por
  // debajo del calendario: eso ya no se recupera solo.
  if (tarde > 10 || desviacion <= -0.1) return 'En riesgo'
  if (tarde > 0 || desviacion <= -0.03 || e.atrasos.compromisos.length > 0) return 'Atención'

  // Sin motor no hay proyección, y sin proyección no se puede afirmar que el proyecto va en fecha.
  // «En curso» es la única de las tres etiquetas que tranquiliza; no se dice a ciegas.
  if (!e.plan) return 'Atención'
  return 'En curso'
}

/** Un dato con su rótulo. El tamaño baja con la longitud para que no se encime con el de al lado. */
function ficha(valor: string, rotulo: string, color: string): string {
  const tam = valor.length <= 4 ? 29 : valor.length <= 6 ? 23 : 18
  return `<td class="kpi" width="132" valign="top" style="width:132px; padding:0 8px 0 0;">
  <div style="font-family:${SERIF}; font-size:${tam}px; line-height:33px; color:${color};">${esc(valor)}</div>
  <div style="font-family:${SANS}; font-size:10px; line-height:14px; letter-spacing:0.8px; text-transform:uppercase; color:${C.grayLight}; padding-top:2px;">${esc(rotulo)}</div>
</td>`
}

function medida(rotulo: string, pct: number, color: string): string {
  const acotado = Math.max(0, Math.min(100, pct))
  const relleno = acotado > 0 ? Math.max(3, Math.round((acotado / 100) * BARRA)) : 0
  const hueco = relleno > 0 && relleno < BARRA ? 2 : 0
  const canal = Math.max(0, BARRA - relleno - hueco)
  const celda = (w: number, bg: string, radio = '') =>
    w > 0
      ? `<td width="${w}" height="10" style="width:${w}px; height:10px; background-color:${bg}; ${radio} font-size:0; line-height:0;">&nbsp;</td>`
      : ''
  return `<tr><td class="pad" style="padding:10px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">
    <tr>
      <td width="104" style="width:104px; font-family:${SANS}; font-size:12px; color:${C.gray}; padding-right:8px;">${esc(rotulo)}</td>
      <td width="${BARRA}" style="width:${BARRA}px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${BARRA}" style="width:${BARRA}px;">
          <tr>${celda(relleno, color, 'border-radius:0 4px 4px 0;')}${celda(hueco, C.surface)}${celda(canal, C.track)}</tr>
        </table>
      </td>
      <td width="44" align="right" style="width:44px; font-family:${SANS}; font-size:13px; font-weight:bold; color:${C.ink};">${acotado.toFixed(0)}%</td>
    </tr>
  </table>
</td></tr>`
}

/** Un renglón de la respuesta al «¿llegamos?»: rótulo, cifra grande y explicación debajo. */
function renglonDeVeredicto(
  rotulo: string,
  cifra: string,
  explicacion: string,
  color: string,
  primero: boolean
): string {
  return `<tr>
  <td style="padding:${primero ? '0' : '14px'} 0 14px 0; ${primero ? '' : `border-top:1px solid ${C.rule};`}">
    <div style="font-family:${SANS}; font-size:10px; letter-spacing:1.2px; text-transform:uppercase; color:${C.grayLight};">${esc(rotulo)}</div>
    <div style="font-family:${SERIF}; font-size:21px; line-height:27px; color:${color}; padding-top:3px;">${esc(cifra)}</div>
    <div style="font-family:${SANS}; font-size:12px; line-height:18px; color:${C.gray}; padding-top:3px;">${esc(explicacion)}</div>
  </td>
</tr>`
}

function tablaDeLineas(
  filas: readonly { izq: string; sub?: string | null; der: string }[],
  colorDer: string
): string {
  const html = filas
    .map((f, i) => {
      const borde = i > 0 ? `border-top:1px solid ${C.rule};` : ''
      const sub = f.sub
        ? `<div style="font-family:${SANS}; font-size:11px; color:${C.grayLight}; padding-top:2px;">${esc(f.sub)}</div>`
        : ''
      return `<tr>
  <td style="padding:9px 10px 9px 0; ${borde} font-family:${SANS}; font-size:13px; line-height:18px; color:${C.ink};">${esc(f.izq)}${sub}</td>
  <td width="90" align="right" valign="top" nowrap="nowrap" style="width:90px; padding:9px 0; ${borde} font-family:${SANS}; font-size:13px; font-weight:bold; color:${colorDer}; white-space:nowrap;">${esc(f.der).replace(/ /g, '&nbsp;')}</td>
</tr>`
    })
    .join('')
  return `<tr><td class="pad" style="padding:12px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">${html}</table>
</td></tr>`
}

function nota(texto: string): string {
  return `<tr><td class="pad" style="padding:10px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px; background-color:#FAF9F8;">
    <tr><td style="padding:11px 14px; font-family:${SANS}; font-size:11px; line-height:17px; color:${C.gray}; border-left:3px solid ${C.rule};">${esc(texto)}</td></tr>
  </table>
</td></tr>`
}

/** «4 sep», para tablas donde no cabe la fecha media. */
function fechaCorta(iso: string): string {
  const d = deIso(iso)
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()].slice(0, 3)}`
}

/** «olas 0 a 3» si son seguidas; «olas 5, 7, 8 y 10» si no. */
function listaDeOlas(olas: readonly number[]): string {
  if (olas.length === 0) return ''
  if (olas.length === 1) return `ola ${olas[0]}`
  const seguidas = olas.every((n, i) => i === 0 || n === olas[i - 1] + 1)
  if (seguidas && olas.length > 2) return `olas ${olas[0]} a ${olas[olas.length - 1]}`
  return `olas ${olas.slice(0, -1).join(', ')} y ${olas[olas.length - 1]}`
}

const COLOR_SEMAFORO: Record<Semaforo, string> = {
  'En tiempo': C.teal,
  'Atención': '#B45309',
  'En riesgo': C.crimson,
}

/**
 * El semáforo siempre con su etiqueta escrita: el color solo no se lee en un correo impreso, ni lo
 * distingue quien no ve bien los colores.
 */
function etiquetaDeSemaforo(s: Semaforo, dias: number): string {
  return s === 'En tiempo' ? 'En tiempo' : `${s} · ${dias} d`
}

interface Columna {
  readonly titulo: string
  readonly ancho: number
  readonly alinear?: 'left' | 'right'
}
interface Celda {
  readonly texto: string
  readonly sub?: string
  readonly color?: string
  readonly negrita?: boolean
}

/** Una tabla de columnas fijas que suman 528 px. La celda puede traer un renglón secundario. */
function tablaDeColumnas(columnas: readonly Columna[], filas: readonly (readonly Celda[])[]): string {
  const relleno = (c: Columna) => (c.alinear === 'right' ? '0' : '8px')
  const encabezado = columnas
    .map(
      (c) =>
        `<td width="${c.ancho}" align="${c.alinear ?? 'left'}" valign="bottom" style="width:${c.ancho}px; padding:0 ${relleno(c)} 6px 0; border-bottom:1px solid ${C.rule}; font-family:${SANS}; font-size:9px; line-height:12px; letter-spacing:0.8px; text-transform:uppercase; color:${C.grayLight};">${esc(c.titulo)}</td>`
    )
    .join('')
  const cuerpo = filas
    .map((fila, i) => {
      const borde = i > 0 ? `border-top:1px solid ${C.rule};` : ''
      const celdas = fila
        .map((celda, j) => {
          const c = columnas[j]
          const sub = celda.sub
            ? `<div style="font-family:${SANS}; font-size:11px; line-height:15px; font-weight:normal; color:${C.grayLight}; padding-top:2px;">${esc(celda.sub)}</div>`
            : ''
          // La columna alineada a la derecha es la del dato («En riesgo · 19 d»): nunca se parte en
          // dos renglones. Outlook ignora `nowrap` si no hay espacios no separables.
          const texto = c.alinear === 'right' ? esc(celda.texto).replace(/ /g, '&nbsp;') : esc(celda.texto)
          return `<td width="${c.ancho}" align="${c.alinear ?? 'left'}" valign="top" style="width:${c.ancho}px; padding:8px ${relleno(c)} 8px 0; ${borde} font-family:${SANS}; font-size:12px; line-height:17px; color:${celda.color ?? C.ink};${celda.negrita ? ' font-weight:bold;' : ''}${c.alinear === 'right' ? ' white-space:nowrap;' : ''}">${texto}${sub}</td>`
        })
        .join('')
      return `<tr>${celdas}</tr>`
    })
    .join('')
  return `<tr><td class="pad" style="padding:14px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;"><tr>${encabezado}</tr>${cuerpo}</table>
</td></tr>`
}

/** Un aviso que no se puede saltar: borde de color y texto en tinta, no en gris como la nota. */
function alerta(texto: string, color: string): string {
  return `<tr><td class="pad" style="padding:12px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px; background-color:#FBF7F8;">
    <tr><td style="padding:11px 14px; font-family:${SANS}; font-size:12px; line-height:18px; color:${C.ink}; border-left:3px solid ${color};">${esc(texto)}</td></tr>
  </table>
</td></tr>`
}

function textoDeAlerta(a: AlertaDeOlas): string {
  switch (a.tipo) {
    case 'encadenadas':
      return `Las ${a.cuantas} olas pendientes se corren lo mismo, ${a.diasHabiles} días hábiles: en el plan van encadenadas y el atraso de las primeras arrastra a todas. Recuperar las primeras olas recupera el tren completo.`
    case 'orden':
      return `La Ola ${a.cortada} aparece cortada y la Ola ${a.pendiente} todavía no${a.avanceDelCortePendiente > 0 ? ` (su corte va al ${Math.round(a.avanceDelCortePendiente * 100)}%)` : ''}. Si el banco cambió el orden, está bien; si el avance se capturó en la ola equivocada, hay que corregirlo.`
    case 'compuertaDetenida':
      return `${a.codigo} · ${a.nombre}: ninguna de sus ${a.total} actividades está lista y todas vencieron, la primera el ${fechaMedia(deIso(a.desde))}. Condiciona las ${listaDeOlas(a.olas)}.`
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/** Las olas antes que los frentes: primero el efecto que siente el banco, luego la causa. */
function seccionesDeOlasYFrentes(o: OlasYFrentes): string[] {
  const partes: string[] = []

  if (o.olas.length > 0) {
    const cortadas = o.olas.filter((x) => x.cortada).length
    partes.push(seccion(`Olas de migración · ${cortadas} de ${o.olas.length} cortadas`))

    // La alerta del tren va antes de la tabla: explica de un golpe por qué todas las filas dicen lo
    // mismo, y la de orden pide revisar una captura antes de que alguien la cite.
    for (const a of o.alertas) {
      if (a.tipo === 'encadenadas') partes.push(alerta(textoDeAlerta(a), C.crimson))
      if (a.tipo === 'orden') partes.push(alerta(textoDeAlerta(a), COLOR_SEMAFORO['Atención']))
    }

    partes.push(
      tablaDeColumnas(
        [
          { titulo: 'Ola', ancho: 200 },
          { titulo: 'Corte comprometido → proyectado', ancho: 124 },
          { titulo: 'Avance real / esperado', ancho: 84 },
          { titulo: 'Atraso real', ancho: 120, alinear: 'right' },
        ],
        o.olas.map((x) => {
          const comprometido = x.corteComprometido ? fechaCorta(x.corteComprometido) : '—'
          return [
            {
              texto: `Ola ${x.numero}${x.ambiente ? ` · ${x.ambiente}` : ''}`,
              negrita: true,
              sub: [x.servidores ? `${x.servidores} servidores` : null, x.fase, x.compuertas.join(', ') || null]
                .filter(Boolean)
                .join(' · '),
            },
            {
              texto: x.cortada
                ? `${comprometido} · cortada`
                : `${comprometido} → ${x.corteProyectado ? fechaCorta(x.corteProyectado) : '—'}`,
            },
            {
              // Una ola que ni arrancó ni debía haber arrancado no tiene avance que comparar.
              texto: x.avanceReal === 0 && x.avanceEsperado === 0 ? '—' : `${pct(x.avanceReal)} / ${pct(x.avanceEsperado)}`,
              color: x.avanceReal + 0.005 < x.avanceEsperado ? C.crimson : C.ink,
            },
            x.semaforo && x.atrasoDiasHabiles !== null
              ? { texto: etiquetaDeSemaforo(x.semaforo, x.atrasoDiasHabiles), color: COLOR_SEMAFORO[x.semaforo], negrita: true }
              : { texto: 'Cortada', color: C.gray, negrita: true },
          ]
        })
      )
    )

    if (o.compuertas.length > 0) {
      partes.push(
        parrafo(
          'Las compuertas son lo que la plataforma debe tener listo antes de cada grupo de olas: deciden si una ola puede arrancar.',
          'padding-top:18px; font-size:14px;'
        )
      )
      for (const a of o.alertas) {
        if (a.tipo === 'compuertaDetenida') partes.push(alerta(textoDeAlerta(a), C.crimson))
      }
      partes.push(
        tablaDeColumnas(
          [
            { titulo: 'Compuerta', ancho: 250 },
            { titulo: 'Listas', ancho: 70 },
            { titulo: 'Comprometida → proyectada', ancho: 110 },
            { titulo: 'Atraso real', ancho: 98, alinear: 'right' },
          ],
          o.compuertas.map((c) => [
            {
              texto: `${c.codigo} · ${c.nombre}`,
              negrita: true,
              sub: c.olas.length ? `Habilita ${c.olas.length === 1 ? 'la' : 'las'} ${listaDeOlas(c.olas)}` : undefined,
            },
            {
              texto: `${c.listas} de ${c.total}`,
              sub: c.vencidas > 0 ? `${c.vencidas} vencida${c.vencidas === 1 ? '' : 's'}` : undefined,
              color: c.vencidas > 0 ? C.crimson : C.ink,
            },
            {
              texto: c.terminada ? fechaCorta(c.comprometida) : `${fechaCorta(c.comprometida)} → ${fechaCorta(c.proyectada)}`,
            },
            c.terminada
              ? { texto: 'Lista', color: C.teal, negrita: true }
              : { texto: etiquetaDeSemaforo(c.semaforo, c.atrasoDiasHabiles), color: COLOR_SEMAFORO[c.semaforo], negrita: true },
          ])
        )
      )
    }
  }

  if (o.frentes.length > 0) {
    const enRiesgo = o.frentes.filter((f) => !f.terminado && f.semaforo === 'En riesgo').length
    partes.push(seccion(`Frentes de plataforma · ${enRiesgo} en riesgo de ${o.frentes.length}`))
    partes.push(
      tablaDeColumnas(
        [
          { titulo: 'Frente', ancho: 200 },
          { titulo: 'Comprometido → proyectado', ancho: 124 },
          { titulo: 'Avance real / esperado', ancho: 84 },
          { titulo: 'Atraso real', ancho: 120, alinear: 'right' },
        ],
        o.frentes.map((f) => [
          {
            texto: f.nombre,
            negrita: true,
            sub: `${f.hojas} actividades${f.vencidas > 0 ? ` · ${f.vencidas} vencidas` : ''}`,
          },
          {
            texto: f.terminado ? fechaCorta(f.comprometido) : `${fechaCorta(f.comprometido)} → ${fechaCorta(f.proyectado)}`,
          },
          {
            texto: f.terminado ? '100%' : `${pct(f.avanceReal)} / ${pct(f.avanceEsperado)}`,
            color: !f.terminado && f.avanceReal + 0.005 < f.avanceEsperado ? C.crimson : C.ink,
          },
          f.terminado
            ? { texto: 'Terminado', color: C.teal, negrita: true }
            : { texto: etiquetaDeSemaforo(f.semaforo, f.atrasoDiasHabiles), color: COLOR_SEMAFORO[f.semaforo], negrita: true },
        ])
      )
    )
  }

  partes.push(
    nota(
      'Atraso real: días hábiles entre la fecha comprometida en el plan y la proyectada, con el mismo método del cierre proyectado. En tiempo, 0 días; atención, de 1 a 5; en riesgo, más de 5. El avance esperado es el que ya llevaría cada línea si hubiera avanzado parejo entre sus fechas comprometidas.'
    )
  )
  return partes
}

const SEVERIDAD: Record<string, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', CRITICAL: 'Crítica' }
const ESTADO_RIESGO: Record<string, string> = {
  IDENTIFIED: 'Identificado',
  MONITORING: 'En monitoreo',
  MITIGATING: 'En mitigación',
  MATERIALIZED: 'Materializado',
  CLOSED: 'Cerrado',
}
const ESTADO_ACUERDO: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Cumplido',
  CANCELLED: 'Cancelado',
}
const ORDEN_SEVERIDAD: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
/** Lo más grave primero: con seis renglones de espacio, el que se queda fuera no puede ser el crítico. */
const porSeveridad = (a: string, b: string) => (ORDEN_SEVERIDAD[a] ?? 9) - (ORDEN_SEVERIDAD[b] ?? 9)

const DIA_MS = 86_400_000

/** El lunes de la semana de una fecha ISO, como milisegundos UTC. */
function lunesDe(iso: string): number {
  const d = deIso(iso)
  const dow = (d.getUTCDay() + 6) % 7
  return +d - dow * DIA_MS
}

/**
 * Cada ola en una línea de tiempo semanal: dónde se comprometió su corte, a dónde lo empuja la
 * proyección, y la fecha límite atravesando todas.
 *
 * Hecha con celdas de tabla y no con imagen ni SVG: Outlook no dibuja SVG, y muchos clientes
 * bloquean las imágenes hasta que alguien pulsa «mostrar». Una gráfica que el comité no ve no
 * sirve, por buena que sea.
 *
 * Responde de un vistazo la pregunta del reporte: qué olas ya caen después del compromiso.
 */
function graficaDeCortes(olas: OlasYFrentes['olas'], limite: string, hoy: string): string[] {
  const conFecha = olas.filter((o) => o.corteComprometido)
  if (conFecha.length === 0) return []

  const fechas = conFecha.flatMap((o) => [o.corteComprometido!, ...(o.corteProyectado ? [o.corteProyectado] : [])])
  const inicio = Math.min(...[...fechas, hoy].map(lunesDe))
  const fin = Math.max(...[...fechas, limite].map(lunesDe))
  const semanas = Math.round((fin - inicio) / (7 * DIA_MS)) + 1
  // Más de ~26 semanas ya no cabe con celdas legibles; en ese caso no se dibuja.
  if (semanas > 26) return []

  const ROTULO = 58
  const COLA = 50
  const ANCHO_SEMANAS = ANCHO - ROTULO - COLA
  const anchoSemana = Math.floor(ANCHO_SEMANAS / semanas)
  const sobrante = ANCHO_SEMANAS - anchoSemana * semanas
  const indice = (iso: string) => Math.round((lunesDe(iso) - inicio) / (7 * DIA_MS))
  const semanaLimite = indice(limite)
  const semanaHoy = indice(hoy)
  const TENUE = '#F2D6E3'
  const HOY = '#F1EFEC'

  const ancho = (i: number) => anchoSemana + (i === semanas - 1 ? sobrante : 0)
  /** La línea de la fecha límite: un borde izquierdo en su semana, repetido en cada renglón. */
  const borde = (i: number) => (i === semanaLimite ? `border-left:2px solid ${C.crimson};` : '')
  const fondo = (i: number) => (i === semanaHoy ? HOY : '')

  const celdasVacias = (alto: number) =>
    Array.from({ length: semanas }, (_, i) => {
      const bg = fondo(i)
      return `<td width="${ancho(i)}" height="${alto}" style="width:${ancho(i)}px; height:${alto}px; ${bg ? `background-color:${bg};` : ''} ${borde(i)} font-size:0; line-height:0;">&nbsp;</td>`
    }).join('')

  // Encabezado: el mes en la primera semana que empieza en él.
  let mesPrevio = -1
  const encabezado = Array.from({ length: semanas }, (_, i) => {
    const d = new Date(inicio + i * 7 * DIA_MS)
    const mes = d.getUTCMonth()
    const texto = mes !== mesPrevio ? MESES[mes].slice(0, 3) : ''
    mesPrevio = mes
    return `<td width="${ancho(i)}" style="width:${ancho(i)}px; ${borde(i)} padding:0 0 4px 3px; font-family:${SANS}; font-size:9px; letter-spacing:0.6px; text-transform:uppercase; color:${C.grayLight}; white-space:nowrap;">${texto}</td>`
  }).join('')

  const filas = conFecha
    .map((o) => {
      const comp = indice(o.corteComprometido!)
      const proy = o.corteProyectado ? indice(o.corteProyectado) : comp
      const tarde = !o.cortada && o.corteProyectado !== null && o.corteProyectado > limite
      const colorProy = o.semaforo ? COLOR_SEMAFORO[o.semaforo] : C.gray
      const celdas = Array.from({ length: semanas }, (_, i) => {
        let bg = fondo(i)
        if (o.cortada && i === comp) bg = C.gray
        else if (!o.cortada) {
          if (i === comp && i === proy) bg = colorProy
          else if (i === comp) bg = '#A8A4A2'
          else if (i === proy) bg = colorProy
          else if (i > comp && i < proy) bg = TENUE
        }
        return `<td width="${ancho(i)}" height="12" style="width:${ancho(i)}px; height:12px; ${bg ? `background-color:${bg};` : ''} ${borde(i)} font-size:0; line-height:0;">&nbsp;</td>`
      }).join('')
      const cola = o.cortada
        ? `<span style="color:${C.gray};">cortada</span>`
        : o.atrasoDiasHabiles
          ? `<span style="color:${tarde ? C.crimson : colorProy}; font-weight:bold;">+${o.atrasoDiasHabiles}&nbsp;d</span>`
          : `<span style="color:${C.teal};">en&nbsp;fecha</span>`
      return `<tr>
  <td width="${ROTULO}" style="width:${ROTULO}px; font-family:${SANS}; font-size:11px; line-height:12px; color:${tarde ? C.crimson : C.ink};${tarde ? ' font-weight:bold;' : ''} white-space:nowrap;">Ola ${o.numero}</td>
  ${celdas}
  <td width="${COLA}" align="right" style="width:${COLA}px; font-family:${SANS}; font-size:10px; line-height:12px; white-space:nowrap;">${cola}</td>
</tr>
<tr><td width="${ROTULO}" height="7" style="font-size:0; line-height:0;">&nbsp;</td>${celdasVacias(7)}<td width="${COLA}" style="font-size:0; line-height:0;">&nbsp;</td></tr>`
    })
    .join('')

  const muestra = (color: string) =>
    `<span style="display:inline-block; width:10px; height:10px; background-color:${color}; vertical-align:-1px;"></span>`
  const leyenda = `${muestra('#A8A4A2')} corte comprometido &nbsp; ${muestra(C.crimson)} corte proyectado &nbsp; ${muestra(TENUE)} corrimiento &nbsp; <span style="display:inline-block; width:2px; height:11px; background-color:${C.crimson}; vertical-align:-1px;"></span> ${esc(fechaMedia(deIso(limite)))}, fecha comprometida &nbsp; ${muestra(HOY)} hoy`

  const despues = conFecha.filter((o) => !o.cortada && o.corteProyectado !== null && o.corteProyectado > limite)
  const lectura =
    despues.length > 0
      ? `${despues.length === 1 ? `La Ola ${despues[0].numero} ya queda proyectada` : `Las olas ${despues.slice(0, -1).map((o) => o.numero).join(', ')} y ${despues[despues.length - 1].numero} ya quedan proyectadas`} después del ${fechaMedia(deIso(limite))}: con el ritmo actual, la migración no termina dentro del compromiso.`
      : `Todas las olas pendientes siguen proyectadas antes del ${fechaMedia(deIso(limite))}.`

  return [
    `<tr><td class="pad" style="padding:22px 36px 0 36px; font-family:${SANS}; font-size:10px; letter-spacing:1.2px; text-transform:uppercase; color:${C.grayLight};">Cada ola: corte comprometido contra proyectado</td></tr>`,
    `<tr><td class="pad" style="padding:10px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px; table-layout:fixed;">
    <tr><td width="${ROTULO}" style="width:${ROTULO}px;"></td>${encabezado}<td width="${COLA}" style="width:${COLA}px;"></td></tr>
    ${filas}
  </table>
</td></tr>`,
    `<tr><td class="pad" style="padding:6px 36px 0 36px; font-family:${SANS}; font-size:10px; line-height:16px; color:${C.gray};">${leyenda}</td></tr>`,
    parrafo(lectura, `padding-top:12px; font-size:14px; color:${despues.length > 0 ? C.crimson : C.ink};`),
  ]
}

export interface CorreoArmado {
  readonly subject: string
  readonly html: string
  readonly text: string
}

export function armarCorreoEjecutivo(
  e: Expediente,
  narrativa: NarrativaEjecutiva | undefined,
  opciones: { appUrl?: string } = {}
): CorreoArmado {
  const m = e.panel.metricas
  const a = e.atrasos
  const p = e.plan?.proyeccion
  const veredicto = veredictoDeLasCifras(e)
  const chip = CHIP[veredicto]

  const desviacionPp = Math.round(m.avanceTemporal.desviacion * 1000) / 10
  const compromiso = e.proyecto.comprometidoPara

  // ── Asunto ────────────────────────────────────────────────────────────────────────────────
  const corrimiento = p?.corrimientoDiasHabiles ?? 0
  /**
   * Cuánto se pasa la proyección DEL COMPROMISO, que no es lo mismo que el corrimiento.
   *
   * `corrimientoDiasHabiles` mide contra el cierre del propio plan. En este proyecto los dos
   * coinciden porque el plan cierra justo en la fecha comprometida, pero eso es una coincidencia
   * de este plan: en cuanto el cierre calculado y el compromiso se separen, rotular el corrimiento
   * como «más allá del compromiso» sería falso.
   */
  const tardeRespectoAlCompromiso =
    p?.margenProyectadoDiasHabiles != null && p.margenProyectadoDiasHabiles < 0
      ? -p.margenProyectadoDiasHabiles
      : 0
  const cola =
    tardeRespectoAlCompromiso > 0
      ? `${tardeRespectoAlCompromiso} días hábiles tarde`
      : corrimiento > 0
        ? `${corrimiento} días hábiles de corrimiento`
        : `${a.atrasadas.length} atrasadas`
  const subject = `${e.proyecto.nombre} · ${veredicto} · ${cola} · ${fechaMedia(deIso(e.corte))}`

  const preheader =
    narrativa?.entradilla?.slice(0, 140) ??
    `Avance ${(m.proyecto.progresoGlobal * 100).toFixed(0)}% contra ${(m.avanceTemporal.planificado * 100).toFixed(0)}% de calendario. ${a.atrasadas.length} actividades atrasadas.`

  const partes: string[] = []

  // ── Masthead y encabezado ─────────────────────────────────────────────────────────────────
  partes.push(`<tr><td class="pad" style="background-color:#000000; padding:16px 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td style="font-family:${SANS}; font-size:13px; letter-spacing:3px; color:#FFFFFF; font-weight:bold;">SOFTWAREONE</td>
      <td align="right" style="font-family:${SANS}; font-size:10px; letter-spacing:1.4px; text-transform:uppercase; color:#9C9A99;">Reporte ejecutivo</td>
    </tr>
  </table>
</td></tr>`)

  partes.push(`<tr><td class="pad" style="padding:30px 36px 0 36px;">
  <div style="font-family:${SANS}; font-size:11px; letter-spacing:1.4px; text-transform:uppercase; color:${C.grayLight};">Corte al ${esc(fechaLarga(deIso(e.corte)))}</div>
  <div style="font-family:${SERIF}; font-size:27px; line-height:33px; color:${C.ink}; padding-top:6px;">${esc(e.proyecto.nombre)}</div>
  <div style="font-family:${SANS}; font-size:13px; color:${C.gray}; padding-top:5px;">${esc(e.proyecto.cliente)} · comprometido para el ${esc(fechaMedia(compromiso))} de ${compromiso.getUTCFullYear()}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;">
    <tr><td bgcolor="${chip}" style="background-color:${chip}; padding:5px 13px; font-family:${SANS}; font-size:11px; font-weight:bold; letter-spacing:1.2px; text-transform:uppercase; color:#FFFFFF;">${esc(veredicto)}</td></tr>
  </table>
</td></tr>`)

  if (narrativa?.entradilla) partes.push(parrafo(narrativa.entradilla, 'padding-top:20px;'))

  // ── 1. ¿Llegamos a la fecha? ──────────────────────────────────────────────────────────────
  partes.push(seccion(`¿Llegamos al ${fechaMedia(compromiso)}?`))

  if (p) {
    const cierreProyectado = deIso(p.cierreProyectado)
    const renglones = [
      renglonDeVeredicto(
        'El plan como está capturado',
        `Cierra el ${fechaMedia(deIso(p.cierreDelPlan))} de ${deIso(p.cierreDelPlan).getUTCFullYear()}`,
        p.cierreDelPlan === compromiso.toISOString().slice(0, 10)
          ? 'Coincide con el compromiso porque cada línea está anclada en su fecha pactada. Este número no empeora aunque el proyecto se atrase: no mira el avance.'
          : 'Es la aritmética del plan tal como está guardado, sin mirar el avance real.',
        C.ink,
        true
      ),
      renglonDeVeredicto(
        'La deuda al corte de hoy',
        `${a.atrasadas.length} actividades atrasadas`,
        // Mediana y máximo, nunca la suma de los atrasos: las actividades corren en paralelo, así
        // que sumarlas no produce ningún periodo de tiempo. En este plan la suma daba 2 188, que
        // leída como duración son casi nueve años.
        `La mitad lleva ${a.medianaDiasHabiles} días hábiles o más de retraso; la más atrasada, ${a.maximoDiasHabiles}. ${a.sinArrancar} todavía no arrancan.`,
        C.crimson,
        false
      ),
      renglonDeVeredicto(
        'El cierre proyectado',
        `${fechaMedia(cierreProyectado)} de ${cierreProyectado.getUTCFullYear()}${tardeRespectoAlCompromiso > 0 ? ` · ${tardeRespectoAlCompromiso} días hábiles tarde` : ''}`,
        tardeRespectoAlCompromiso > 0
          ? `Unas ${enSemanas(tardeRespectoAlCompromiso)} más allá del ${fechaMedia(compromiso)} comprometido.`
          : 'La proyección todavía cae dentro de la fecha comprometida.',
        tardeRespectoAlCompromiso > 0 ? C.crimson : C.teal,
        false
      ),
    ].join('')

    partes.push(`<tr><td class="pad" style="padding:16px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">${renglones}</table>
</td></tr>`)

    // La gráfica va aquí y no en la sección de olas: es la respuesta visual a esta pregunta.
    if (e.plan?.olasYFrentes) {
      partes.push(...graficaDeCortes(e.plan.olasYFrentes.olas, compromiso.toISOString().slice(0, 10), e.corte))
    }

    partes.push(
      nota(
        `Cómo se calcula el cierre proyectado: se toman las ${p.lineasReancladas} actividades abiertas que el plan decía que ya debieron arrancar, se reanclan a hoy descontando el avance que sí tienen, y se reprograma la cadena completa. Es un suelo mecánico —la fecha más temprana posible si desde hoy todo corre según lo planeado y nadie recupera nada—, no un pronóstico ni un compromiso nuevo.`
      )
    )
  } else {
    partes.push(
      parrafo(
        'La proyección de cierre no se pudo calcular en esta corrida. Las cifras de avance y atraso que siguen son válidas; la fecha proyectada no está disponible.',
        'padding-top:14px;'
      )
    )
  }

  // ── Olas y frentes: el efecto que siente el banco, y su causa ────────────────────────────
  if (e.plan?.olasYFrentes) partes.push(...seccionesDeOlasYFrentes(e.plan.olasYFrentes))

  // ── 2. Las preguntas del panel ────────────────────────────────────────────────────────────
  partes.push(seccion('Dónde está el proyecto hoy'))
  partes.push(`<tr><td class="pad" style="padding:16px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">
    <tr>
      ${ficha(`${(m.proyecto.progresoGlobal * 100).toFixed(0)}%`, 'Avance real', C.ink)}
      ${ficha(`${desviacionPp > 0 ? '+' : ''}${desviacionPp.toFixed(0)} pp`, 'Contra calendario', desviacionPp < 0 ? C.crimson : C.teal)}
      ${ficha(`${m.hitos.atrasados}/${m.hitos.total}`, 'Hitos atrasados', m.hitos.atrasados > 0 ? C.crimson : C.ink)}
      ${ficha(String(a.atrasadas.length), 'Actividades atrasadas', a.atrasadas.length > 0 ? C.crimson : C.ink)}
    </tr>
  </table>
</td></tr>`)

  partes.push(medida('Avance real', m.proyecto.progresoGlobal * 100, C.teal))
  partes.push(medida('Calendario', m.avanceTemporal.planificado * 100, C.gray))
  partes.push(
    parrafo(
      desviacionPp < 0
        ? `El proyecto ha consumido ${(m.avanceTemporal.planificado * 100).toFixed(0)}% de su calendario laborable y ha completado ${(m.proyecto.progresoGlobal * 100).toFixed(0)}% del trabajo: ${Math.abs(desviacionPp).toFixed(0)} puntos por detrás.`
        : `El avance real va al parejo o por delante del calendario consumido.`,
      'padding-top:12px;'
    )
  )
  partes.push(
    nota(
      `El avance se pondera por duración sobre las ${m.tareas.hojas.toLocaleString('es-MX')} actividades ejecutables. Las ${m.tareas.resumenes} líneas de agrupación no se cuentan: su avance es el de sus hijas y contarlas sería contar lo mismo dos veces.`
    )
  )

  // ── 3. Lo que está atrasado ───────────────────────────────────────────────────────────────
  if (a.atrasadas.length > 0) {
    partes.push(seccion(`Lo que está atrasado · ${a.atrasadas.length} actividades`))

    // El reparto antes que las listas: distingue «cien actividades con tres días» de «diez paradas
    // dos meses». Los dos casos dan la misma mediana y piden decisiones opuestas, y el ranking por
    // sí solo no deja ver cuál de los dos es.
    const mayor = Math.max(...a.reparto.map((t) => t.cuantas), 1)
    const filasReparto = a.reparto
      .map((t) => {
        const ancho = t.cuantas === 0 ? 0 : Math.max(3, Math.round((t.cuantas / mayor) * 300))
        return `<tr>
  <td width="150" style="width:150px; padding:4px 10px 4px 0; font-family:${SANS}; font-size:12px; color:${C.gray};">${esc(t.rotulo)}</td>
  <td width="300" style="width:300px; padding:4px 0;">
    ${ancho > 0 ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="${ancho}" height="9" style="width:${ancho}px; height:9px; background-color:${t.desde >= 21 ? C.crimson : C.teal}; border-radius:0 3px 3px 0; font-size:0; line-height:0;">&nbsp;</td></tr></table>` : '&nbsp;'}
  </td>
  <td width="34" align="right" style="width:34px; padding:4px 0; font-family:${SANS}; font-size:12px; font-weight:bold; color:${C.ink};">${t.cuantas}</td>
</tr>`
      })
      .join('')
    partes.push(`<tr><td class="pad" style="padding:14px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">${filasReparto}</table>
</td></tr>`)

    if (a.compromisos.length > 0) {
      partes.push(
        parrafo(
          `${a.compromisos.length} de ellas son hitos, entregas o aprobaciones — lo que un comité decide, no lo que un equipo ejecuta. Las diez que más pesan:`,
          'padding-top:12px; font-size:14px;'
        )
      )
      partes.push(
        tablaDeLineas(
          a.compromisos.slice(0, 10).map((c) => ({
            izq: c.titulo,
            sub: `${c.clase === 'HITO' || c.clase === 'PUNTO_DE_CONTROL' ? 'Hito' : c.clase === 'APROBACION_CLIENTE' ? 'Aprobación del cliente' : c.clase === 'ENTREGA_CLIENTE' ? 'Entrega al cliente' : 'Compuerta'} · vencía el ${fechaMedia(c.comprometidaPara)} · responde ${c.parte === 'CLIENTE' ? 'el cliente' : 'SoftwareOne'}`,
            der: `${c.diasHabilesDeAtraso} d`,
          })),
          C.crimson
        )
      )
    }

    if (a.ejecucion.length > 0) {
      // Las tres cifras tienen que sumar el total a la vista del lector. Decir «N son hitos» y
      // «las otras M son de ejecución» cuando además hay líneas de cadencia apartadas deja una
      // resta que no cuadra, y quien la haga deja de creerse el resto del reporte.
      const cola =
        a.cadencia.length > 0
          ? `Otras ${a.ejecucion.length} son actividades de ejecución y ${a.cadencia.length} son líneas de cadencia, que se detallan más abajo. Las cinco de ejecución con mayor atraso:`
          : `Las otras ${a.ejecucion.length} son actividades de ejecución. Las cinco de mayor atraso:`
      partes.push(parrafo(cola, 'padding-top:18px; font-size:14px;'))
      partes.push(
        tablaDeLineas(
          a.ejecucion.slice(0, 5).map((c) => ({
            izq: c.titulo,
            sub: c.avancePct > 0 ? `${c.avancePct}% capturado · vencía el ${fechaMedia(c.comprometidaPara)}` : `sin arrancar · vencía el ${fechaMedia(c.comprometidaPara)}`,
            der: `${c.diasHabilesDeAtraso} d`,
          })),
          C.crimson
        )
      )
    }

    partes.push(
      nota(
        `Los días son hábiles, no naturales. Del total atrasado, ${a.porParte.PROVEEDOR} responde SoftwareOne y ${a.porParte.CLIENTE} responde ${e.proyecto.cliente}.${a.cadencia.length > 0 ? ` Se apartaron ${a.cadencia.length} líneas de cadencia (comités y seguimientos que corren todo el proyecto) para que no encabecen el ranking siendo ruido.` : ''}`
      )
    )
  }

  // ── 4. Lo que depende del cliente ─────────────────────────────────────────────────────────
  const cc = e.plan?.informe
  if (!e.plan) {
    // Callar esta sección cuando el motor falló equivale a afirmar que el cliente no debe nada.
    partes.push(seccion('Lo que depende del cliente'))
    partes.push(
      parrafo(
        'El análisis de dependencias del cliente no se pudo calcular en esta corrida, así que este reporte no dice cuántos compromisos están vencidos ni cuántas líneas del plan detienen. La ausencia de esta sección no significa que no haya ninguno.',
        'padding-top:12px;'
      )
    )
  } else if (cc && cc.clientCommitments > 0) {
    partes.push(seccion('Lo que depende del cliente'))
    partes.push(
      parrafo(
        `De ${cc.clientCommitments} compromisos a cargo de ${e.proyecto.cliente}, ${cc.clientOverdue} están vencidos y ${cc.clientAtRisk} vencen pronto. Hoy detienen ${cc.linesBlockedByClient.toLocaleString('es-MX')} líneas del plan.`,
        'padding-top:12px;'
      )
    )
    const top = cc.whatCanMoveIt.slice(0, 5)
    if (top.length > 0) {
      // Cuando los cinco comparten el mismo motivo —y lo comparten casi siempre, porque casi todo
      // lo del cliente es «depende de una firma»— repetirlo cinco veces gasta cinco renglones para
      // decir una cosa. Sube a la nota del final y los renglones se quedan con el dato.
      const motivos = new Set(top.map((r) => r.why))
      const motivoUnico = motivos.size === 1 ? [...motivos][0] : null

      partes.push(
        tablaDeLineas(
          top.map((r) => ({
            izq: r.name,
            // Sin nombre propio: ver la cabecera de este archivo.
            sub: `Comprometido para el ${fechaMedia(deIso(r.dueDate))}${motivoUnico ? '' : ` · ${r.why}`}`,
            der: `${r.blocks.toLocaleString('es-MX')} líneas`,
          })),
          C.ink
        )
      )
      // «Se puede acelerar con más recursos» es uno de los motivos posibles, y pegado a «ninguno se
      // resuelve poniendo más gente» produce una frase que se contradice sola. Cuando el motivo
      // único es ése, la nota se queda en el reparto de responsabilidad y no promete nada más.
      const noSeAcelera = motivoUnico !== null && !/recurso/i.test(motivoUnico)
      partes.push(
        nota(
          noSeAcelera
            ? `Esto no es un reproche: es el reparto de lo que cada parte tiene en sus manos. Ninguno de estos puntos se resuelve poniendo más gente — ${motivoUnico!.charAt(0).toLowerCase()}${motivoUnico!.slice(1).replace(/\.$/, '')}.`
            : 'Esto no es un reproche: es el reparto de lo que cada parte tiene en sus manos: qué está esperando a quién.'
        )
      )
    }
  }

  // ── 5, 6 y 7. Bloqueos, riesgos y acuerdos ────────────────────────────────────────────────
  if (e.gobiernoVacio) {
    partes.push(seccion('Bloqueos, riesgos y acuerdos'))
    partes.push(
      parrafo(
        'No hay ningún bloqueo, riesgo ni acuerdo registrado en la herramienta para este proyecto.',
        'padding-top:12px;'
      )
    )
    partes.push(
      nota(
        `Esto se reporta como hallazgo, no como buena noticia. Un proyecto con ${a.atrasadas.length} actividades atrasadas y un registro de gobierno vacío no es un proyecto sin riesgos: es un proyecto cuyos riesgos no se están escribiendo.` +
          (cc && cc.clientOverdue > 0
            ? ` Los ${cc.clientOverdue} compromisos vencidos del cliente que aparecen arriba deberían estar aquí como bloqueos formales.`
            : '')
      )
    )
  } else {
    if (e.bloqueos.length > 0) {
      const abiertos = e.bloqueos.filter((b) => !b.resuelto).sort((x, y) => porSeveridad(x.severidad, y.severidad))
      partes.push(seccion(`Bloqueos · ${abiertos.length} abiertos de ${e.bloqueos.length}`))
      partes.push(
        tablaDeLineas(
          abiertos.slice(0, 6).map((b) => ({
            izq: b.descripcion,
            sub: `Severidad ${(SEVERIDAD[b.severidad] ?? b.severidad).toLowerCase()} · bloqueado por ${b.bloqueadoPor} · días abierto`,
            der: `${b.diasAbierto} d`,
          })),
          C.crimson
        )
      )
    }
    if (e.riesgos.length > 0) {
      const abiertos = e.riesgos.filter((r) => r.estado !== 'CLOSED').sort((x, y) => porSeveridad(x.nivel, y.nivel))
      partes.push(seccion(`Riesgos · ${abiertos.length} abiertos de ${e.riesgos.length}`))
      partes.push(
        tablaDeLineas(
          abiertos.slice(0, 6).map((r) => ({
            izq: r.descripcion,
            sub: `Nivel ${(SEVERIDAD[r.nivel] ?? r.nivel).toLowerCase()} · ${ESTADO_RIESGO[r.estado] ?? r.estado} · probabilidad ${r.probabilidad}, impacto ${r.impacto}`,
            der: `${r.diasAbierto} d`,
          })),
          C.crimson
        )
      )
    }
    if (e.acuerdos.length > 0) {
      partes.push(seccion(`Acuerdos · ${e.acuerdos.length}`))
      partes.push(
        tablaDeLineas(
          e.acuerdos.slice(0, 6).map((ac) => ({
            izq: ac.titulo,
            sub: `${ESTADO_ACUERDO[ac.estado] ?? ac.estado} · acordado el ${fechaMedia(ac.acordadoEl)}${ac.comprometidoPara ? ` · líneas comprometidas hasta el ${fechaMedia(ac.comprometidoPara)}` : ''}`,
            der: `${ac.diasDesdeQueSeAcordo} d`,
          })),
          C.ink
        )
      )
      partes.push(
        nota(
          'Los acuerdos no tienen fecha de vencimiento en la herramienta: la columna guarda cuándo se acordó, no cuándo vence. Los días indican antigüedad desde que se tomó el acuerdo.'
        )
      )
    }
  }

  // ── 8. La lectura ─────────────────────────────────────────────────────────────────────────
  for (const s of narrativa?.secciones?.slice(0, 3) ?? []) {
    partes.push(seccion(s.rotulo))
    if (s.afirmacion) {
      partes.push(`<tr><td class="pad" style="padding:12px 36px 0 36px; font-family:${SERIF}; font-size:18px; line-height:25px; color:${C.ink};">${esc(s.afirmacion)}</td></tr>`)
    }
    for (const t of s.parrafos?.slice(0, 2) ?? []) partes.push(parrafo(t))
  }

  // ── 9. Lo que se pide ─────────────────────────────────────────────────────────────────────
  if (narrativa?.peticiones?.length) {
    partes.push(seccion('Lo que se pide a este comité'))
    const filas = narrativa.peticiones
      .slice(0, 5)
      .map((p2, i) => {
        const meta = [p2.aQuien, p2.paraCuando].filter(Boolean).join(' · ')
        return `<tr>
  <td valign="top" width="26" style="width:26px; padding:10px 0 0 0; font-family:${SERIF}; font-size:15px; color:${C.teal};">${i + 1}.</td>
  <td style="padding:10px 0 0 0; font-family:${SANS}; font-size:13px; line-height:19px; color:${C.ink};">${esc(p2.texto)}${meta ? `<div style="font-family:${SANS}; font-size:11px; color:${C.grayLight}; padding-top:3px;">${esc(meta)}</div>` : ''}</td>
</tr>`
      })
      .join('')
    partes.push(`<tr><td class="pad" style="padding:6px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${ANCHO}" style="width:${ANCHO}px;">${filas}</table>
</td></tr>`)
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
      Generado por PM SWO con los datos del plan al ${esc(fechaLarga(deIso(e.corte)))}. Las cifras de este reporte se calculan del plan y son verificables contra la herramienta. Los párrafos en prosa los redacta un modelo a partir de esas mismas cifras: son una interpretación, y ante cualquier diferencia mandan las cifras.
      <br /><br />Para cambiar destinatarios o dejar de recibirlo, responde este correo.
    </td></tr>
  </table>
</td></tr>`)

  const html = shell({ title: subject, preheader, body: partes.join('\n') })
  return { subject, html, text: armarTextoPlano(e, narrativa, veredicto) }
}

/** La misma información, en texto. Sin ella sube el puntaje de spam y los lectores simples no leen nada. */
function armarTextoPlano(
  e: Expediente,
  narrativa: NarrativaEjecutiva | undefined,
  veredicto: Veredicto
): string {
  const m = e.panel.metricas
  const a = e.atrasos
  const p = e.plan?.proyeccion
  const L: string[] = [
    'SOFTWAREONE · REPORTE EJECUTIVO',
    `Corte al ${fechaLarga(deIso(e.corte))}`,
    '',
    e.proyecto.nombre,
    `${e.proyecto.cliente} · comprometido para el ${fechaMedia(e.proyecto.comprometidoPara)}`,
    `Veredicto: ${veredicto}`,
    '',
  ]
  if (narrativa?.entradilla) L.push(narrativa.entradilla, '')

  L.push(`¿LLEGAMOS AL ${fechaMedia(e.proyecto.comprometidoPara).toUpperCase()}?`)
  if (p) {
    L.push(
      `  El plan como está capturado ... cierra el ${p.cierreDelPlan}`,
      `  La deuda al corte ............ ${a.atrasadas.length} actividades atrasadas`,
      `                                 mediana ${a.medianaDiasHabiles} días hábiles, la peor ${a.maximoDiasHabiles}`,
      `  El cierre proyectado ......... ${p.cierreProyectado} (${p.corrimientoDiasHabiles} días hábiles tarde)`,
      '',
      `  La proyección reancla a hoy las ${p.lineasReancladas} actividades abiertas que ya debieron arrancar`,
      '  y reprograma. Es un suelo mecánico, no un pronóstico.',
      ''
    )
  } else {
    L.push('  La proyección no se pudo calcular en esta corrida.', '')
  }

  const oyf = e.plan?.olasYFrentes
  if (oyf && oyf.olas.length > 0) {
    L.push('OLAS DE MIGRACIÓN')
    for (const al of oyf.alertas.filter((x) => x.tipo !== 'compuertaDetenida')) L.push(`  ! ${textoDeAlerta(al)}`)
    for (const x of oyf.olas) {
      const fechas = x.cortada
        ? `corte ${x.corteComprometido ?? '—'} · cortada`
        : `corte ${x.corteComprometido ?? '—'} → ${x.corteProyectado ?? '—'}`
      const atraso =
        x.semaforo && x.atrasoDiasHabiles !== null ? etiquetaDeSemaforo(x.semaforo, x.atrasoDiasHabiles) : 'Cortada'
      L.push(`  Ola ${x.numero} ${x.ambiente} — ${x.fase} — ${fechas} — ${pct(x.avanceReal)} / ${pct(x.avanceEsperado)} — ${atraso}`)
    }
    if (oyf.compuertas.length > 0) {
      L.push('', 'COMPUERTAS')
      for (const al of oyf.alertas.filter((x) => x.tipo === 'compuertaDetenida')) L.push(`  ! ${textoDeAlerta(al)}`)
      for (const c of oyf.compuertas) {
        L.push(
          `  ${c.codigo} · ${c.nombre} (${listaDeOlas(c.olas)}) — ${c.listas} de ${c.total} listas, ${c.vencidas} vencidas — ${c.terminada ? 'Lista' : etiquetaDeSemaforo(c.semaforo, c.atrasoDiasHabiles)}`
        )
      }
    }
    L.push('')
  }
  if (oyf && oyf.frentes.length > 0) {
    L.push('FRENTES DE PLATAFORMA')
    for (const f of oyf.frentes) {
      L.push(
        `  ${f.nombre} — ${f.terminado ? 'Terminado' : `${pct(f.avanceReal)} / ${pct(f.avanceEsperado)} — ${f.comprometido} → ${f.proyectado} — ${etiquetaDeSemaforo(f.semaforo, f.atrasoDiasHabiles)} — ${f.vencidas} vencidas`}`
      )
    }
    L.push('  Atraso real en días hábiles: 0 en tiempo, 1 a 5 atención, más de 5 en riesgo.', '')
  }

  L.push(
    'DÓNDE ESTÁ EL PROYECTO HOY',
    `  Avance real .............. ${(m.proyecto.progresoGlobal * 100).toFixed(1)}%`,
    `  Calendario consumido ..... ${(m.avanceTemporal.planificado * 100).toFixed(1)}%`,
    `  Desviación ............... ${(m.avanceTemporal.desviacion * 100).toFixed(1)} puntos`,
    `  Hitos atrasados .......... ${m.hitos.atrasados} de ${m.hitos.total}`,
    `  Actividades atrasadas .... ${a.atrasadas.length} (de ${m.tareas.hojas} ejecutables)`,
    '',
    'REPARTO DEL ATRASO',
    ...a.reparto.map((t) => `  ${t.rotulo.padEnd(24)} ${String(t.cuantas).padStart(3)}`),
    ''
  )

  if (a.compromisos.length > 0) {
    L.push(`HITOS, ENTREGAS Y APROBACIONES ATRASADOS (${a.compromisos.length})`)
    for (const c of a.compromisos.slice(0, 10)) {
      L.push(`  - ${c.titulo} — ${c.diasHabilesDeAtraso} días hábiles — responde ${c.parte === 'CLIENTE' ? 'el cliente' : 'SoftwareOne'}`)
    }
    L.push('')
  }
  if (a.ejecucion.length > 0) {
    L.push(`ACTIVIDADES DE EJECUCIÓN ATRASADAS (${a.ejecucion.length})`)
    for (const c of a.ejecucion.slice(0, 5)) {
      L.push(`  - ${c.titulo} — ${c.diasHabilesDeAtraso} días hábiles`)
    }
    L.push('')
  }

  const cc = e.plan?.informe
  if (cc && cc.clientCommitments > 0) {
    L.push(
      'LO QUE DEPENDE DEL CLIENTE',
      `  ${cc.clientCommitments} compromisos · ${cc.clientOverdue} vencidos · ${cc.clientAtRisk} por vencer`,
      `  Detienen ${cc.linesBlockedByClient} líneas del plan`
    )
    for (const r of cc.whatCanMoveIt.slice(0, 5)) {
      L.push(`  - ${r.name} — vencía el ${r.dueDate} — detiene ${r.blocks} líneas`)
    }
    L.push('')
  }

  if (e.gobiernoVacio) {
    L.push(
      'BLOQUEOS, RIESGOS Y ACUERDOS',
      '  No hay ninguno registrado en la herramienta.',
      '  Se reporta como hallazgo: un proyecto con este atraso y sin riesgos escritos',
      '  no es un proyecto sin riesgos.',
      ''
    )
  } else {
    if (e.bloqueos.length) {
      L.push(`BLOQUEOS (${e.bloqueos.filter((b) => !b.resuelto).length} abiertos)`)
      for (const b of e.bloqueos.filter((x) => !x.resuelto).slice(0, 6)) {
        L.push(`  - [${SEVERIDAD[b.severidad] ?? b.severidad}] ${b.descripcion} — ${b.diasAbierto} días`)
      }
      L.push('')
    }
    if (e.riesgos.length) {
      L.push(`RIESGOS (${e.riesgos.filter((r) => r.estado !== 'CLOSED').length} abiertos)`)
      for (const r of e.riesgos.filter((x) => x.estado !== 'CLOSED').slice(0, 6)) {
        L.push(`  - [${SEVERIDAD[r.nivel] ?? r.nivel} / ${ESTADO_RIESGO[r.estado] ?? r.estado}] ${r.descripcion} — ${r.diasAbierto} días`)
      }
      L.push('')
    }
    if (e.acuerdos.length) {
      L.push(`ACUERDOS (${e.acuerdos.length})`)
      for (const ac of e.acuerdos.slice(0, 6)) {
        L.push(`  - [${ESTADO_ACUERDO[ac.estado] ?? ac.estado}] ${ac.titulo} — acordado hace ${ac.diasDesdeQueSeAcordo} días`)
      }
      L.push('')
    }
  }

  if (narrativa?.peticiones?.length) {
    L.push('LO QUE SE PIDE A ESTE COMITÉ')
    narrativa.peticiones.slice(0, 5).forEach((p2, i) => {
      L.push(`  ${i + 1}. ${p2.texto}${p2.aQuien ? ` — ${p2.aQuien}` : ''}${p2.paraCuando ? ` (${p2.paraCuando})` : ''}`)
    })
    L.push('')
  }

  L.push(
    'Generado por PM SWO. Las cifras salen del plan y son verificables contra la herramienta.',
    'Los párrafos en prosa son una interpretación de un modelo; ante cualquier diferencia mandan las cifras.'
  )
  return L.join('\n')
}

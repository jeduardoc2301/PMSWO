/**
 * Buscar una línea del plan para colgarle algo: un bloqueo, un acuerdo.
 *
 * ## Por qué no basta un desplegable
 *
 * El selector anterior era un `<Select>` con las 1 368 líneas del plan en orden ALFABÉTICO y sólo
 * el título. Tres cosas lo hacían inservible a la vez:
 *
 * 1. **No se podía buscar.** Encontrar una línea era desplazarse por mil renglones.
 * 2. **El orden alfabético desarma el plan.** «[Banco] …» arriba, «1.1 …» debajo, y lo que en el
 *    plan está junto queda a cientos de renglones de distancia.
 * 3. **Los títulos se repiten.** En un plan por olas, «Solicitar reglas en el firewall perimetral»
 *    aparece once veces, una por ola, y en el desplegable eran once renglones idénticos. Elegir la
 *    correcta era adivinar.
 *
 * Aquí cada línea lleva su **ruta** —los títulos de sus ancestros— y la búsqueda mira también en
 * ella, así que «firewall ola 3» encuentra exactamente la de la Ola 3.
 *
 * Todo es aritmética sobre filas, sin navegador, para probarlo sin montar el diálogo.
 */
import { isOverdue } from '@/lib/urgency'

/** Lo que llega de `GET /api/v1/projects/[id]/work-items`. */
export interface LineaBuscable {
  readonly id: string
  readonly title: string
  readonly status: string
  readonly parentId?: string | null
  readonly phase?: string | null
  readonly kind?: string | null
  readonly progressPct?: number | null
  /** ISO. Puede llegar como cadena con hora (`2026-09-17T00:00:00.000Z`). */
  readonly estimatedEndDate?: string | null
  readonly responsibleName?: string | null
  readonly templateOrder?: number | null
}

export interface OpcionDeLinea {
  readonly id: string
  readonly titulo: string
  /** Títulos de los ancestros, de la raíz al padre. Vacío en una línea raíz. */
  readonly ruta: readonly string[]
  /** Verdadero cuando la línea agrupa a otras: un bloqueo ahí afecta a toda la rama. */
  readonly esGrupo: boolean
  readonly hijas: number
  readonly atrasada: boolean
  readonly terminada: boolean
  readonly avancePct: number
  /** `AAAA-MM-DD`, o nulo si la línea no trae fecha. */
  readonly fin: string | null
  readonly responsable: string | null
  /** Posición en el plan, para que el orden sea el del plan y no el del alfabeto. */
  readonly orden: number
  /** Título y ruta ya normalizados, para no repetir el trabajo en cada tecla. */
  readonly textoBuscable: string
  readonly tituloBuscable: string
}

const TERMINALES = new Set(['DONE', 'CLOSED', 'CANCELLED'])

/**
 * Minúsculas y sin acentos.
 *
 * Quien busca «migracion» tiene que encontrar «Migración», y quien teclea en un teléfono no pone
 * tildes. Se normaliza igual lo que se busca y donde se busca.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Prepara las opciones una sola vez: rutas, estado y texto de búsqueda.
 *
 * @param hoy Fecha de referencia para decidir qué va atrasado. Entra por parámetro para que se
 *   pueda probar; la pantalla pasa la de hoy.
 */
export function prepararOpciones(
  lineas: readonly LineaBuscable[],
  hoy: Date = new Date()
): OpcionDeLinea[] {
  const porId = new Map(lineas.map((l) => [l.id, l]))

  const hijas = new Map<string, number>()
  for (const l of lineas) {
    if (l.parentId) hijas.set(l.parentId, (hijas.get(l.parentId) ?? 0) + 1)
  }

  const rutaDe = (l: LineaBuscable): string[] => {
    const ruta: string[] = []
    const vistos = new Set<string>([l.id])
    let actual = l.parentId ? porId.get(l.parentId) : undefined
    // `vistos` corta un ciclo en la jerarquía: la ruta queda incompleta en vez de colgar la
    // pantalla en un bucle infinito.
    while (actual && !vistos.has(actual.id)) {
      vistos.add(actual.id)
      ruta.unshift(actual.title)
      actual = actual.parentId ? porId.get(actual.parentId) : undefined
    }
    return ruta
  }

  return lineas
    .map((l, i) => {
      const ruta = rutaDe(l)
      const fin = l.estimatedEndDate ? l.estimatedEndDate.slice(0, 10) : null
      const nHijas = hijas.get(l.id) ?? 0
      const terminada = TERMINALES.has(l.status) || (l.progressPct ?? 0) >= 1
      return {
        id: l.id,
        titulo: l.title,
        ruta,
        esGrupo: nHijas > 0,
        hijas: nHijas,
        // La definición única de «atrasada» del §9.3: la misma del Panel, la Lista y el Tablero.
        // Una línea de agrupación no se marca: su fecha es el envoltorio de las de abajo.
        atrasada:
          nHijas === 0 &&
          isOverdue({ estimatedEndDate: fin, status: l.status, progressPct: l.progressPct ?? 0 }, hoy),
        terminada,
        avancePct: Math.round((l.progressPct ?? 0) * 100),
        fin,
        responsable: l.responsibleName?.trim() || null,
        orden: l.templateOrder ?? i,
        textoBuscable: normalizar([...ruta, l.title, l.phase ?? ''].join(' · ')),
        tituloBuscable: normalizar(l.title),
      }
    })
    .sort((a, b) => a.orden - b.orden)
}

/**
 * ¿Aparece la palabra en el texto?
 *
 * Las letras se buscan en cualquier parte —«wall» encuentra «firewall»—, pero **un número se busca
 * como número entero**. Buscado como subcadena, el «3» de «firewall ola 3» coincidía también con
 * «Ola 4 PROD - 13 servidores» y devolvía la ola equivocada: en un plan donde los nombres llevan
 * cantidades de servidores, fechas y números de ola, un dígito suelto aparece en casi todas partes.
 * Quien teclea «3» quiere decir el 3, no el 13 ni el 30.
 */
function contiene(texto: string, palabra: string): boolean {
  if (!/^\d+$/.test(palabra)) return texto.includes(palabra)
  return new RegExp(`(^|\\D)${palabra}(\\D|$)`).test(texto)
}

export interface ResultadoDeBusqueda {
  readonly opciones: readonly OpcionDeLinea[]
  /** Cuántas coinciden en total, aunque se muestren menos. */
  readonly total: number
  /** Verdadero cuando no hay consulta y lo que se muestra son sugerencias. */
  readonly sonSugerencias: boolean
}

/** Cuántas sugerencias se ofrecen sin escribir nada. Una pantalla, no un catálogo. */
const SUGERENCIAS = 8

/**
 * Filtra y ordena.
 *
 * Cada palabra de la consulta tiene que aparecer —en el título o en la ruta—, en cualquier orden:
 * «ola 3 firewall» y «firewall ola 3» encuentran lo mismo.
 *
 * El orden, de más útil a menos:
 * 1. Que la coincidencia esté en el TÍTULO, no sólo en la ruta. Buscar «firewall» tiene que poner
 *    primero las líneas que hablan del firewall, no las que cuelgan de algo que lo menciona.
 * 2. Líneas ejecutables antes que grupos: un bloqueo casi siempre detiene una actividad concreta.
 * 3. Abiertas antes que terminadas: bloquear algo que ya acabó es raro.
 * 4. El orden del plan, para que lo que está junto en el plan salga junto.
 *
 * Sin consulta no se enseña «todo»: se sugieren las atrasadas, de la más vieja a la más reciente,
 * porque un bloqueo casi siempre explica trabajo que ya va tarde.
 */
export function buscarLineas(
  opciones: readonly OpcionDeLinea[],
  consulta: string,
  limite = 50
): ResultadoDeBusqueda {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean)

  if (palabras.length === 0) {
    const atrasadas = opciones
      .filter((o) => o.atrasada)
      .sort((a, b) => (a.fin ?? '').localeCompare(b.fin ?? '') || a.orden - b.orden)
    return { opciones: atrasadas.slice(0, SUGERENCIAS), total: atrasadas.length, sonSugerencias: true }
  }

  const coinciden = opciones.filter((o) => palabras.every((p) => contiene(o.textoBuscable, p)))

  const puntaje = (o: OpcionDeLinea) => {
    const enTitulo = palabras.filter((p) => contiene(o.tituloBuscable, p)).length
    return (
      enTitulo * 1000 + // más palabras en el título, más arriba
      (o.esGrupo ? 0 : 100) +
      (o.terminada ? 0 : 10)
    )
  }

  const ordenadas = [...coinciden].sort((a, b) => puntaje(b) - puntaje(a) || a.orden - b.orden)
  return { opciones: ordenadas.slice(0, limite), total: coinciden.length, sonSugerencias: false }
}

/**
 * Parte un texto en trozos marcando dónde coincide alguna palabra buscada, sin fijarse en acentos.
 *
 * El texto se normaliza CARÁCTER POR CARÁCTER para que las posiciones del normalizado sirvan en el
 * original: normalizar la cadena entera y buscar ahí daría posiciones corridas en cuanto hubiera
 * una letra acentuada antes de la coincidencia.
 */
export function resaltar(
  texto: string,
  consulta: string
): readonly { readonly texto: string; readonly coincide: boolean }[] {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean)
  if (palabras.length === 0 || !texto) return [{ texto, coincide: false }]

  const caracteres = Array.from(texto)
  const plano = caracteres.map((c) => normalizar(c).charAt(0) || ' ').join('')
  const marca = new Array<boolean>(caracteres.length).fill(false)

  const esDigito = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'
  for (const p of palabras) {
    // La misma regla que `contiene`: un número se marca sólo donde aparece entero. Si no, buscando
    // «3» se iluminaría el 3 de «13 servidores», y lo que se ve marcado no sería lo que coincidió.
    const numero = /^\d+$/.test(p)
    let desde = 0
    for (;;) {
      const i = plano.indexOf(p, desde)
      if (i < 0) break
      const entero = !numero || (!esDigito(plano[i - 1]) && !esDigito(plano[i + p.length]))
      if (entero) for (let k = i; k < i + p.length && k < marca.length; k++) marca[k] = true
      desde = i + 1
    }
  }

  const trozos: { texto: string; coincide: boolean }[] = []
  caracteres.forEach((c, i) => {
    const ultimo = trozos[trozos.length - 1]
    if (ultimo && ultimo.coincide === marca[i]) ultimo.texto += c
    else trozos.push({ texto: c, coincide: marca[i] })
  })
  return trozos
}

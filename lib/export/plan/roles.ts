/**
 * Papeles semánticos de una línea de plan.
 *
 * **Este archivo es la frontera entre el tema y el exportador.** El exportador pinta y agrupa
 * según el *papel*; el papel sale de la configuración del proyecto o, si no la hay, de la forma
 * de la propia línea. En ningún caso sale de un literal de tipo escrito en el código.
 *
 * La diferencia importa porque los tipos son del proyecto y los papeles son del formato. Un plan
 * de migración llama «Ola» a lo que uno de obra civil llama «Frente» y uno de producto llama
 * «Épica»; los tres quieren la misma barra oscura de contenedor mayor. Si el exportador
 * preguntara por el tipo, habría que tocarlo cada vez que aparece un plan nuevo — y ese es
 * exactamente el fallo que este diseño evita.
 *
 * Consecuencia práctica: un plan **sin configuración ninguna** exporta bien. Los contenedores
 * salen de la jerarquía real y todo lo demás es trabajo. Es el caso que prueba que el tema no se
 * coló en el código.
 */

export const PAPELES = [
  'contenedor_raiz',
  'contenedor_mayor',
  'contenedor_medio',
  'trabajo',
  'hito',
  'aprobacion',
  'dependencia_externa',
  'control',
] as const

export type Papel = (typeof PAPELES)[number]

export function esPapel(valor: unknown): valor is Papel {
  return typeof valor === 'string' && (PAPELES as readonly string[]).includes(valor)
}

/** Cómo se ve cada papel. Es presentación pura: no decide qué se exporta, sólo cómo se lee. */
export interface Aspecto {
  /** Relleno de toda la fila. `null` es sin relleno. */
  readonly fondo: string | null
  readonly texto: string
  readonly negrita: boolean
}

export const ASPECTO: Readonly<Record<Papel, Aspecto>> = Object.freeze({
  contenedor_raiz: { fondo: '1F2937', texto: 'FFFFFF', negrita: true },
  contenedor_mayor: { fondo: '334155', texto: 'FFFFFF', negrita: true },
  contenedor_medio: { fondo: 'DCE3EC', texto: '1F2937', negrita: true },
  control: { fondo: 'E6F3F1', texto: '0F766E', negrita: true },
  hito: { fondo: 'FFF1F1', texto: 'B3141C', negrita: true },
  aprobacion: { fondo: 'FDF3E3', texto: '7C2D12', negrita: true },
  dependencia_externa: { fondo: 'FDE9D9', texto: '7C2D12', negrita: true },
  trabajo: { fondo: null, texto: '334155', negrita: false },
})

/** Lo que el exportador necesita saber de una línea para decidir su papel. Nada más. */
export interface LineaParaPapel {
  /** Cómo llama el plan a esta línea. Puede ser cualquier cosa; aquí no se interpreta. */
  readonly tipo: string | null
  readonly profundidad: number
  readonly tieneHijas: boolean
  /** Duración en días laborables. Cero es un hito, si además no tiene hijas. */
  readonly duracion: number
}

/**
 * Mapa de tipo a papel, tal como lo guarda el proyecto.
 *
 * Las claves son los nombres que usa *ese* plan —`Ola`, `Prerrequisito Cliente`, `Gate`—, no una
 * lista cerrada. Se comparan sin distinguir mayúsculas ni espacios de sobra porque quien los
 * escribe es una persona en un formulario, no el sistema.
 */
export type MapaDePapeles = Readonly<Record<string, string>>

function normalizar(texto: string): string {
  return texto.trim().toLowerCase()
}

/**
 * Decide el papel de una línea.
 *
 * Primero manda la configuración: si el plan dice que sus «Olas» son contenedores mayores, lo son
 * aunque la jerarquía opinara otra cosa. Sin configuración se cae a la forma de la línea.
 *
 * **El orden de los dos respaldos está invertido respecto a la primera redacción de la regla**, y
 * a propósito. La regla decía «duración 0 → hito; tiene hijas → contenedor». Aplicada en ese
 * orden, un contenedor cuyas hijas caen todas el mismo día —una ola de corte, un paquete de
 * aprobaciones— dura cero y saldría pintado como hito: la rama entera perdería su cabecera y su
 * control de agrupar, que es justo lo que el contenedor existe para dar. Una línea con hijas es
 * un contenedor aunque abarque un solo día; sólo una línea sin hijas puede ser un hito. Si algún
 * plan necesitara lo contrario, eso se dice en el mapa, que para eso está.
 */
export function papelDe(linea: LineaParaPapel, mapa: MapaDePapeles | null | undefined): Papel {
  if (mapa && linea.tipo) {
    const buscado = normalizar(linea.tipo)
    for (const [clave, valor] of Object.entries(mapa)) {
      if (normalizar(clave) === buscado && esPapel(valor)) return valor
    }
  }

  if (linea.tieneHijas) {
    if (linea.profundidad <= 0) return 'contenedor_raiz'
    if (linea.profundidad === 1) return 'contenedor_mayor'
    return 'contenedor_medio'
  }

  if (linea.duracion === 0) return 'hito'

  return 'trabajo'
}

/** Los papeles cuyas filas no se capturan: su avance sale de las hijas. */
export function esContenedor(papel: Papel): boolean {
  return papel === 'contenedor_raiz' || papel === 'contenedor_mayor' || papel === 'contenedor_medio'
}

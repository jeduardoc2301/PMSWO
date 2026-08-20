/**
 * Claro, oscuro, o lo que diga el sistema (brecha 28, §9.3 C6).
 *
 * La aplicación nació oscura y sigue siéndolo por omisión: son mil trescientos colores escritos a
 * mano en las seis vistas, y el que no ha elegido nada tiene que seguir viendo exactamente lo mismo
 * que veía ayer. Lo que se añade es la **posibilidad de elegir**, no un cambio de aspecto.
 *
 * ## Tres estados, no dos
 *
 * Un conmutador de dos posiciones obliga a decidir en nombre de quien no ha decidido. Aquí hay tres:
 *
 * - `sistema` — sin elección: manda `prefers-color-scheme`. Es el estado inicial.
 * - `oscuro` y `claro` — elección explícita, que **gana** sobre el sistema en los dos sentidos.
 *
 * Que la elección explícita gane en los dos sentidos importa: quien tiene el sistema en claro y
 * quiere esta aplicación oscura necesita poder decirlo, y no sólo al revés.
 *
 * ## Por qué el atributo y no una clase
 *
 * El tema se estampa como `data-theme` en `<html>` porque una clase se pierde en cuanto alguien
 * escribe `className=` sobre el elemento raíz, y porque un atributo se puede leer y escribir desde
 * el guion previo al pintado sin tocar la lista de clases que Tailwind también usa.
 */

export const TEMAS = ['sistema', 'claro', 'oscuro'] as const
export type Tema = (typeof TEMAS)[number]

/** Dónde se guarda la elección. En `localStorage` y no en una `cookie`: no le hace falta al servidor. */
export const LLAVE_DEL_TEMA = 'pmswo:tema'

/** Lo que acaba pintado: sólo hay dos aspectos, aunque haya tres estados. */
export type Aspecto = 'claro' | 'oscuro'

export function esTema(valor: unknown): valor is Tema {
  return typeof valor === 'string' && (TEMAS as readonly string[]).includes(valor)
}

/**
 * Qué se pinta, dada la elección y lo que dice el sistema.
 *
 * `prefiereClaro` es lo que responde `prefers-color-scheme: light`. Se pasa como argumento —en vez
 * de consultarlo aquí— porque esta función también corre en el servidor y en las pruebas, donde no
 * hay `matchMedia`.
 *
 * Sin elección **y** sin preferencia del sistema sale oscuro: es lo que la aplicación ha sido
 * siempre, y cambiarle el aspecto a quien no ha pedido nada no es una mejora, es una sorpresa.
 */
export function aspectoDe(tema: Tema, prefiereClaro: boolean): Aspecto {
  if (tema === 'claro') return 'claro'
  if (tema === 'oscuro') return 'oscuro'
  return prefiereClaro ? 'claro' : 'oscuro'
}

/** Lo guardado, saneado. Cualquier basura en `localStorage` vuelve a `sistema`. */
export function temaGuardado(crudo: string | null): Tema {
  return esTema(crudo) ? crudo : 'sistema'
}

/** Cómo se llama cada estado en pantalla. */
export const NOMBRE_DEL_TEMA: Readonly<Record<Tema, string>> = Object.freeze({
  sistema: 'Como el sistema',
  claro: 'Claro',
  oscuro: 'Oscuro',
})

/**
 * El guion que se ejecuta **antes del primer pintado**, en línea en el `<head>`.
 *
 * Sin esto hay un fogonazo: el servidor no sabe qué eligió esta persona —la elección vive en el
 * navegador—, así que la página llega sin estampar y se pinta oscura un instante antes de que React
 * la corrija. Un parpadeo de oscuro a claro en cada navegación es peor que no tener modo claro.
 *
 * Va como cadena y no como módulo porque tiene que correr **síncrono y antes que nada**: cualquier
 * cosa que Next cargue como módulo llega después del primer pintado.
 *
 * El `try` no es decoración: `localStorage` lanza en modo privado de algunos navegadores y con las
 * cookies de terceros bloqueadas dentro de un `iframe`. Si lanza, se queda oscuro, que es lo que la
 * aplicación era antes de todo esto.
 */
export function guionSinParpadeo(): string {
  return [
    '(function(){try{',
    `var t=localStorage.getItem(${JSON.stringify(LLAVE_DEL_TEMA)});`,
    "if(t!=='claro'&&t!=='oscuro'&&t!=='sistema'){t='sistema';}",
    "var claro=t==='claro'||(t==='sistema'&&window.matchMedia('(prefers-color-scheme: light)').matches);",
    "document.documentElement.setAttribute('data-theme',claro?'claro':'oscuro');",
    "document.documentElement.setAttribute('data-tema-elegido',t);",
    '}catch(e){}})()',
  ].join('')
}

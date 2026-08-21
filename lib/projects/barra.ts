/**
 * La barra lateral, plegada o abierta.
 *
 * ## Por qué esto es un módulo y no un `useState` en el menú
 *
 * El ancho de la barra está escrito en **dos sitios que no se hablan**: el `w-64` del `<aside>`, que
 * es un componente de cliente, y el `ml-64` de los cinco `<main>` de sección, que son layouts de
 * servidor. Un estado de React dentro del menú no puede llegar al margen del contenido sin convertir
 * esos cinco layouts en cliente, y eso es un precio alto por un botón.
 *
 * Así que el estado se estampa como atributo en `<html>` y **los dos anchos salen de CSS**. El menú
 * sólo escribe el atributo; quien mueve las cosas es la hoja de estilos. Es exactamente lo que ya
 * hace el tema, y por la misma razón.
 *
 * ## Por qué hace falta un guion antes del primer pintado
 *
 * El servidor no sabe si esta persona dejó la barra plegada —la elección vive en el navegador—, así
 * que sin el guion la página llega abierta y se pliega de golpe en cuanto React se hidrata. Un
 * fogonazo de la barra cerrándose sola **en cada navegación** es peor que no poder plegarla.
 *
 * Ver [[tema]] en `lib/projects/tema.ts`: es el mismo mecanismo, y conviene que sigan pareciéndose.
 */

export const ESTADOS_DE_BARRA = ['abierta', 'plegada'] as const
export type EstadoDeBarra = (typeof ESTADOS_DE_BARRA)[number]

/** Dónde se guarda. En `localStorage` y no en una `cookie`: al servidor no le hace falta. */
export const LLAVE_DE_LA_BARRA = 'pmswo:barra'

/** El atributo que se estampa en `<html>`, y del que cuelga todo el CSS. */
export const ATRIBUTO_DE_LA_BARRA = 'data-barra'

export function esEstadoDeBarra(valor: unknown): valor is EstadoDeBarra {
  return typeof valor === 'string' && (ESTADOS_DE_BARRA as readonly string[]).includes(valor)
}

/**
 * Lo guardado, saneado.
 *
 * Cualquier basura vuelve a `abierta`, que es como la aplicación ha sido siempre. Quien no ha
 * elegido nada tiene que seguir viendo lo que veía ayer.
 */
export function barraGuardada(crudo: string | null): EstadoDeBarra {
  return esEstadoDeBarra(crudo) ? crudo : 'abierta'
}

/** Lo que dice el documento ahora mismo. La fuente de verdad para el CSS es este atributo. */
export function estadoDeLaBarra(raiz: Pick<HTMLElement, 'getAttribute'>): EstadoDeBarra {
  return barraGuardada(raiz.getAttribute(ATRIBUTO_DE_LA_BARRA))
}

/**
 * Estampa el estado y lo recuerda.
 *
 * El `try` no es decoración: `localStorage` lanza en modo privado de algunos navegadores y con las
 * cookies de terceros bloqueadas dentro de un `iframe`. Si lanza, la barra igual se mueve —el
 * atributo ya está puesto—; lo único que se pierde es que lo recuerde la próxima vez.
 */
export function estamparBarra(
  raiz: Pick<HTMLElement, 'setAttribute'>,
  estado: EstadoDeBarra,
): EstadoDeBarra {
  raiz.setAttribute(ATRIBUTO_DE_LA_BARRA, estado)
  try {
    window.localStorage.setItem(LLAVE_DE_LA_BARRA, estado)
  } catch {
    // Sin memoria, pero con la barra en su sitio.
  }
  return estado
}

/** Del estado que haya al contrario, estampado y recordado. Devuelve el nuevo. */
export function alternarBarra(
  raiz: Pick<HTMLElement, 'getAttribute' | 'setAttribute'>,
): EstadoDeBarra {
  return estamparBarra(raiz, estadoDeLaBarra(raiz) === 'plegada' ? 'abierta' : 'plegada')
}

/**
 * El guion que corre **antes del primer pintado**, en línea en el `<head>`.
 *
 * Va como cadena y no como módulo porque tiene que correr síncrono y antes que nada: cualquier cosa
 * que Next cargue como módulo llega después del primer pintado, que es justo lo que hay que evitar.
 */
export function guionSinParpadeoDeLaBarra(): string {
  return [
    '(function(){try{',
    `var b=localStorage.getItem(${JSON.stringify(LLAVE_DE_LA_BARRA)});`,
    "if(b!=='plegada'&&b!=='abierta'){b='abierta';}",
    `document.documentElement.setAttribute(${JSON.stringify(ATRIBUTO_DE_LA_BARRA)},b);`,
    '}catch(e){}})()',
  ].join('')
}

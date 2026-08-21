import type { PanelDeProyecto } from '@/services/project-dashboard.service'

/**
 * Las cifras del panel (§9), pedidas una sola vez aunque las quieran dos.
 *
 * ## Por qué existe esto y no cada quien hace su `fetch`
 *
 * Desde que el panel vive dentro del Resumen, hay **dos** partes de la misma pantalla que necesitan
 * los mismos números: los widgets, y las tarjetas de pregunta de arriba. Y tienen que decir lo
 * mismo, que era justo lo que no pasaba: el Resumen calculaba su avance por su cuenta —`terminadas /
 * total` sobre las 1368 líneas, resúmenes incluidos— y salía **0 %** donde el panel decía **0,3 %**,
 * ponderado por días hábiles sobre las 1243 hojas. Dos respuestas a la misma pregunta, una encima de
 * la otra.
 *
 * La cuenta buena es una sola y la hace el servidor —lo pide el §9.1.1, y contar resúmenes en un
 * avance es el error que ya ha mordido cuatro veces en este repositorio—. Así que aquí no se
 * recalcula nada: se pide, y quien quiera un número lo lee de la respuesta.
 *
 * ## El reparto de la petición
 *
 * Las dos partes se montan a la vez, así que sin más serían dos viajes idénticos al mismo sitio. El
 * mapa guarda la promesa **mientras está en vuelo** y la comparte; en cuanto termina, la suelta. No
 * es una caché: no hay nada que quede viejo, porque a la siguiente vez se vuelve a pedir. Sólo evita
 * que dos que preguntan a la vez pregunten dos veces.
 */
const enVuelo = new Map<string, Promise<RespuestaDelPanel>>()

export interface RespuestaDelPanel {
  readonly panel: PanelDeProyecto
  /** La fecha civil del servidor. El navegador no la decide: dos pestañas abiertas a distinta hora
   *  dirían cosas distintas sobre lo mismo. */
  readonly hoy: string
}

async function pedir(projectId: string): Promise<RespuestaDelPanel> {
  const respuesta = await fetch(`/api/v1/projects/${projectId}/dashboard`)

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}) as { message?: string })
    throw new Error(cuerpo.message ?? `HTTP ${respuesta.status}`)
  }

  const cuerpo = (await respuesta.json().catch(() => null)) as {
    panel?: PanelDeProyecto
    hoy?: string
  } | null

  /*
    Un 200 no garantiza que venga lo que hace falta.

    Esto se daba por bueno y se pasaba tal cual al estado «listo»; si el cuerpo no traía `panel`, la
    vista reventaba al desestructurarlo. Mientras el panel era una pestaña aparte eso tumbaba una
    pestaña. Desde que vive dentro del Resumen tumbaría **la pantalla que todo el mundo abre
    primero**, así que la misma respuesta mala cuesta ahora mucho más.

    Se comprueba `metricas` y no sólo `panel` a propósito: un `panel` vacío pasaría una comprobación
    que sólo mirara `panel` y volvería a reventar una línea más abajo.
  */
  if (!cuerpo || !cuerpo.panel || !cuerpo.panel.metricas || typeof cuerpo.hoy !== 'string') {
    throw new Error('El panel llegó sin datos que enseñar.')
  }

  return { panel: cuerpo.panel, hoy: cuerpo.hoy }
}

/** Las cifras del panel. Si otro las está pidiendo ahora mismo, se une a esa petición. */
export function cargarPanel(projectId: string): Promise<RespuestaDelPanel> {
  const yaVa = enVuelo.get(projectId)
  if (yaVa) return yaVa

  const promesa = pedir(projectId).finally(() => {
    enVuelo.delete(projectId)
  })
  enVuelo.set(projectId, promesa)
  return promesa
}

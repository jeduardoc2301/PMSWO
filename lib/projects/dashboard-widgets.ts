/**
 * El catálogo de widgets del panel y qué se ve por omisión (§9.1).
 *
 * Vive aquí, y no en el servicio de preferencias, porque lo necesitan los dos lados: el servidor
 * para validar lo que llega y el navegador para saber qué dibujar mientras la preferencia viaja.
 * Importarlo desde el servicio metería Prisma en el paquete del navegador por una lista de seis
 * cadenas.
 */

/** Los widgets del panel de control, en el orden del §9.1. */
export const WIDGETS_DEL_PANEL = [
  'informacion',
  'tareas',
  'tiempo',
  'hitos',
  'calendario',
  'presupuesto',
] as const

export type WidgetDelPanel = (typeof WIDGETS_DEL_PANEL)[number]

export interface PreferenciaDelPanel {
  readonly widgets: readonly WidgetDelPanel[]
}

/**
 * Qué widgets se ven cuando nadie ha tocado nada.
 *
 * Los cuatro que tienen datos. Tiempo y presupuesto arrancan apagados porque el modelo todavía no
 * los sostiene (§9.4): enseñarlos por omisión sería recibir a cada persona con dos cajas vacías.
 */
export const PANEL_POR_OMISION: PreferenciaDelPanel = {
  widgets: ['informacion', 'tareas', 'hitos', 'calendario'],
}

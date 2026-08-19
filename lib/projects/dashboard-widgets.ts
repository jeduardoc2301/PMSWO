/**
 * El catálogo de widgets del panel y qué se ve por omisión (§9.1).
 *
 * Vive aquí, y no en el servicio de preferencias, porque lo necesitan los dos lados: el servidor
 * para validar lo que llega y el navegador para saber qué dibujar mientras la preferencia viaja.
 * Importarlo desde el servicio metería Prisma en el paquete del navegador por una lista de seis
 * cadenas.
 */

/**
 * Los widgets del panel de control, en el orden en que se dibujan y se ofrecen.
 *
 * No es el orden de la numeración del §9.1 —allí «tiempo» es el 9.1.3 y «avance temporal» el
 * 9.1.5— y la diferencia es deliberada: tiempo y presupuesto son los dos que todavía no tienen
 * modelo detrás y sólo saben enseñar el aviso de qué falta (§9.4). Puestos en su número irían
 * intercalados entre widgets con datos, y el panel se leería como si tuviera huecos en medio. Van
 * al final, que es donde se pone lo que aún no está.
 *
 * El orden vive aquí y no en cada pantalla: la vista y el diálogo lo tenían escrito por su cuenta y
 * ya se habían separado de esta lista sin que se notara, porque nadie recorría el catálogo para
 * dibujar. La prueba de abajo los ata.
 */
export const WIDGETS_DEL_PANEL = [
  'informacion',
  'tareas',
  'calendario',
  'hitos',
  'tiempo',
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

/**
 * Cómo se llama en pantalla cada clase de línea de este sistema.
 *
 * Es presentación, no comportamiento: sale en la columna «Tipo» del libro y es la clave con la
 * que se busca el papel en el mapa del proyecto. Nada de lo que decide el exportador depende de
 * estos textos — si mañana se traducen, el libro sale igual de bien.
 *
 * Vive aparte porque lo usan dos sitios que TIENEN que coincidir: el exportador, que escribe la
 * etiqueta en la celda y la busca en el mapa, y la pantalla de configuración, que ofrece esas
 * mismas etiquetas como claves. Si cada uno tuviera su copia, bastaría una tilde de diferencia
 * para que alguien configurara «Aprobación cliente» y el libro no encontrara nada — sin ningún
 * error a la vista, sólo un color que no aparece.
 */
export const NOMBRE_DE_CLASE: Readonly<Record<string, string>> = Object.freeze({
  ACTIVIDAD: 'Actividad',
  HITO: 'Hito',
  PUNTO_DE_CONTROL: 'Punto de control',
  APROBACION_CLIENTE: 'Aprobación cliente',
  ENTREGA_CLIENTE: 'Entrega cliente',
  COMPUERTA: 'Compuerta',
  RESUMEN: 'Resumen',
})

/** La etiqueta de una clase, o la clase misma si es una que este sistema todavía no nombra. */
export function etiquetaDeClase(kind: string): string {
  return NOMBRE_DE_CLASE[kind] ?? kind
}

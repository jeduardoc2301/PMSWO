/**
 * Sistema visual del reporte ejecutivo.
 *
 * Los colores y escalas salen de "Reporte profesional para directivos.pdf"
 * (templateProject), extraídos del propio PDF, no estimados a ojo. El logo y la
 * marca vienen de Template.dotx.
 */
export const BRAND = {
  // Extraídos del PDF de referencia
  ink: '201E1D', // negro cálido — cuerpo y titulares
  gray: '605D5D', // texto secundario
  grayLight: '7D7979', // pies de figura y notas
  black: '000000', // filetes y masthead
  teal: '006786', // versalitas de sección, numerales
  crimson: 'AA0B56', // cifras de alarma, veredicto

  // Neutros de apoyo
  rule: 'D6D3D1', // filete fino de tabla
  track: 'E7E5E4', // canal vacío de las barras
  white: 'FFFFFF',

  /**
   * Serif de Office: es la que más se acerca al serif de transición del PDF y
   * viene con cualquier instalación de Word, así que el documento no se
   * degrada en la máquina de quien lo recibe.
   */
  serif: 'Cambria',
  sans: 'Arial',
} as const

/** Colores por estado, en el orden en que se presentan. */
export const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  BACKLOG: { label: 'Backlog', color: 'D6D3D1' },
  DONE: { label: 'Completadas', color: '201E1D' },
  IN_PROGRESS: { label: 'En curso', color: '006786' },
  BLOCKED: { label: 'Bloqueada', color: 'AA0B56' },
  TODO: { label: 'Por hacer', color: '9CA3AF' },
}

export const STATUS_ORDER = ['BACKLOG', 'DONE', 'IN_PROGRESS', 'BLOCKED', 'TODO'] as const

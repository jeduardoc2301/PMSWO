/**
 * Paleta y tipografía institucionales, tomadas del theme de Template.dotx
 * (word/theme/theme1.xml). Los valores van sin `#` porque es el formato que
 * espera OOXML para sombreados y colores de texto.
 */
export const BRAND = {
  primary: '3E00FF', // accent1 / dk2 — azul SoftwareOne
  teal: '00ECD4', // accent2
  lime: 'E3EE14', // accent3
  cyan: '00DEFF', // accent4
  blueSoft: '81A5FF', // accent5
  violetSoft: 'B7A5FF', // accent6

  ink: '111111',
  body: '3F3F46',
  muted: '71717A',
  hairline: 'E4E4E7',
  surface: 'F4F4F5',
  white: 'FFFFFF',

  // Semáforo de salud — no salen del theme, pero se mantienen sobrios para
  // que convivan con la paleta institucional en impresión.
  ok: '15A34A',
  warn: 'D97706',
  danger: 'DC2626',

  font: 'Arial',
} as const

/** Colores por estado de work item, en el orden en que se apilan. */
export const STATUS_STYLE: Record<string, { label: string; color: string }> = {
  DONE: { label: 'Completadas', color: BRAND.ok },
  IN_PROGRESS: { label: 'En curso', color: BRAND.primary },
  BLOCKED: { label: 'Bloqueadas', color: BRAND.danger },
  TODO: { label: 'Por hacer', color: BRAND.blueSoft },
  BACKLOG: { label: 'Backlog', color: BRAND.hairline },
}

export const STATUS_ORDER = ['DONE', 'IN_PROGRESS', 'BLOCKED', 'TODO', 'BACKLOG'] as const

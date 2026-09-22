/**
 * Piezas de HTML para correo. No es HTML para navegador.
 *
 * Outlook de escritorio renderiza con el motor de Word, no con uno web: no hay flexbox, no hay
 * grid, no hay hojas de estilo externas, y `border-radius` se ignora. Todo lo que hay aquí es
 * tabla con estilos en línea, que es lo único que se ve igual en Outlook, en Gmail y en el
 * teléfono. Las esquinas redondeadas se degradan a cuadradas en Outlook y no pasa nada.
 *
 * El buzón de destino es SoftwareOne, o sea Outlook/Proofpoint. Se diseña para el peor cliente.
 */

/** Escapa lo que venga de la base o del modelo. Un nombre de tarea con `<` no rompe el correo. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Paleta institucional, la misma que el reporte en Word (`lib/reports/brand.ts`). */
export const C = {
  ink: '#201E1D',
  gray: '#605D5D',
  grayLight: '#7D7979',
  teal: '#006786',
  crimson: '#AA0B56',
  rule: '#D6D3D1',
  track: '#E7E5E4',
  surface: '#FFFFFF',
  canvas: '#F5F4F2',
} as const

export const SERIF = "Cambria, Georgia, 'Times New Roman', serif"
export const SANS = "'Segoe UI', Arial, Helvetica, sans-serif"

/**
 * Envoltura completa del correo.
 *
 * `preheader` es el texto que Outlook y Gmail muestran en la lista junto al asunto. Si no se
 * pone, el cliente toma las primeras palabras del cuerpo —que suelen ser el nombre de la marca—
 * y desperdicia la única línea que decide si alguien abre el correo.
 */
export function shell(opts: { title: string; preheader: string; body: string }): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(opts.title)}</title>
<!--[if mso]>
<style type="text/css">
  table, td, div, p { font-family: Arial, sans-serif !important; }
</style>
<![endif]-->
<style type="text/css">
  /* Solo clientes que sí leen <style>. Nada crítico depende de esto. */
  @media screen and (max-width: 620px) {
    .contenedor { width: 100% !important; }
    .pad { padding-left: 20px !important; padding-right: 20px !important; }
    .kpi { display: block !important; width: 100% !important; }
  }
  a { color: ${C.teal}; }
</style>
</head>
<body style="margin:0; padding:0; background-color:${C.canvas}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
<div style="display:none; font-size:1px; color:${C.canvas}; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden;">${esc(opts.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.canvas};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="contenedor" style="width:600px; max-width:600px; background-color:${C.surface};">
        ${opts.body}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

/** Rótulo de sección: versalitas espaciadas en teal sobre filete, como en el reporte impreso. */
export function seccion(rotulo: string): string {
  return `<tr><td class="pad" style="padding:28px 36px 0 36px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr><td style="border-top:1px solid ${C.rule}; padding-top:10px; font-family:${SANS}; font-size:11px; letter-spacing:1.6px; text-transform:uppercase; color:${C.teal}; font-weight:bold;">${esc(rotulo)}</td></tr>
  </table>
</td></tr>`
}

/** Párrafo de cuerpo en serif, que es la voz del reporte. */
export function parrafo(texto: string, extra = ''): string {
  return `<tr><td class="pad" style="padding:12px 36px 0 36px; font-family:${SERIF}; font-size:15px; line-height:23px; color:${C.ink}; ${extra}">${esc(texto)}</td></tr>`
}

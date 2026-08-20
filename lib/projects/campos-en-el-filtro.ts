/**
 * Convierte los campos personalizados de un proyecto en campos del filtro unificado (§10.2).
 *
 * Es la pieza que une dos módulos que a propósito no se conocen: `campos-personalizados.ts` sabe qué
 * son los nueve tipos, y `filter.ts` sabe evaluar condiciones. Si el filtro importara los tipos del
 * modelo, cada tipo nuevo obligaría a tocarlo; así, el filtro sigue sabiendo sólo de `texto`,
 * `fecha`, `numero`, `booleano` y `lista`.
 *
 * ## Los archivados también se declaran
 *
 * Un filtro guardado puede apuntar a un campo que alguien retiró después. Quitarlo del catálogo
 * haría que ese filtro dejara de encontrar nada **sin decir por qué**. Se declaran todos; quien
 * construye un filtro nuevo se queda con los vivos, que es otra decisión y va en otro sitio.
 *
 * El nombre lleva un aviso cuando está archivado, para que quien abra el filtro guardado entienda
 * por qué ese campo ya no se ofrece para uno nuevo.
 */

import {
  type CampoPersonalizado,
  TIPO_EN_EL_FILTRO,
  claveDeCampo,
  leerValor,
} from '@/lib/projects/campos-personalizados'
import type { CampoDeclarado, LineaFiltrable } from '@/lib/projects/filter'

/** Cómo se lee el valor de un campo personalizado en una línea. */
function lectorDe(campo: CampoPersonalizado) {
  return (linea: LineaFiltrable): unknown => {
    const suyos = (linea as { customFields?: Record<string, unknown> }).customFields
    // `leerValor` sanea: lo que sale de la base es `Json` y no está tipado, así que un campo
    // declarado numérico puede traer la cadena «ocho».
    return leerValor(campo.type, suyos?.[campo.id])
  }
}

/**
 * El catálogo del proyecto, en la forma que entiende el filtro.
 *
 * La clave lleva el prefijo `cf:` — ver `claveDeCampo` — para que un campo llamado «status» no pueda
 * existir al lado del estado de verdad.
 */
export function declararCampos(
  campos: readonly CampoPersonalizado[],
): Readonly<Record<string, CampoDeclarado>> {
  const catalogo: Record<string, CampoDeclarado> = {}
  for (const campo of campos) {
    catalogo[claveDeCampo(campo)] = {
      tipo: TIPO_EN_EL_FILTRO[campo.type],
      etiqueta: campo.archivedAt ? `${campo.name} (archivado)` : campo.name,
      leer: lectorDe(campo),
    }
  }
  return catalogo
}

/**
 * Los que se ofrecen para construir un filtro **nuevo**: sólo los vivos.
 *
 * Es una decisión distinta de la de arriba y por eso es otra función. Ofrecer un campo archivado
 * para un filtro nuevo sería invitar a seguir usando algo que alguien decidió retirar.
 */
export function paraElegir(campos: readonly CampoPersonalizado[]): readonly CampoPersonalizado[] {
  return campos.filter((c) => !c.archivedAt)
}

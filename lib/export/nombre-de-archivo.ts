/**
 * El nombre con el que baja un archivo, en su cabecera HTTP.
 *
 * Vive aparte de la ruta porque es una función pura con casos límite de verdad, y porque
 * importar la ruta para probarla arrastra NextAuth entero.
 */

/**
 * Arma la cabecera `Content-Disposition`.
 *
 * Una cabecera HTTP es una cadena de BYTES, no de texto: cualquier carácter por encima de U+00FF
 * hace que el constructor de `Headers` lance, y esa excepción sale del handler convertida en un
 * 500. Es decir que la descarga **no funcionaba nunca** en un proyecto llamado en cirílico, chino,
 * griego o con un emoji — y el encargo pide expresamente que el exportador sirva igual para
 * cualquier plan, lo que incluye cualquier idioma.
 *
 * La forma correcta es la del RFC 6266: un `filename` reducido a ASCII para quien no entienda más,
 * y un `filename*` en UTF-8 porcentual para quien sí. Los navegadores actuales prefieren el
 * segundo, así que el nombre llega entero.
 *
 * El saneado quita además lo que ningún sistema de archivos acepta y los caracteres de control,
 * que un `\s+` no toca: un NUL revienta igualmente en `Headers`, y un \x01 pasa de largo hasta que
 * Node lo rechaza, con el mismo 500 al final del camino.
 */
export function cabeceraDeNombre(nombre: string, extension: string): string {
  const limpio = Array.from(nombre)
    .filter((caracter) => {
      const codigo = caracter.codePointAt(0) ?? 0
      return codigo >= 0x20 && codigo !== 0x7f
    })
    .join('')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

  const archivo = `${limpio || 'archivo'}.${extension}`

  // El repuesto en ASCII: lo que no es ASCII imprimible se sustituye, y las comillas y la barra
  // invertida se quitan para que no puedan cerrar el valor entrecomillado antes de tiempo.
  const ascii = archivo.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '')

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(archivo)}`
}

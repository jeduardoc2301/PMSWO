-- El avance que ya estaba, trasladado a la medida nueva.
--
-- La migración anterior crea `work_items.progress_bp` con DEFAULT 0, y el avance que la base ya
-- tiene vive en `progress_pct`. Sin este traslado, las 1 297 líneas de producción quedarían con el
-- Tablero enseñando el avance de verdad —lee el porcentaje— y el Timeline, la Lista y el Esquema
-- enseñándolo todo a cero —leen los puntos base—. Dos verdades sobre la misma tarea en dos pestañas
-- de la misma pantalla, y ningún error que lo delate.
--
-- No se pierde nada: el porcentaje sigue donde estaba. Lo que faltaba era copiarlo.
--
-- Sólo toca las filas donde de verdad falta el dato (`progress_bp = 0` y `progress_pct > 0`). Así
-- es inocua allí donde los puntos base ya son la fuente buena —la base local, por ejemplo— y no
-- puede redondear a la baja un valor que ya estaba bien puesto.

UPDATE `work_items`
   SET `progress_bp` = ROUND(`progress_pct` * 10000)
 WHERE `progress_bp` = 0
   AND `progress_pct` > 0;

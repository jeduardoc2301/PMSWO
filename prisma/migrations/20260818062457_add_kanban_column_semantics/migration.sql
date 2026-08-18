-- AlterTable
ALTER TABLE `kanban_columns` ADD COLUMN `is_done` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `is_initial` BOOLEAN NOT NULL DEFAULT false;

-- Relleno desde lo que las columnas ya significaban por su `column_type`.
--
-- Sin esto, cada columna existente quedaría sin semántica: el tablero trataría «Done» como una
-- columna intermedia cualquiera y mover una tarjeta ahí no pondría el avance al cien por cien.
UPDATE `kanban_columns` SET `is_initial` = TRUE  WHERE `column_type` = 'BACKLOG';
UPDATE `kanban_columns` SET `is_done`    = TRUE  WHERE `column_type` = 'DONE';

-- Un proyecto cuyas columnas no siguen esa nomenclatura se queda sin columna inicial, y entonces
-- capturar cero avance no sabría a dónde mover. La de menor orden es la inicial por definición.
UPDATE `kanban_columns` c
JOIN (
  SELECT `project_id`, MIN(`order`) AS `primera`
  FROM `kanban_columns`
  GROUP BY `project_id`
) m ON m.`project_id` = c.`project_id` AND m.`primera` = c.`order`
SET c.`is_initial` = TRUE
WHERE c.`project_id` NOT IN (SELECT * FROM (SELECT `project_id` FROM `kanban_columns` WHERE `is_initial` = TRUE) x);

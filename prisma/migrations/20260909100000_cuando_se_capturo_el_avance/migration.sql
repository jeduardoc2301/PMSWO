-- Cuándo se capturó el avance de cada línea por última vez.
--
-- Nula para todo lo que ya existe: no hay forma honesta de reconstruirla, porque la bitácora
-- cubría el 1 % de las capturas. Se irá llenando a partir de la siguiente vez que alguien toque
-- un porcentaje. Aditiva y reversible con DROP COLUMN.
ALTER TABLE `work_items` ADD COLUMN `progress_changed_at` DATETIME(3) NULL;

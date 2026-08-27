-- Configuración de la exportación a Excel, por proyecto.
--
-- Todas las columnas admiten nulo y la fila entera es opcional: un proyecto sin configurar exporta
-- bien, con los contenedores sacados de la jerarquía real. Por eso esta migración no necesita
-- rellenar nada para los proyectos que ya existen.
CREATE TABLE `project_export_configs` (
  `id` CHAR(36) NOT NULL,
  `project_id` CHAR(36) NOT NULL,
  `role_map` JSON NULL,
  `header_description` TEXT NULL,
  `header_warnings` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `project_export_configs_project_id_key`(`project_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `project_export_configs`
  ADD CONSTRAINT `project_export_configs_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

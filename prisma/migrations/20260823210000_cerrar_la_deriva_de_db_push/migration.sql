-- La deriva que dejó `db push`.
--
-- El esquema declaraba estas columnas y estas dos tablas, y **ninguna migración las creaba**: se
-- pusieron en su día sincronizando el esquema a mano, que no deja rastro en `migrations/`. Mientras
-- todo el mundo trabajaba sobre la misma base local no se notaba; en cuanto hay que construir una
-- base desde las migraciones —que es lo que hace un despliegue— salen las tablas sin ellas y la
-- aplicación no arranca.
--
-- Medido contra producción antes de escribir esto: de todo lo de abajo, producción no tenía nada.
--
-- El contenido NO está escrito a mano: lo generó
--   prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma
-- que es la única forma de no olvidarse de un índice o de una clave foránea. De hecho encontró dos
-- cosas que la revisión a ojo se había saltado: `work_items.progress_bp` y el ancho de
-- `constraint_type`.
--
-- En la base local todo esto YA está, así que allí esta migración se marca como aplicada con
-- `prisma migrate resolve --applied`, que es exactamente para lo que sirve.
-- AlterTable
ALTER TABLE `project_calendars` ADD COLUMN `turnos` JSON NULL;

-- AlterTable
ALTER TABLE `projects` ADD COLUMN `minutos_por_jornada` INTEGER NOT NULL DEFAULT 480,
    ADD COLUMN `progress_rollup` VARCHAR(20) NOT NULL DEFAULT 'DURACION';

-- AlterTable
ALTER TABLE `work_items` ADD COLUMN `progress_bp` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `start_minute` INTEGER NULL,
    MODIFY `constraint_type` VARCHAR(24) NULL;

-- CreateTable
CREATE TABLE `custom_fields` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `project_id` CHAR(36) NULL,
    `name` VARCHAR(60) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `options` JSON NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `custom_fields_project_id_idx`(`project_id`),
    INDEX `custom_fields_organization_id_idx`(`organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `custom_field_values` (
    `id` CHAR(36) NOT NULL,
    `field_id` CHAR(36) NOT NULL,
    `work_item_id` CHAR(36) NOT NULL,
    `value` JSON NOT NULL,

    INDEX `custom_field_values_work_item_id_idx`(`work_item_id`),
    UNIQUE INDEX `custom_field_values_field_id_work_item_id_key`(`field_id`, `work_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `custom_fields` ADD CONSTRAINT `custom_fields_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_fields` ADD CONSTRAINT `custom_fields_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_field_values` ADD CONSTRAINT `custom_field_values_field_id_fkey` FOREIGN KEY (`field_id`) REFERENCES `custom_fields`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `custom_field_values` ADD CONSTRAINT `custom_field_values_work_item_id_fkey` FOREIGN KEY (`work_item_id`) REFERENCES `work_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


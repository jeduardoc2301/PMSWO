-- AlterTable
ALTER TABLE `work_items` ADD COLUMN `source_file` VARCHAR(191) NULL,
    ADD COLUMN `source_id` VARCHAR(191) NULL,
    ADD COLUMN `source_row` INTEGER NULL,
    ADD COLUMN `source_sheet` VARCHAR(191) NULL,
    ADD COLUMN `source_version` VARCHAR(191) NULL,
    ADD COLUMN `traceability` TEXT NULL;

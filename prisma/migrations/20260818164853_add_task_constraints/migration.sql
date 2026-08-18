-- AlterTable
ALTER TABLE `work_items` ADD COLUMN `constraint_date` DATE NULL,
    ADD COLUMN `constraint_type` VARCHAR(20) NULL;

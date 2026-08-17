-- AlterTable
ALTER TABLE `projects` ADD COLUMN `progress_cutoff_date` DATE NULL;

-- AlterTable
ALTER TABLE `work_items` ADD COLUMN `responsible_name` VARCHAR(191) NULL;

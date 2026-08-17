-- AlterTable
ALTER TABLE `work_items` ADD COLUMN `parent_id` CHAR(36) NULL,
    ADD COLUMN `progress_pct` DOUBLE NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `work_items_parent_id_idx` ON `work_items`(`parent_id`);

-- AddForeignKey
ALTER TABLE `work_items` ADD CONSTRAINT `work_items_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `work_items`(`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AlterTable
ALTER TABLE `work_items` ADD COLUMN `client_owner` VARCHAR(191) NULL,
    ADD COLUMN `due_date` DATE NULL,
    ADD COLUMN `kind` VARCHAR(20) NOT NULL DEFAULT 'ACTIVIDAD',
    ADD COLUMN `party` VARCHAR(10) NOT NULL DEFAULT 'PROVEEDOR';

-- CreateIndex
CREATE INDEX `work_items_organization_id_party_due_date_idx` ON `work_items`(`organization_id`, `party`, `due_date`);

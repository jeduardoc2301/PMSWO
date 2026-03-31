/*
  Warnings:

  - You are about to alter the column `phase` on the `work_items` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(191)`.

*/
-- DropForeignKey
ALTER TABLE `template_activities` DROP FOREIGN KEY `template_activities_phase_id_fkey`;

-- DropForeignKey
ALTER TABLE `template_categories` DROP FOREIGN KEY `template_categories_organization_id_fkey`;

-- DropForeignKey
ALTER TABLE `template_phases` DROP FOREIGN KEY `template_phases_template_id_fkey`;

-- DropForeignKey
ALTER TABLE `template_usage` DROP FOREIGN KEY `template_usage_project_id_fkey`;

-- DropForeignKey
ALTER TABLE `template_usage` DROP FOREIGN KEY `template_usage_template_id_fkey`;

-- DropForeignKey
ALTER TABLE `template_usage` DROP FOREIGN KEY `template_usage_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `templates` DROP FOREIGN KEY `templates_category_id_fkey`;

-- DropForeignKey
ALTER TABLE `templates` DROP FOREIGN KEY `templates_organization_id_fkey`;

-- AlterTable
ALTER TABLE `template_activities` MODIFY `priority` VARCHAR(191) NOT NULL,
    MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `template_categories` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `template_phases` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `template_usage` MODIFY `applied_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `templates` MODIFY `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `updated_at` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `work_items` MODIFY `phase` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `templates` ADD CONSTRAINT `templates_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `templates` ADD CONSTRAINT `templates_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `template_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_categories` ADD CONSTRAINT `template_categories_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_phases` ADD CONSTRAINT `template_phases_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_activities` ADD CONSTRAINT `template_activities_phase_id_fkey` FOREIGN KEY (`phase_id`) REFERENCES `template_phases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_usage` ADD CONSTRAINT `template_usage_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_usage` ADD CONSTRAINT `template_usage_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `template_usage` ADD CONSTRAINT `template_usage_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `template_activities` RENAME INDEX `idx_phase` TO `template_activities_phase_id_idx`;

-- RenameIndex
ALTER TABLE `template_activities` RENAME INDEX `unique_phase_order` TO `template_activities_phase_id_order_key`;

-- RenameIndex
ALTER TABLE `template_categories` RENAME INDEX `idx_org` TO `template_categories_organization_id_idx`;

-- RenameIndex
ALTER TABLE `template_categories` RENAME INDEX `unique_org_category` TO `template_categories_organization_id_name_key`;

-- RenameIndex
ALTER TABLE `template_phases` RENAME INDEX `idx_template` TO `template_phases_template_id_idx`;

-- RenameIndex
ALTER TABLE `template_phases` RENAME INDEX `unique_template_order` TO `template_phases_template_id_order_key`;

-- RenameIndex
ALTER TABLE `template_usage` RENAME INDEX `idx_project` TO `template_usage_project_id_idx`;

-- RenameIndex
ALTER TABLE `template_usage` RENAME INDEX `idx_template` TO `template_usage_template_id_idx`;

-- RenameIndex
ALTER TABLE `template_usage` RENAME INDEX `idx_user` TO `template_usage_user_id_idx`;

-- RenameIndex
ALTER TABLE `templates` RENAME INDEX `idx_category` TO `templates_category_id_idx`;

-- RenameIndex
ALTER TABLE `templates` RENAME INDEX `idx_org` TO `templates_organization_id_idx`;

-- RenameIndex
ALTER TABLE `templates` RENAME INDEX `idx_org_category` TO `templates_organization_id_category_id_idx`;

-- RenameIndex
ALTER TABLE `work_items` RENAME INDEX `idx_work_items_phase` TO `work_items_phase_idx`;

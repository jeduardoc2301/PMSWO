-- CreateTable
CREATE TABLE `baselines` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `project_id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `created_by_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `baselines_project_id_created_at_idx`(`project_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `baseline_items` (
    `id` CHAR(36) NOT NULL,
    `baseline_id` CHAR(36) NOT NULL,
    `work_item_id` CHAR(36) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `duration_days` INTEGER NOT NULL,
    `estimated_hours` INTEGER NULL,
    `progress_bp` INTEGER NOT NULL,

    INDEX `baseline_items_work_item_id_idx`(`work_item_id`),
    UNIQUE INDEX `baseline_items_baseline_id_work_item_id_key`(`baseline_id`, `work_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `baselines` ADD CONSTRAINT `baselines_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `baseline_items` ADD CONSTRAINT `baseline_items_baseline_id_fkey` FOREIGN KEY (`baseline_id`) REFERENCES `baselines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `baseline_items` ADD CONSTRAINT `baseline_items_work_item_id_fkey` FOREIGN KEY (`work_item_id`) REFERENCES `work_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

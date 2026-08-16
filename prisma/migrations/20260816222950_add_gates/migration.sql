-- CreateTable
CREATE TABLE `gates` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `project_id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `fallback_plan` TEXT NOT NULL,
    `closing_milestone_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `gates_organization_id_project_id_idx`(`organization_id`, `project_id`),
    INDEX `gates_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gate_conditions` (
    `id` CHAR(36) NOT NULL,
    `gate_id` CHAR(36) NOT NULL,
    `description` TEXT NOT NULL,
    `owner` VARCHAR(191) NOT NULL,
    `party` VARCHAR(10) NOT NULL DEFAULT 'CLIENTE',
    `due_date` DATE NOT NULL,
    `met_on` DATE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `gate_conditions_gate_id_idx`(`gate_id`),
    INDEX `gate_conditions_due_date_idx`(`due_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gate_unlocks` (
    `id` CHAR(36) NOT NULL,
    `gate_id` CHAR(36) NOT NULL,
    `work_item_id` CHAR(36) NOT NULL,

    INDEX `gate_unlocks_work_item_id_idx`(`work_item_id`),
    UNIQUE INDEX `gate_unlocks_gate_id_work_item_id_key`(`gate_id`, `work_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `gates` ADD CONSTRAINT `gates_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gates` ADD CONSTRAINT `gates_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gates` ADD CONSTRAINT `gates_closing_milestone_id_fkey` FOREIGN KEY (`closing_milestone_id`) REFERENCES `work_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gate_conditions` ADD CONSTRAINT `gate_conditions_gate_id_fkey` FOREIGN KEY (`gate_id`) REFERENCES `gates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gate_unlocks` ADD CONSTRAINT `gate_unlocks_gate_id_fkey` FOREIGN KEY (`gate_id`) REFERENCES `gates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gate_unlocks` ADD CONSTRAINT `gate_unlocks_work_item_id_fkey` FOREIGN KEY (`work_item_id`) REFERENCES `work_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

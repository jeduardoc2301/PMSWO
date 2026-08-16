-- AlterTable
ALTER TABLE `projects` ADD COLUMN `project_manager_id` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `avatar` LONGTEXT NULL;

-- CreateTable
CREATE TABLE `portfolio_health_snapshots` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `health_score` INTEGER NOT NULL,
    `on_track` INTEGER NOT NULL,
    `at_risk` INTEGER NOT NULL,
    `critical_blockers` INTEGER NOT NULL,
    `completion_rate` DOUBLE NOT NULL,
    `in_progress` INTEGER NOT NULL,
    `completed` INTEGER NOT NULL,

    INDEX `portfolio_health_snapshots_organization_id_date_idx`(`organization_id`, `date`),
    UNIQUE INDEX `portfolio_health_snapshots_organization_id_date_key`(`organization_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_dependencies` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `project_id` CHAR(36) NOT NULL,
    `predecessor_id` CHAR(36) NOT NULL,
    `successor_id` CHAR(36) NOT NULL,
    `link_type` VARCHAR(2) NOT NULL DEFAULT 'FS',
    `lag_days` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `task_dependencies_organization_id_project_id_idx`(`organization_id`, `project_id`),
    INDEX `task_dependencies_project_id_idx`(`project_id`),
    INDEX `task_dependencies_successor_id_idx`(`successor_id`),
    UNIQUE INDEX `task_dependencies_predecessor_id_successor_id_key`(`predecessor_id`, `successor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `projects_project_manager_id_idx` ON `projects`(`project_manager_id`);

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_project_manager_id_fkey` FOREIGN KEY (`project_manager_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `portfolio_health_snapshots` ADD CONSTRAINT `portfolio_health_snapshots_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_dependencies` ADD CONSTRAINT `task_dependencies_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_dependencies` ADD CONSTRAINT `task_dependencies_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_dependencies` ADD CONSTRAINT `task_dependencies_predecessor_id_fkey` FOREIGN KEY (`predecessor_id`) REFERENCES `work_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_dependencies` ADD CONSTRAINT `task_dependencies_successor_id_fkey` FOREIGN KEY (`successor_id`) REFERENCES `work_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE `view_preferences` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `project_id` CHAR(36) NOT NULL,
    `view` VARCHAR(20) NOT NULL,
    `settings` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `view_preferences_organization_id_project_id_idx`(`organization_id`, `project_id`),
    UNIQUE INDEX `view_preferences_user_id_project_id_view_key`(`user_id`, `project_id`, `view`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `view_preferences` ADD CONSTRAINT `view_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `view_preferences` ADD CONSTRAINT `view_preferences_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

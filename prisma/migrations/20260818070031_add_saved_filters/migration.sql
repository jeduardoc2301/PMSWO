-- CreateTable
CREATE TABLE `saved_filters` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `project_id` CHAR(36) NOT NULL,
    `created_by_id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `expression` JSON NOT NULL,
    `is_shared` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `saved_filters_project_id_is_shared_idx`(`project_id`, `is_shared`),
    INDEX `saved_filters_created_by_id_idx`(`created_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `saved_filters` ADD CONSTRAINT `saved_filters_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

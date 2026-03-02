-- CreateIndex
CREATE INDEX `agreements_status_idx` ON `agreements`(`status`);

-- CreateIndex
CREATE INDEX `ai_analysis_cache_expires_at_idx` ON `ai_analysis_cache`(`expires_at`);

-- CreateIndex
CREATE INDEX `blockers_organization_id_resolved_at_idx` ON `blockers`(`organization_id`, `resolved_at`);

-- CreateIndex
CREATE INDEX `risks_organization_id_status_risk_level_idx` ON `risks`(`organization_id`, `status`, `risk_level`);

-- CreateIndex
CREATE INDEX `work_items_organization_id_status_priority_idx` ON `work_items`(`organization_id`, `status`, `priority`);

-- CreateIndex
CREATE INDEX `work_items_estimated_end_date_idx` ON `work_items`(`estimated_end_date`);

-- AddForeignKey
ALTER TABLE `agreement_notes` ADD CONSTRAINT `agreement_notes_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

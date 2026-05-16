-- Migration: add project_manager_id to projects table
ALTER TABLE projects ADD COLUMN project_manager_id CHAR(36) NULL AFTER owner_id;
ALTER TABLE projects ADD INDEX idx_projects_pm_id (project_manager_id);

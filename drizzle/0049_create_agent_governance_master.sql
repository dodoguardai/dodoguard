-- Agent governance master data (departments, business systems, scenes, owners)

CREATE TABLE IF NOT EXISTS `agent_gov_departments` (
  `id` VARCHAR(36) PRIMARY KEY,
  `organization_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `dept_type` VARCHAR(64),
  `lead` VARCHAR(255),
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,

  UNIQUE KEY `agent_gov_departments_org_name_uidx` (`organization_id`, `name`),
  KEY `agent_gov_departments_org_idx` (`organization_id`),
  CONSTRAINT `agent_gov_departments_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `agent_gov_business_scenes` (
  `id` VARCHAR(36) PRIMARY KEY,
  `organization_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,

  UNIQUE KEY `agent_gov_business_scenes_org_name_uidx` (`organization_id`, `name`),
  KEY `agent_gov_business_scenes_org_idx` (`organization_id`),
  CONSTRAINT `agent_gov_business_scenes_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `agent_gov_business_systems` (
  `id` VARCHAR(36) PRIMARY KEY,
  `organization_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `department_name` VARCHAR(255),
  `scene_name` VARCHAR(255),
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,

  UNIQUE KEY `agent_gov_business_systems_org_name_uidx` (`organization_id`, `name`),
  KEY `agent_gov_business_systems_org_idx` (`organization_id`),
  CONSTRAINT `agent_gov_business_systems_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `agent_gov_owners` (
  `id` VARCHAR(36) PRIMARY KEY,
  `organization_id` VARCHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `owner_type` VARCHAR(32) NOT NULL,
  `department_name` VARCHAR(255),
  `email` VARCHAR(255),
  `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,

  UNIQUE KEY `agent_gov_owners_org_name_type_uidx` (`organization_id`, `name`, `owner_type`),
  KEY `agent_gov_owners_org_idx` (`organization_id`),
  KEY `agent_gov_owners_org_type_idx` (`organization_id`, `owner_type`),
  CONSTRAINT `agent_gov_owners_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

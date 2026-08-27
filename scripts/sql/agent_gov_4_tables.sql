-- Extracted agent governance ownership tables
-- Source: scripts/sql/zhian0628-20260709-185006.sql
-- Tables: agent_gov_business_scenes, agent_gov_business_systems, agent_gov_departments, agent_gov_owners
-- WARNING: This drops and recreates these 4 tables. Back up customer DB before running.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;
-- Table structure for table `agent_gov_business_scenes`
--

DROP TABLE IF EXISTS `agent_gov_business_scenes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agent_gov_business_scenes` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organization_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `agent_gov_business_scenes_org_name_uidx` (`organization_id`,`name`),
  KEY `agent_gov_business_scenes_org_idx` (`organization_id`),
  CONSTRAINT `agent_gov_business_scenes_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agent_gov_business_scenes`
--

LOCK TABLES `agent_gov_business_scenes` WRITE;
/*!40000 ALTER TABLE `agent_gov_business_scenes` DISABLE KEYS */;
INSERT INTO `agent_gov_business_scenes` VALUES ('05d682b7-f302-4bd0-9885-ce053d905b94','56cca32d-e6a1-47f3-9512-a59b6d878598','客服','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('07183d3e-8e0f-44a5-8903-c3db447deec5','56cca32d-e6a1-47f3-9512-a59b6d878598','政务','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('780664f6-9dcb-4f32-ba41-5372ab454be2','56cca32d-e6a1-47f3-9512-a59b6d878598','数据分析','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('bc5d9992-6fbd-45c5-ac9e-1e7a7cee9ab7','56cca32d-e6a1-47f3-9512-a59b6d878598','法务','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('bd36ac94-fc3b-4617-abf3-f0da288c3ddc','56cca32d-e6a1-47f3-9512-a59b6d878598','办公','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('f95cae94-1a96-48c8-a57a-89ca44718e86','56cca32d-e6a1-47f3-9512-a59b6d878598','金融','active','2026-07-06 10:02:24','2026-07-06 10:02:24');
/*!40000 ALTER TABLE `agent_gov_business_scenes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `agent_gov_business_systems`
--

DROP TABLE IF EXISTS `agent_gov_business_systems`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agent_gov_business_systems` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organization_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scene_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `agent_gov_business_systems_org_name_uidx` (`organization_id`,`name`),
  KEY `agent_gov_business_systems_org_idx` (`organization_id`),
  CONSTRAINT `agent_gov_business_systems_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agent_gov_business_systems`
--

LOCK TABLES `agent_gov_business_systems` WRITE;
/*!40000 ALTER TABLE `agent_gov_business_systems` DISABLE KEYS */;
INSERT INTO `agent_gov_business_systems` VALUES ('3364684e-aa35-48c8-8212-10fb4aca9aac','56cca32d-e6a1-47f3-9512-a59b6d878598','研发效能平台','研发平台部','办公','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('36b0ea5e-1efa-4a84-8f66-76aaafe475a5','56cca32d-e6a1-47f3-9512-a59b6d878598','政务办事大厅','政务事业部','政务','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('431a7c27-6197-4eec-a7c3-6cc427017261','56cca32d-e6a1-47f3-9512-a59b6d878598','运维监控平台','信息技术部','办公','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('47627feb-f0d6-4cba-b059-5a45c442613d','56cca32d-e6a1-47f3-9512-a59b6d878598','财富管理 App','财富管理部','金融','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('c9c5e358-f013-44bb-9aea-65a7e5a86b9a','56cca32d-e6a1-47f3-9512-a59b6d878598','企业 BI 平台','数据平台部','数据分析','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('cc25d86c-82df-4937-808b-6a8104c85171','56cca32d-e6a1-47f3-9512-a59b6d878598','营销自动化平台','市场部','办公','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('dcb5ed44-c264-429e-aef7-2990ccdcf33b','56cca32d-e6a1-47f3-9512-a59b6d878598','智能客服平台','客户服务部','客服','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('ddf9a844-e977-4aed-8325-74594c7a40b9','56cca32d-e6a1-47f3-9512-a59b6d878598','官网智能客服','品牌运营部','客服','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('f3752acf-30df-4a27-aa06-2265b6938499','56cca32d-e6a1-47f3-9512-a59b6d878598','合同管理系统','法务部','法务','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('fb5d0d0f-6876-4eea-89c8-51f1101e5d58','56cca32d-e6a1-47f3-9512-a59b6d878598','员工服务平台','人力资源部','办公','active','2026-07-06 10:02:24','2026-07-06 10:02:24');
/*!40000 ALTER TABLE `agent_gov_business_systems` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `agent_gov_departments`
--

DROP TABLE IF EXISTS `agent_gov_departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agent_gov_departments` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organization_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dept_type` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lead` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `agent_gov_departments_org_name_uidx` (`organization_id`,`name`),
  KEY `agent_gov_departments_org_idx` (`organization_id`),
  CONSTRAINT `agent_gov_departments_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agent_gov_departments`
--

LOCK TABLES `agent_gov_departments` WRITE;
/*!40000 ALTER TABLE `agent_gov_departments` DISABLE KEYS */;
INSERT INTO `agent_gov_departments` VALUES ('27e5ecac-8e58-420b-9c22-306198835c59','56cca32d-e6a1-47f3-9512-a59b6d878598','品牌运营部','业务部门','林经理','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('35400441-e812-4842-8683-0b2db49bba21','56cca32d-e6a1-47f3-9512-a59b6d878598','财富管理部','业务部门','李总监','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('5556c86a-17ff-4fca-80d3-b131bd285e18','56cca32d-e6a1-47f3-9512-a59b6d878598','研发平台部','技术部门','吴总监','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('5647fbe8-8f6c-4a8d-b8f7-e9995c73d4dc','56cca32d-e6a1-47f3-9512-a59b6d878598','法务部','业务部门','刘律师','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('5a473391-b91d-4bb5-97cf-63c0f91c67ac','56cca32d-e6a1-47f3-9512-a59b6d878598','政务事业部','业务部门','周主任','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('824b61a3-67e8-4066-ba1b-acb8d152fb33','56cca32d-e6a1-47f3-9512-a59b6d878598','数据平台部','技术部门','钱总监','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('a547233a-d0a5-48c5-827b-78a1cae9e551','56cca32d-e6a1-47f3-9512-a59b6d878598','人力资源部','职能部门','郑经理','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('a820466e-ced2-495b-bc2f-022e4c2f76b2','56cca32d-e6a1-47f3-9512-a59b6d878598','信息技术部','技术部门','冯经理','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('e069fee1-4626-46ba-980b-695935113159','56cca32d-e6a1-47f3-9512-a59b6d878598','市场部','业务部门','孙经理','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('e3ef9819-adae-41a3-9766-f5f5a86ac50f','56cca32d-e6a1-47f3-9512-a59b6d878598','客户服务部','业务部门','张经理','active','2026-07-06 10:02:24','2026-07-06 10:02:24');
/*!40000 ALTER TABLE `agent_gov_departments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `agent_gov_owners`
--

DROP TABLE IF EXISTS `agent_gov_owners`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agent_gov_owners` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `organization_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `owner_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `agent_gov_owners_org_name_type_uidx` (`organization_id`,`name`,`owner_type`),
  KEY `agent_gov_owners_org_idx` (`organization_id`),
  KEY `agent_gov_owners_org_type_idx` (`organization_id`,`owner_type`),
  CONSTRAINT `agent_gov_owners_org_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `agent_gov_owners`
--

LOCK TABLES `agent_gov_owners` WRITE;
/*!40000 ALTER TABLE `agent_gov_owners` DISABLE KEYS */;
INSERT INTO `agent_gov_owners` VALUES ('006f0e9c-7710-40e1-b7f3-ddf93e997f19','56cca32d-e6a1-47f3-9512-a59b6d878598','褚工','ops','客户服务部','chu@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('053e9b8a-8bcf-48b1-9753-c1af45a6384e','56cca32d-e6a1-47f3-9512-a59b6d878598','马工','developer','人力资源部','ma@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('070e5324-afd3-4dbc-ad39-82cb9851eb8a','56cca32d-e6a1-47f3-9512-a59b6d878598','赵工','developer','客户服务部','zhao@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('0adf0404-a32d-442c-8cc3-323c609ccdd9','56cca32d-e6a1-47f3-9512-a59b6d878598','周主任','business','政务事业部','zhou@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('14d38c7c-46f7-40ab-8784-06b56b6a83cd','56cca32d-e6a1-47f3-9512-a59b6d878598','张经理','business','客户服务部','zhang@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('1e7e06e7-08f7-4148-9983-b75fc296bf4e','56cca32d-e6a1-47f3-9512-a59b6d878598','刘律师','business','法务部','liu@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('36d0079a-4d66-44cb-bf28-b92df6822cd5','56cca32d-e6a1-47f3-9512-a59b6d878598','孙工','developer','法务部','sun@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('59724827-be69-405c-9318-2eb199195ed7','56cca32d-e6a1-47f3-9512-a59b6d878598','陈工','developer','政务事业部','chen@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('66b538b0-5875-4f57-a641-a1edadffb4e0','56cca32d-e6a1-47f3-9512-a59b6d878598','Admin User','security','安全平台部','sec@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('c4dd1dd5-dc47-496b-9551-620f5022a863','56cca32d-e6a1-47f3-9512-a59b6d878598','罗工','ops','信息技术部','luo@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('d5f902c4-07e5-4fcd-b2b1-5a99c88b3de4','56cca32d-e6a1-47f3-9512-a59b6d878598','胡工','ops','数据平台部','hu@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('d5fd64b5-c7fc-4e5e-a6b4-5f23f4964201','56cca32d-e6a1-47f3-9512-a59b6d878598','李经理','business','财富管理部','li@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('f31483ce-489c-4a87-bfbe-0ffe7714b7af','56cca32d-e6a1-47f3-9512-a59b6d878598','吴总监','business','研发平台部','wu@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('f7423488-44bb-447d-b669-f25593b0264e','56cca32d-e6a1-47f3-9512-a59b6d878598','李工','developer','研发平台部','ligong@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24'),('fa953ab8-534e-4f1f-a831-c80eca357092','56cca32d-e6a1-47f3-9512-a59b6d878598','王工','developer','财富管理部','wang@corp.com','active','2026-07-06 10:02:24','2026-07-06 10:02:24');
/*!40000 ALTER TABLE `agent_gov_owners` ENABLE KEYS */;
UNLOCK TABLES;

--
SET FOREIGN_KEY_CHECKS=1;

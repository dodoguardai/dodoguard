/**
 * Agent governance master data (departments, business systems, scenes, owners).
 */

import { and, eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { db, getDbType } from '../database';
import logger from '../logger';

export type GovStatus = 'active' | 'inactive';
export type OwnerType = 'business' | 'developer' | 'security' | 'ops';

function getTables() {
  const module =
    getDbType() === 'mysql'
      ? require('../database/tables-mysql')
      : require('../database/tables-enterprise');
  return {
    departments: module.agentGovDepartmentsTable,
    businessScenes: module.agentGovBusinessScenesTable,
    businessSystems: module.agentGovBusinessSystemsTable,
    owners: module.agentGovOwnersTable,
    agentAssets: module.agentAssetsTable,
    assetOwnerships: module.assetOwnershipsTable,
  };
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date(value as number).toISOString();
}

export interface AgentGovDepartmentDto {
  id: string;
  organizationId: string;
  name: string;
  deptType: string | null;
  lead: string | null;
  status: GovStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentGovBusinessSceneDto {
  id: string;
  organizationId: string;
  name: string;
  status: GovStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentGovBusinessSystemDto {
  id: string;
  organizationId: string;
  name: string;
  departmentName: string | null;
  sceneName: string | null;
  status: GovStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentGovOwnerDto {
  id: string;
  organizationId: string;
  name: string;
  ownerType: OwnerType;
  departmentName: string | null;
  email: string | null;
  status: GovStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgentGovernanceMasterDto {
  departments: AgentGovDepartmentDto[];
  businessScenes: AgentGovBusinessSceneDto[];
  businessSystems: AgentGovBusinessSystemDto[];
  owners: AgentGovOwnerDto[];
}

const SEED_DEPARTMENTS: Array<{ name: string; deptType: string; lead: string }> = [
  { name: '客户服务部', deptType: '业务部门', lead: '张经理' },
  { name: '财富管理部', deptType: '业务部门', lead: '李总监' },
  { name: '政务事业部', deptType: '业务部门', lead: '周主任' },
  { name: '法务部', deptType: '业务部门', lead: '刘律师' },
  { name: '研发平台部', deptType: '技术部门', lead: '吴总监' },
  { name: '数据平台部', deptType: '技术部门', lead: '钱总监' },
  { name: '人力资源部', deptType: '职能部门', lead: '郑经理' },
  { name: '信息技术部', deptType: '技术部门', lead: '冯经理' },
  { name: '市场部', deptType: '业务部门', lead: '孙经理' },
  { name: '品牌运营部', deptType: '业务部门', lead: '林经理' },
];

const SEED_SCENES = ['金融', '客服', '政务', '办公', '法务', '数据分析'];

const SEED_BUSINESS_SYSTEMS: Array<{ name: string; departmentName: string; sceneName: string }> = [
  { name: '智能客服平台', departmentName: '客户服务部', sceneName: '客服' },
  { name: '财富管理 App', departmentName: '财富管理部', sceneName: '金融' },
  { name: '政务办事大厅', departmentName: '政务事业部', sceneName: '政务' },
  { name: '合同管理系统', departmentName: '法务部', sceneName: '法务' },
  { name: '研发效能平台', departmentName: '研发平台部', sceneName: '办公' },
  { name: '企业 BI 平台', departmentName: '数据平台部', sceneName: '数据分析' },
  { name: '员工服务平台', departmentName: '人力资源部', sceneName: '办公' },
  { name: '运维监控平台', departmentName: '信息技术部', sceneName: '办公' },
  { name: '营销自动化平台', departmentName: '市场部', sceneName: '办公' },
  { name: '官网智能客服', departmentName: '品牌运营部', sceneName: '客服' },
];

const SEED_OWNERS: Array<{
  name: string;
  ownerType: OwnerType;
  departmentName: string;
  email: string;
}> = [
  { name: '张经理', ownerType: 'business', departmentName: '客户服务部', email: 'zhang@corp.com' },
  { name: '李经理', ownerType: 'business', departmentName: '财富管理部', email: 'li@corp.com' },
  { name: '周主任', ownerType: 'business', departmentName: '政务事业部', email: 'zhou@corp.com' },
  { name: '刘律师', ownerType: 'business', departmentName: '法务部', email: 'liu@corp.com' },
  { name: '吴总监', ownerType: 'business', departmentName: '研发平台部', email: 'wu@corp.com' },
  { name: '赵工', ownerType: 'developer', departmentName: '客户服务部', email: 'zhao@corp.com' },
  { name: '王工', ownerType: 'developer', departmentName: '财富管理部', email: 'wang@corp.com' },
  { name: '陈工', ownerType: 'developer', departmentName: '政务事业部', email: 'chen@corp.com' },
  { name: '李工', ownerType: 'developer', departmentName: '研发平台部', email: 'ligong@corp.com' },
  { name: '孙工', ownerType: 'developer', departmentName: '法务部', email: 'sun@corp.com' },
  { name: '马工', ownerType: 'developer', departmentName: '人力资源部', email: 'ma@corp.com' },
  {
    name: 'Admin User',
    ownerType: 'security',
    departmentName: '安全平台部',
    email: 'sec@corp.com',
  },
  { name: '罗工', ownerType: 'ops', departmentName: '信息技术部', email: 'luo@corp.com' },
  { name: '胡工', ownerType: 'ops', departmentName: '数据平台部', email: 'hu@corp.com' },
  { name: '褚工', ownerType: 'ops', departmentName: '客户服务部', email: 'chu@corp.com' },
];

function mapDepartment(row: Record<string, unknown>): AgentGovDepartmentDto {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    name: String(row.name),
    deptType: row.deptType ? String(row.deptType) : null,
    lead: row.lead ? String(row.lead) : null,
    status: (row.status as GovStatus) || 'active',
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapScene(row: Record<string, unknown>): AgentGovBusinessSceneDto {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    name: String(row.name),
    status: (row.status as GovStatus) || 'active',
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapBusinessSystem(row: Record<string, unknown>): AgentGovBusinessSystemDto {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    name: String(row.name),
    departmentName: row.departmentName ? String(row.departmentName) : null,
    sceneName: row.sceneName ? String(row.sceneName) : null,
    status: (row.status as GovStatus) || 'active',
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapOwner(row: Record<string, unknown>): AgentGovOwnerDto {
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    name: String(row.name),
    ownerType: row.ownerType as OwnerType,
    departmentName: row.departmentName ? String(row.departmentName) : null,
    email: row.email ? String(row.email) : null,
    status: (row.status as GovStatus) || 'active',
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export class AgentGovernanceService {
  private async hasAnyData(organizationId: string): Promise<boolean> {
    const { departments } = getTables();
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(departments)
      .where(eq(departments.organizationId, organizationId));
    return Number(row?.count ?? 0) > 0;
  }

  async ensureSeed(organizationId: string): Promise<void> {
    if (await this.hasAnyData(organizationId)) {
      return;
    }

    const { departments, businessScenes, businessSystems, owners } = getTables();
    const dbType = getDbType();
    const now = new Date();

    for (const item of SEED_DEPARTMENTS) {
      const values = {
        organizationId,
        name: item.name,
        deptType: item.deptType,
        lead: item.lead,
        status: 'active' as const,
        updatedAt: now,
        ...(dbType === 'mysql' ? { id: uuidv4(), createdAt: now } : { createdAt: now }),
      };
      await db.insert(departments).values(values as any);
    }

    for (const name of SEED_SCENES) {
      const values = {
        organizationId,
        name,
        status: 'active' as const,
        updatedAt: now,
        ...(dbType === 'mysql' ? { id: uuidv4(), createdAt: now } : { createdAt: now }),
      };
      await db.insert(businessScenes).values(values as any);
    }

    for (const item of SEED_BUSINESS_SYSTEMS) {
      const values = {
        organizationId,
        name: item.name,
        departmentName: item.departmentName,
        sceneName: item.sceneName,
        status: 'active' as const,
        updatedAt: now,
        ...(dbType === 'mysql' ? { id: uuidv4(), createdAt: now } : { createdAt: now }),
      };
      await db.insert(businessSystems).values(values as any);
    }

    for (const item of SEED_OWNERS) {
      const values = {
        organizationId,
        name: item.name,
        ownerType: item.ownerType,
        departmentName: item.departmentName,
        email: item.email,
        status: 'active' as const,
        updatedAt: now,
        ...(dbType === 'mysql' ? { id: uuidv4(), createdAt: now } : { createdAt: now }),
      };
      await db.insert(owners).values(values as any);
    }

    logger.info('Agent governance master data seeded', { organizationId });
  }

  async getMaster(organizationId: string): Promise<AgentGovernanceMasterDto> {
    await this.ensureSeed(organizationId);
    const { departments, businessScenes, businessSystems, owners } = getTables();

    const [deptRows, sceneRows, bizRows, ownerRows] = await Promise.all([
      db.select().from(departments).where(eq(departments.organizationId, organizationId)),
      db.select().from(businessScenes).where(eq(businessScenes.organizationId, organizationId)),
      db.select().from(businessSystems).where(eq(businessSystems.organizationId, organizationId)),
      db.select().from(owners).where(eq(owners.organizationId, organizationId)),
    ]);

    return {
      departments: deptRows.map((r) => mapDepartment(r as Record<string, unknown>)),
      businessScenes: sceneRows.map((r) => mapScene(r as Record<string, unknown>)),
      businessSystems: bizRows.map((r) => mapBusinessSystem(r as Record<string, unknown>)),
      owners: ownerRows.map((r) => mapOwner(r as Record<string, unknown>)),
    };
  }

  async createDepartment(
    organizationId: string,
    data: { name: string; deptType?: string; lead?: string; status?: GovStatus },
  ): Promise<AgentGovDepartmentDto> {
    const { departments } = getTables();
    const dbType = getDbType();
    const now = new Date();
    const values = {
      organizationId,
      name: data.name,
      deptType: data.deptType ?? null,
      lead: data.lead ?? null,
      status: data.status ?? 'active',
      updatedAt: now,
      ...(dbType === 'mysql' ? { id: uuidv4(), createdAt: now } : { createdAt: now }),
    };
    if (dbType === 'mysql') {
      await db.insert(departments).values(values as any);
      const [row] = await db
        .select()
        .from(departments)
        .where(and(eq(departments.organizationId, organizationId), eq(departments.name, data.name)))
        .limit(1);
      return mapDepartment(row as Record<string, unknown>);
    }
    const [inserted] = await db
      .insert(departments)
      .values(values as any)
      .returning();
    return mapDepartment(inserted as Record<string, unknown>);
  }

  async updateDepartment(
    id: string,
    organizationId: string,
    data: Partial<{ name: string; deptType: string; lead: string; status: GovStatus }>,
  ): Promise<AgentGovDepartmentDto | null> {
    const { departments } = getTables();
    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (data.name !== undefined) {
      patch.name = data.name;
    }
    if (data.deptType !== undefined) {
      patch.deptType = data.deptType;
    }
    if (data.lead !== undefined) {
      patch.lead = data.lead;
    }
    if (data.status !== undefined) {
      patch.status = data.status;
    }

    const dbType = getDbType();
    if (dbType === 'mysql') {
      await db
        .update(departments)
        .set(patch as any)
        .where(and(eq(departments.id, id), eq(departments.organizationId, organizationId)));
      const [row] = await db
        .select()
        .from(departments)
        .where(and(eq(departments.id, id), eq(departments.organizationId, organizationId)))
        .limit(1);
      return row ? mapDepartment(row as Record<string, unknown>) : null;
    }
    const [updated] = await db
      .update(departments)
      .set(patch as any)
      .where(and(eq(departments.id, id), eq(departments.organizationId, organizationId)))
      .returning();
    return updated ? mapDepartment(updated as Record<string, unknown>) : null;
  }

  async deleteDepartment(
    id: string,
    organizationId: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    const { departments, businessSystems, assetOwnerships } = getTables();
    const [dept] = await db
      .select()
      .from(departments)
      .where(and(eq(departments.id, id), eq(departments.organizationId, organizationId)))
      .limit(1);
    if (!dept) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    const deptName = String(dept.name);
    const [bizRef] = await db
      .select({ count: sql<number>`count(*)` })
      .from(businessSystems)
      .where(
        and(
          eq(businessSystems.organizationId, organizationId),
          eq(businessSystems.departmentName, deptName),
        ),
      );
    if (Number(bizRef?.count ?? 0) > 0) {
      return { ok: false, reason: 'REFERENCED_BY_BUSINESS_SYSTEM' };
    }

    const [ownerRef] = await db
      .select({ count: sql<number>`count(*)` })
      .from(assetOwnerships)
      .where(
        and(
          eq(assetOwnerships.organizationId, organizationId),
          eq(assetOwnerships.department, deptName),
        ),
      );
    if (Number(ownerRef?.count ?? 0) > 0) {
      return { ok: false, reason: 'REFERENCED_BY_ASSET' };
    }

    await db
      .delete(departments)
      .where(and(eq(departments.id, id), eq(departments.organizationId, organizationId)));
    return { ok: true };
  }

  async createBusinessScene(
    organizationId: string,
    data: { name: string; status?: GovStatus },
  ): Promise<AgentGovBusinessSceneDto> {
    const { businessScenes } = getTables();
    const dbType = getDbType();
    const now = new Date();
    const values = {
      organizationId,
      name: data.name,
      status: data.status ?? 'active',
      updatedAt: now,
      ...(dbType === 'mysql' ? { id: uuidv4(), createdAt: now } : { createdAt: now }),
    };
    if (dbType === 'mysql') {
      await db.insert(businessScenes).values(values as any);
      const [row] = await db
        .select()
        .from(businessScenes)
        .where(
          and(
            eq(businessScenes.organizationId, organizationId),
            eq(businessScenes.name, data.name),
          ),
        )
        .limit(1);
      return mapScene(row as Record<string, unknown>);
    }
    const [inserted] = await db
      .insert(businessScenes)
      .values(values as any)
      .returning();
    return mapScene(inserted as Record<string, unknown>);
  }

  async updateBusinessScene(
    id: string,
    organizationId: string,
    data: Partial<{ name: string; status: GovStatus }>,
  ): Promise<AgentGovBusinessSceneDto | null> {
    const { businessScenes } = getTables();
    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (data.name !== undefined) {
      patch.name = data.name;
    }
    if (data.status !== undefined) {
      patch.status = data.status;
    }

    const dbType = getDbType();
    if (dbType === 'mysql') {
      await db
        .update(businessScenes)
        .set(patch as any)
        .where(and(eq(businessScenes.id, id), eq(businessScenes.organizationId, organizationId)));
      const [row] = await db
        .select()
        .from(businessScenes)
        .where(and(eq(businessScenes.id, id), eq(businessScenes.organizationId, organizationId)))
        .limit(1);
      return row ? mapScene(row as Record<string, unknown>) : null;
    }
    const [updated] = await db
      .update(businessScenes)
      .set(patch as any)
      .where(and(eq(businessScenes.id, id), eq(businessScenes.organizationId, organizationId)))
      .returning();
    return updated ? mapScene(updated as Record<string, unknown>) : null;
  }

  async deleteBusinessScene(
    id: string,
    organizationId: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    const { businessScenes, businessSystems, agentAssets } = getTables();
    const [scene] = await db
      .select()
      .from(businessScenes)
      .where(and(eq(businessScenes.id, id), eq(businessScenes.organizationId, organizationId)))
      .limit(1);
    if (!scene) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    const sceneName = String(scene.name);
    const [bizRef] = await db
      .select({ count: sql<number>`count(*)` })
      .from(businessSystems)
      .where(
        and(
          eq(businessSystems.organizationId, organizationId),
          eq(businessSystems.sceneName, sceneName),
        ),
      );
    if (Number(bizRef?.count ?? 0) > 0) {
      return { ok: false, reason: 'REFERENCED_BY_BUSINESS_SYSTEM' };
    }

    const [assetRef] = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentAssets)
      .where(
        and(
          eq(agentAssets.organizationId, organizationId),
          eq(agentAssets.businessScene, sceneName),
        ),
      );
    if (Number(assetRef?.count ?? 0) > 0) {
      return { ok: false, reason: 'REFERENCED_BY_ASSET' };
    }

    await db
      .delete(businessScenes)
      .where(and(eq(businessScenes.id, id), eq(businessScenes.organizationId, organizationId)));
    return { ok: true };
  }

  async createBusinessSystem(
    organizationId: string,
    data: {
      name: string;
      departmentName?: string;
      sceneName?: string;
      status?: GovStatus;
    },
  ): Promise<AgentGovBusinessSystemDto> {
    const { businessSystems } = getTables();
    const dbType = getDbType();
    const now = new Date();
    const values = {
      organizationId,
      name: data.name,
      departmentName: data.departmentName ?? null,
      sceneName: data.sceneName ?? null,
      status: data.status ?? 'active',
      updatedAt: now,
      ...(dbType === 'mysql' ? { id: uuidv4(), createdAt: now } : { createdAt: now }),
    };
    if (dbType === 'mysql') {
      await db.insert(businessSystems).values(values as any);
      const [row] = await db
        .select()
        .from(businessSystems)
        .where(
          and(
            eq(businessSystems.organizationId, organizationId),
            eq(businessSystems.name, data.name),
          ),
        )
        .limit(1);
      return mapBusinessSystem(row as Record<string, unknown>);
    }
    const [inserted] = await db
      .insert(businessSystems)
      .values(values as any)
      .returning();
    return mapBusinessSystem(inserted as Record<string, unknown>);
  }

  async updateBusinessSystem(
    id: string,
    organizationId: string,
    data: Partial<{
      name: string;
      departmentName: string;
      sceneName: string;
      status: GovStatus;
    }>,
  ): Promise<AgentGovBusinessSystemDto | null> {
    const { businessSystems } = getTables();
    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (data.name !== undefined) {
      patch.name = data.name;
    }
    if (data.departmentName !== undefined) {
      patch.departmentName = data.departmentName;
    }
    if (data.sceneName !== undefined) {
      patch.sceneName = data.sceneName;
    }
    if (data.status !== undefined) {
      patch.status = data.status;
    }

    const dbType = getDbType();
    if (dbType === 'mysql') {
      await db
        .update(businessSystems)
        .set(patch as any)
        .where(and(eq(businessSystems.id, id), eq(businessSystems.organizationId, organizationId)));
      const [row] = await db
        .select()
        .from(businessSystems)
        .where(and(eq(businessSystems.id, id), eq(businessSystems.organizationId, organizationId)))
        .limit(1);
      return row ? mapBusinessSystem(row as Record<string, unknown>) : null;
    }
    const [updated] = await db
      .update(businessSystems)
      .set(patch as any)
      .where(and(eq(businessSystems.id, id), eq(businessSystems.organizationId, organizationId)))
      .returning();
    return updated ? mapBusinessSystem(updated as Record<string, unknown>) : null;
  }

  async deleteBusinessSystem(
    id: string,
    organizationId: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    const { businessSystems, agentAssets } = getTables();
    const [biz] = await db
      .select()
      .from(businessSystems)
      .where(and(eq(businessSystems.id, id), eq(businessSystems.organizationId, organizationId)))
      .limit(1);
    if (!biz) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    const bizName = String(biz.name);
    const [assetRef] = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentAssets)
      .where(
        and(
          eq(agentAssets.organizationId, organizationId),
          eq(agentAssets.businessSystem, bizName),
        ),
      );
    if (Number(assetRef?.count ?? 0) > 0) {
      return { ok: false, reason: 'REFERENCED_BY_ASSET' };
    }

    await db
      .delete(businessSystems)
      .where(and(eq(businessSystems.id, id), eq(businessSystems.organizationId, organizationId)));
    return { ok: true };
  }

  async createOwner(
    organizationId: string,
    data: {
      name: string;
      ownerType: OwnerType;
      departmentName?: string;
      email?: string;
      status?: GovStatus;
    },
  ): Promise<AgentGovOwnerDto> {
    const { owners } = getTables();
    const dbType = getDbType();
    const now = new Date();
    const values = {
      organizationId,
      name: data.name,
      ownerType: data.ownerType,
      departmentName: data.departmentName ?? null,
      email: data.email ?? null,
      status: data.status ?? 'active',
      updatedAt: now,
      ...(dbType === 'mysql' ? { id: uuidv4(), createdAt: now } : { createdAt: now }),
    };
    if (dbType === 'mysql') {
      await db.insert(owners).values(values as any);
      const [row] = await db
        .select()
        .from(owners)
        .where(
          and(
            eq(owners.organizationId, organizationId),
            eq(owners.name, data.name),
            eq(owners.ownerType, data.ownerType),
          ),
        )
        .limit(1);
      return mapOwner(row as Record<string, unknown>);
    }
    const [inserted] = await db
      .insert(owners)
      .values(values as any)
      .returning();
    return mapOwner(inserted as Record<string, unknown>);
  }

  async updateOwner(
    id: string,
    organizationId: string,
    data: Partial<{
      name: string;
      ownerType: OwnerType;
      departmentName: string;
      email: string;
      status: GovStatus;
    }>,
  ): Promise<AgentGovOwnerDto | null> {
    const { owners } = getTables();
    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (data.name !== undefined) {
      patch.name = data.name;
    }
    if (data.ownerType !== undefined) {
      patch.ownerType = data.ownerType;
    }
    if (data.departmentName !== undefined) {
      patch.departmentName = data.departmentName;
    }
    if (data.email !== undefined) {
      patch.email = data.email;
    }
    if (data.status !== undefined) {
      patch.status = data.status;
    }

    const dbType = getDbType();
    if (dbType === 'mysql') {
      await db
        .update(owners)
        .set(patch as any)
        .where(and(eq(owners.id, id), eq(owners.organizationId, organizationId)));
      const [row] = await db
        .select()
        .from(owners)
        .where(and(eq(owners.id, id), eq(owners.organizationId, organizationId)))
        .limit(1);
      return row ? mapOwner(row as Record<string, unknown>) : null;
    }
    const [updated] = await db
      .update(owners)
      .set(patch as any)
      .where(and(eq(owners.id, id), eq(owners.organizationId, organizationId)))
      .returning();
    return updated ? mapOwner(updated as Record<string, unknown>) : null;
  }

  async deleteOwner(id: string, organizationId: string): Promise<{ ok: boolean; reason?: string }> {
    const { owners, assetOwnerships } = getTables();
    const [owner] = await db
      .select()
      .from(owners)
      .where(and(eq(owners.id, id), eq(owners.organizationId, organizationId)))
      .limit(1);
    if (!owner) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    const ownerName = String(owner.name);
    const ownerType = String(owner.ownerType);
    const [assetRef] = await db
      .select({ count: sql<number>`count(*)` })
      .from(assetOwnerships)
      .where(
        and(
          eq(assetOwnerships.organizationId, organizationId),
          eq(assetOwnerships.ownerName, ownerName),
          eq(assetOwnerships.ownerType, ownerType),
        ),
      );
    if (Number(assetRef?.count ?? 0) > 0) {
      return { ok: false, reason: 'REFERENCED_BY_ASSET' };
    }

    await db
      .delete(owners)
      .where(and(eq(owners.id, id), eq(owners.organizationId, organizationId)));
    return { ok: true };
  }
}

export const agentGovernanceService = new AgentGovernanceService();

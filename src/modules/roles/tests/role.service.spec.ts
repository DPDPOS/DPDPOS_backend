import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";
import { OrganizationService } from "../../organizations/services/organization.service.js";
import { RoleService } from "../services/role.service.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

describe("RoleService", () => {
  const orgService = new OrganizationService();
  const roleService = new RoleService();
  const createdOrgIds: string[] = [];
  let ctx: RequestContext;

  beforeAll(async () => {
    await prisma.$connect();
    const created = await orgService.create({
      name: `Roles Org ${Date.now()}`,
      industry: "IT",
    });
    createdOrgIds.push(created.organization.id);
    ctx = {
      organizationId: created.organization.id,
      actorUserId: randomUUID(),
      correlationId: randomUUID(),
      permissions: [PERMISSIONS.ROLE_CREATE, PERMISSIONS.ROLE_READ, PERMISSIONS.ROLE_UPDATE_PERMISSIONS],
      roles: ["ORG_ADMIN"],
    };
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.role.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    await prisma.$disconnect();
  });

  it("lists system roles seeded with the organization", async () => {
    const listed = await roleService.list(ctx, { page: 1, pageSize: 20 });
    expect(listed.meta.pagination.total).toBeGreaterThanOrEqual(5);
    expect(listed.items.some((r) => r.name === "ORG_ADMIN" && r.isSystemRole)).toBe(
      true,
    );
  });

  it("creates a custom role and writes outbox event", async () => {
    const role = await roleService.create(ctx, {
      name: `Custom Analyst ${Date.now()}`,
      description: "Read-only analyst",
      permissions: [PERMISSIONS.ANALYTICS_READ, PERMISSIONS.REPORT_READ],
    });

    expect(role.isSystemRole).toBe(false);
    expect(role.permissions).toContain(PERMISSIONS.ANALYTICS_READ);

    const outboxRows = await prisma.outboxEvent.findMany({
      where: {
        organizationId: ctx.organizationId,
        eventType: DOMAIN_EVENTS.RolePermissionsChanged,
      },
    });
    const matched = outboxRows.find((row) => {
      const payload = row.payload as { roleId?: string };
      return payload.roleId === role.id;
    });
    expect(matched).toBeTruthy();
  });

  it("rejects unknown permissions and duplicate names", async () => {
    await expect(
      roleService.create(ctx, {
        name: "Bad Role",
        permissions: ["totally:fake"],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const name = `Dup Role ${Date.now()}`;
    await roleService.create(ctx, {
      name,
      permissions: [PERMISSIONS.ROLE_READ],
    });
    await expect(
      roleService.create(ctx, {
        name,
        permissions: [PERMISSIONS.ROLE_READ],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("updates permissions on a system role without clearing isSystemRole", async () => {
    const listed = await roleService.list(ctx);
    const member = listed.items.find((r) => r.name === "MEMBER");
    expect(member).toBeTruthy();

    const updated = await roleService.updatePermissions(ctx, member!.id, {
      permissions: [PERMISSIONS.ORGANIZATION_READ, PERMISSIONS.NOTIFICATION_READ],
    });

    expect(updated.isSystemRole).toBe(true);
    expect(updated.permissions).toEqual([
      PERMISSIONS.ORGANIZATION_READ,
      PERMISSIONS.NOTIFICATION_READ,
    ]);
  });
});

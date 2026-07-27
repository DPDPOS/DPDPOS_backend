import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";
import { OrganizationService } from "../../organizations/services/organization.service.js";
import { UserService } from "../../users/services/user.service.js";
import { DepartmentService } from "../services/department.service.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

describe("DepartmentService", () => {
  const orgService = new OrganizationService();
  const userService = new UserService();
  const departmentService = new DepartmentService();
  const createdOrgIds: string[] = [];
  let ctx: RequestContext;
  let headUserId = "";

  beforeAll(async () => {
    await prisma.$connect();
    const org = await orgService.create({ name: `Depts Org ${Date.now()}` });
    createdOrgIds.push(org.organization.id);
    ctx = {
      organizationId: org.organization.id,
      actorUserId: randomUUID(),
      correlationId: randomUUID(),
      permissions: [
        PERMISSIONS.DEPARTMENT_CREATE,
        PERMISSIONS.DEPARTMENT_READ,
        PERMISSIONS.USER_CREATE,
      ],
      roles: ["ORG_ADMIN"],
    };
    const invited = await userService.invite(ctx, {
      email: `head.${Date.now()}@example.com`,
      name: "Dept Head",
    });
    headUserId = invited.id;
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.department.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.userRole.deleteMany({
        where: { organizationId: { in: createdOrgIds } },
      });
      await prisma.user.deleteMany({
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

  it("creates a department with optional head user and outbox event", async () => {
    const dept = await departmentService.create(ctx, {
      name: `Compliance ${Date.now()}`,
      headUserId,
    });

    expect(dept.headUserId).toBe(headUserId);

    const outbox = await prisma.outboxEvent.findMany({
      where: {
        organizationId: ctx.organizationId,
        eventType: DOMAIN_EVENTS.DepartmentCreated,
      },
    });
    expect(
      outbox.some(
        (row) => (row.payload as { departmentId?: string }).departmentId === dept.id,
      ),
    ).toBe(true);
  });

  it("lists departments and rejects duplicate names", async () => {
    const name = `Unique Dept ${Date.now()}`;
    await departmentService.create(ctx, { name });
    await expect(departmentService.create(ctx, { name })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const listed = await departmentService.list(ctx, { page: 1, pageSize: 50 });
    expect(listed.items.some((d) => d.name === name)).toBe(true);
  });

  it("rejects headUserId outside the organization", async () => {
    await expect(
      departmentService.create(ctx, {
        name: `Bad Head ${Date.now()}`,
        headUserId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

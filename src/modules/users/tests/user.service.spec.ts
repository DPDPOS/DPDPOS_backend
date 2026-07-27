import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../../infrastructure/database/prisma-client.js";
import { DOMAIN_EVENTS } from "../../../events/types/base-event.interface.js";
import { PERMISSIONS } from "../../../shared/constants/permissions.js";
import { OrganizationService } from "../../organizations/services/organization.service.js";
import { UserService } from "../services/user.service.js";
import type { RequestContext } from "../../../shared/types/request-context.js";

describe("UserService", () => {
  const orgService = new OrganizationService();
  const userService = new UserService();
  const createdOrgIds: string[] = [];
  let ctx: RequestContext;

  beforeAll(async () => {
    await prisma.$connect();
    const created = await orgService.create({
      name: `Users Org ${Date.now()}`,
    });
    createdOrgIds.push(created.organization.id);
    ctx = {
      organizationId: created.organization.id,
      actorUserId: randomUUID(),
      correlationId: randomUUID(),
      permissions: [
        PERMISSIONS.USER_CREATE,
        PERMISSIONS.USER_READ,
        PERMISSIONS.USER_UPDATE,
      ],
      roles: ["ORG_ADMIN"],
    };
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
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

  it("invites a user with default MEMBER role and outbox event", async () => {
    const email = `invitee.${Date.now()}@example.com`;
    const user = await userService.invite(ctx, {
      email,
      name: "Invitee One",
    });

    expect(user.status).toBe("INVITED");
    expect(user.email).toBe(email.toLowerCase());
    expect(user.roleNames).toContain("MEMBER");
    expect(user).not.toHaveProperty("passwordHash");

    const outbox = await prisma.outboxEvent.findMany({
      where: {
        organizationId: ctx.organizationId,
        eventType: DOMAIN_EVENTS.UserInvited,
      },
    });
    expect(
      outbox.some((row) => (row.payload as { userId?: string }).userId === user.id),
    ).toBe(true);
  });

  it("rejects duplicate emails in the same organization", async () => {
    const email = `dup.${Date.now()}@example.com`;
    await userService.invite(ctx, { email, name: "First" });
    await expect(
      userService.invite(ctx, { email, name: "Second" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lists users and updates name/status", async () => {
    const invited = await userService.invite(ctx, {
      email: `patch.${Date.now()}@example.com`,
      name: "Before",
    });

    const listed = await userService.list(ctx, { page: 1, pageSize: 50 });
    expect(listed.items.some((u) => u.id === invited.id)).toBe(true);

    const updated = await userService.update(ctx, invited.id, {
      name: "After",
      status: "ACTIVE",
    });
    expect(updated.name).toBe("After");
    expect(updated.status).toBe("ACTIVE");
  });

  it("rejects invalid roleIds for the organization", async () => {
    await expect(
      userService.invite(ctx, {
        email: `badrole.${Date.now()}@example.com`,
        name: "Bad Roles",
        roleIds: [randomUUID()],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

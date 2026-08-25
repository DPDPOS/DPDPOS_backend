import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const demoOrg = "00000000-0000-4000-8000-000000000001";
  const role = await prisma.role.findFirst({
    where: { organizationId: demoOrg, name: "ORG_ADMIN", deletedAt: null },
  });
  const perms = (role?.permissions as string[]) ?? [];
  console.log(
    JSON.stringify(
      {
        demoOrgRoleId: role?.id,
        permCount: perms.length,
        hasVendorRead: perms.includes("vendor:read"),
        vendorPerms: perms.filter((p) => p.startsWith("vendor:")),
        sampleTail: perms.slice(-10),
      },
      null,
      2,
    ),
  );

  const admin = await prisma.user.findFirst({
    where: { organizationId: demoOrg, email: "admin@demo.dpdpos.local" },
    include: {
      userRoles: { include: { role: true } },
    },
  });
  const fromRoles = [
    ...new Set(
      (admin?.userRoles ?? [])
        .filter((ur) => !ur.role.deletedAt)
        .flatMap((ur) => ur.role.permissions as string[]),
    ),
  ];
  console.log(
    JSON.stringify(
      {
        adminId: admin?.id,
        roleNames: admin?.userRoles.map((ur) => ur.role.name),
        hasVendorRead: fromRoles.includes("vendor:read"),
        vendorPerms: fromRoles.filter((p) => p.startsWith("vendor:")),
      },
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

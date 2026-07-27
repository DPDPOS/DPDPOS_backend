import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { SYSTEM_ROLE_PRESETS } from "../../src/shared/constants/permissions.js";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Demo Data Fiduciary Pvt Ltd",
      industry: "Financial Services",
      companySize: "201-1000",
      operatingRegion: "IN",
      companyType: "Private Limited",
      maturityLevel: "Developing",
      isSignificantDataFiduciary: false,
      status: "ACTIVE",
    },
  });

  const roleCreates = Object.entries(SYSTEM_ROLE_PRESETS).map(([name, permissions]) =>
    prisma.role.upsert({
      where: {
        organizationId_name: {
          organizationId: org.id,
          name,
        },
      },
      update: { permissions: [...permissions] },
      create: {
        organizationId: org.id,
        name,
        description: `System role: ${name}`,
        permissions: [...permissions],
        isSystemRole: true,
      },
    }),
  );
  const roles = await Promise.all(roleCreates);
  const adminRole = roles.find((r) => r.name === "ORG_ADMIN");
  if (!adminRole) {
    throw new Error("ORG_ADMIN role missing after seed");
  }

  const passwordHash = await argon2.hash("ChangeMe123!");
  const admin = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: org.id,
        email: "admin@demo.dpdpos.local",
      },
    },
    update: {
      passwordHash,
      status: "ACTIVE",
      name: "Demo Admin",
    },
    create: {
      organizationId: org.id,
      email: "admin@demo.dpdpos.local",
      name: "Demo Admin",
      passwordHash,
      status: "ACTIVE",
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: admin.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      userId: admin.id,
      roleId: adminRole.id,
    },
  });

  await prisma.department.upsert({
    where: {
      organizationId_name: {
        organizationId: org.id,
        name: "Compliance",
      },
    },
    update: { headUserId: admin.id },
    create: {
      organizationId: org.id,
      name: "Compliance",
      headUserId: admin.id,
    },
  });

  console.log("Seed complete:", {
    organizationId: org.id,
    adminEmail: admin.email,
    adminPassword: "ChangeMe123!",
    roles: roles.map((r) => r.name),
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import "dotenv/config";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { SYSTEM_ROLE_PRESETS } from "../../src/shared/constants/permissions.js";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: { industry: "banking_finance" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Demo Data Fiduciary Pvt Ltd",
      industry: "banking_finance",
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

  // Demo TPRM graph: primary processor + sub-processors for SCRM dropdown / roll-up
  const demoLoanId = "00000000-0000-4000-8000-0000000000a1";
  const demoKycId = "00000000-0000-4000-8000-0000000000a2";
  const demoNotifyId = "00000000-0000-4000-8000-0000000000a3";
  const demoCloudId = "00000000-0000-4000-8000-0000000000a4";

  await prisma.vendor.upsert({
    where: { id: demoLoanId },
    update: {
      name: "Demo Loan Processor",
      status: "ACTIVE",
      criticality: "HIGH",
      countries: ["US"],
      dataCategories: ["FINANCIAL", "CONTACT"],
      ownerUserId: admin.id,
    },
    create: {
      id: demoLoanId,
      organizationId: org.id,
      name: "Demo Loan Processor",
      legalName: "Demo Loan Processor Inc.",
      vendorType: "PROCESSOR",
      status: "ACTIVE",
      criticality: "HIGH",
      countries: ["US"],
      dataCategories: ["FINANCIAL", "CONTACT"],
      services: "Loan underwriting and KYC shared with bank partners",
      ownerUserId: admin.id,
      inherentRiskScore: 75,
      residualRiskScore: 90,
      notes: "Seeded for TPRM manual E2E — add a DPA to clear vendor-dpa-present",
    },
  });

  await prisma.vendor.upsert({
    where: { id: demoKycId },
    update: {
      name: "Acme KYC Cloud",
      status: "ACTIVE",
      criticality: "CRITICAL",
      countries: ["IN", "SG"],
      dataCategories: ["GOVERNMENT_ID", "BIOMETRIC", "CONTACT"],
      ownerUserId: admin.id,
    },
    create: {
      id: demoKycId,
      organizationId: org.id,
      name: "Acme KYC Cloud",
      legalName: "Acme Identity Verification Pte Ltd",
      vendorType: "SUB_PROCESSOR",
      status: "ACTIVE",
      criticality: "CRITICAL",
      countries: ["IN", "SG"],
      dataCategories: ["GOVERNMENT_ID", "BIOMETRIC", "CONTACT"],
      services: "Video KYC and Aadhaar/PAN verification for loan onboarding",
      ownerUserId: admin.id,
      inherentRiskScore: 85,
      residualRiskScore: 88,
      notes: "Typical nth-party under a loan processor — link via SCRM",
    },
  });

  await prisma.vendor.upsert({
    where: { id: demoNotifyId },
    update: {
      name: "NotifyStack SMS",
      status: "ACTIVE",
      criticality: "MEDIUM",
      countries: ["IN"],
      dataCategories: ["CONTACT"],
      ownerUserId: admin.id,
    },
    create: {
      id: demoNotifyId,
      organizationId: org.id,
      name: "NotifyStack SMS",
      legalName: "NotifyStack Communications LLP",
      vendorType: "SUB_PROCESSOR",
      status: "ACTIVE",
      criticality: "MEDIUM",
      countries: ["IN"],
      dataCategories: ["CONTACT"],
      services: "OTP and transactional SMS for loan status",
      ownerUserId: admin.id,
      inherentRiskScore: 45,
      residualRiskScore: 50,
      notes: "Lower-criticality sub-processor for SCRM demos",
    },
  });

  await prisma.vendor.upsert({
    where: { id: demoCloudId },
    update: {
      name: "Horizon Object Storage",
      status: "ACTIVE",
      criticality: "HIGH",
      countries: ["IN"],
      dataCategories: ["FINANCIAL", "CONTACT", "OTHER"],
      ownerUserId: admin.id,
    },
    create: {
      id: demoCloudId,
      organizationId: org.id,
      name: "Horizon Object Storage",
      legalName: "Horizon Cloud India Pvt Ltd",
      vendorType: "PROCESSOR",
      status: "ACTIVE",
      criticality: "HIGH",
      countries: ["IN"],
      dataCategories: ["FINANCIAL", "CONTACT", "OTHER"],
      services: "Encrypted document and statement storage",
      ownerUserId: admin.id,
      inherentRiskScore: 60,
      residualRiskScore: 40,
      notes: "Well-managed direct processor — seeded with ACTIVE DPA",
    },
  });

  const dpaExpires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const existingDpa = await prisma.vendorAgreement.findFirst({
    where: {
      organizationId: org.id,
      vendorId: demoCloudId,
      title: "Horizon DPA",
      versionLabel: "v1",
    },
  });
  if (!existingDpa) {
    await prisma.vendorAgreement.create({
      data: {
        organizationId: org.id,
        vendorId: demoCloudId,
        title: "Horizon DPA",
        versionLabel: "v1",
        status: "ACTIVE",
        effectiveFrom: new Date(),
        expiresAt: dpaExpires,
        allowsSubProcessors: false,
        crossBorderAllowed: false,
        breachNotifyHours: 72,
        notes: "Seeded ACTIVE DPA for a healthy TPRM example",
      },
    });
  }

  const existingReview = await prisma.vendorDiligenceReview.findFirst({
    where: {
      organizationId: org.id,
      vendorId: demoCloudId,
      outcome: "APPROVED",
    },
  });
  if (!existingReview) {
    await prisma.vendorDiligenceReview.create({
      data: {
        organizationId: org.id,
        vendorId: demoCloudId,
        outcome: "APPROVED",
        residualRisk: "MEDIUM",
        completedAt: new Date(),
        notes: "Seeded annual diligence — approved with medium residual risk",
      },
    });
  }

  for (const [parentId, childId, notes] of [
    [
      demoLoanId,
      demoKycId,
      "Loan processor routes KYC to Acme (sub-processor)",
    ],
    [
      demoLoanId,
      demoNotifyId,
      "Loan status OTPs via NotifyStack (sub-processor)",
    ],
  ] as const) {
    await prisma.vendorRelationship.upsert({
      where: {
        parentVendorId_childVendorId: {
          parentVendorId: parentId,
          childVendorId: childId,
        },
      },
      update: {
        relationshipType: "SUB_PROCESSOR",
        personalDataFlows: true,
        notificationRequired: true,
        notes,
      },
      create: {
        organizationId: org.id,
        parentVendorId: parentId,
        childVendorId: childId,
        relationshipType: "SUB_PROCESSOR",
        personalDataFlows: true,
        notificationRequired: true,
        notes,
      },
    });
  }

  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });
  for (const o of orgs) {
    await Promise.all(
      Object.entries(SYSTEM_ROLE_PRESETS).map(([name, permissions]) =>
        prisma.role.updateMany({
          where: {
            organizationId: o.id,
            name,
            isSystemRole: true,
            deletedAt: null,
          },
          data: { permissions: [...permissions] },
        }),
      ),
    );
  }

  console.log("Seed complete:", {
    organizationId: org.id,
    adminEmail: admin.email,
    adminPassword: "ChangeMe123!",
    roles: roles.map((r) => r.name),
    demoVendors: {
      loanProcessor: demoLoanId,
      kycSubProcessor: demoKycId,
      smsSubProcessor: demoNotifyId,
      cloudWithDpa: demoCloudId,
    },
    systemRolesSyncedForOrgs: orgs.length,
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

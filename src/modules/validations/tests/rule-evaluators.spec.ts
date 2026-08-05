import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import type { RuleEvaluationInput } from "../domain/rule-evaluation.types.js";
import type { DataSubjectRequestRecord } from "../../rights/types/data-subject-request.types.js";

import { NoticePresentRule } from "../rules/notice-present.rule.js";
import { ConsentPresentRule } from "../rules/consent-present.rule.js";
import { ConsentWithdrawnCorrectlyRule } from "../rules/consent-withdrawn-correctly.rule.js";
import { RetentionMetadataSetRule } from "../rules/retention-metadata-set.rule.js";
import { RequestRespondedWithinSlaRule } from "../rules/request-responded-within-sla.rule.js";

function emptySnapshot(): RuleEvaluationInput {
  return {
    organizationId: randomUUID(),
    dataAssets: [],
    processingActivities: [],
    notices: [],
    consentRecords: [],
    dataSubjectRequests: [],
  };
}

const DAY = 24 * 60 * 60 * 1000;

describe("NoticePresentRule (VLD-003)", () => {
  it("fails when no notice is published", async () => {
    const outcome = await new NoticePresentRule().evaluate(emptySnapshot());
    expect(outcome.status).toBe("FAIL");
    expect(outcome.score).toBe(0);
    expect(outcome.evidenceRequired).toBe(true);
  });

  it("passes when a notice exists", async () => {
    const snapshot = emptySnapshot();
    snapshot.notices = [
      {
        id: randomUUID(),
        organizationId: snapshot.organizationId,
        title: "Privacy Notice",
        version: 1,
        content: "Notice content",
        effectiveFrom: new Date(),
        publishedBy: randomUUID(),
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ];

    const outcome = await new NoticePresentRule().evaluate(snapshot);
    expect(outcome.status).toBe("PASS");
    expect(outcome.score).toBe(100);
  });
});

describe("ConsentPresentRule (VLD-003)", () => {
  const rule = new ConsentPresentRule();

  it("is self-describing with code, category, and severity", () => {
    expect(rule.descriptor.code).toBe("consent-present");
    expect(rule.descriptor.category).toBe("CONSENT");
    expect(rule.descriptor.severity).toBe("HIGH");
  });

  it("passes with no active assets", async () => {
    const outcome = await rule.evaluate(emptySnapshot());
    expect(outcome.status).toBe("PASS");
  });

  it("fails when active assets lack consent records", async () => {
    const snapshot = emptySnapshot();
    snapshot.dataAssets = [
      {
        id: randomUUID(),
        organizationId: snapshot.organizationId,
        departmentId: null,
        ownerUserId: null,
        assetName: "Customer DB",
        assetType: "Database",
        category: "Personal",
        sensitivity: "HIGH",
        description: null,
        storageLocation: null,
        retentionPeriod: "24 months",
        status: "ACTIVE",
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ];

    const outcome = await rule.evaluate(snapshot);
    expect(outcome.status).toBe("FAIL");
    expect(outcome.score).toBe(0);
  });

  it("passes when all active assets have consent", async () => {
    const snapshot = emptySnapshot();
    const assetId = randomUUID();
    snapshot.dataAssets = [
      {
        id: assetId,
        organizationId: snapshot.organizationId,
        departmentId: null,
        ownerUserId: null,
        assetName: "Customer DB",
        assetType: "Database",
        category: "Personal",
        sensitivity: "HIGH",
        description: null,
        storageLocation: null,
        retentionPeriod: "24 months",
        status: "ACTIVE",
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ];
    snapshot.consentRecords = [
      {
        id: randomUUID(),
        organizationId: snapshot.organizationId,
        dataSubjectIdentifier: "subject@example.com",
        noticeId: null,
        dataAssetId: assetId,
        purpose: "Marketing",
        consentState: "GRANTED",
        grantedAt: new Date(),
        withdrawnAt: null,
        proofFileId: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ];

    const outcome = await rule.evaluate(snapshot);
    expect(outcome.status).toBe("PASS");
    expect(outcome.score).toBe(100);
  });
});

describe("ConsentWithdrawnCorrectlyRule (VLD-003)", () => {
  it("fails when a withdrawn record has no timestamp", async () => {
    const snapshot = emptySnapshot();
    snapshot.consentRecords = [
      {
        id: randomUUID(),
        organizationId: snapshot.organizationId,
        dataSubjectIdentifier: "subject@example.com",
        noticeId: null,
        dataAssetId: null,
        purpose: "Marketing",
        consentState: "WITHDRAWN",
        grantedAt: new Date(),
        withdrawnAt: null,
        proofFileId: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ];

    const outcome = await new ConsentWithdrawnCorrectlyRule().evaluate(snapshot);
    expect(outcome.status).toBe("FAIL");
    expect(outcome.evidenceRequired).toBe(true);
  });

  it("passes when all withdrawals carry timestamps", async () => {
    const snapshot = emptySnapshot();
    snapshot.consentRecords = [
      {
        id: randomUUID(),
        organizationId: snapshot.organizationId,
        dataSubjectIdentifier: "subject@example.com",
        noticeId: null,
        dataAssetId: null,
        purpose: "Marketing",
        consentState: "WITHDRAWN",
        grantedAt: new Date(Date.now() - 2 * DAY),
        withdrawnAt: new Date(Date.now() - DAY),
        proofFileId: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ];

    const outcome = await new ConsentWithdrawnCorrectlyRule().evaluate(snapshot);
    expect(outcome.status).toBe("PASS");
    expect(outcome.score).toBe(100);
  });
});

describe("RetentionMetadataSetRule (VLD-003)", () => {
  it("fails when active assets lack retention", async () => {
    const snapshot = emptySnapshot();
    snapshot.dataAssets = [
      {
        id: randomUUID(),
        organizationId: snapshot.organizationId,
        departmentId: null,
        ownerUserId: null,
        assetName: "Logs",
        assetType: "Logs",
        category: "Personal",
        sensitivity: "MEDIUM",
        description: null,
        storageLocation: null,
        retentionPeriod: null,
        status: "ACTIVE",
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ];

    const outcome = await new RetentionMetadataSetRule().evaluate(snapshot);
    expect(outcome.status).toBe("FAIL");
    expect(outcome.score).toBe(0);
  });

  it("passes when retention is defined", async () => {
    const snapshot = emptySnapshot();
    snapshot.dataAssets = [
      {
        id: randomUUID(),
        organizationId: snapshot.organizationId,
        departmentId: null,
        ownerUserId: null,
        assetName: "Logs",
        assetType: "Logs",
        category: "Personal",
        sensitivity: "MEDIUM",
        description: null,
        storageLocation: null,
        retentionPeriod: "12 months",
        status: "ACTIVE",
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ];

    const outcome = await new RetentionMetadataSetRule().evaluate(snapshot);
    expect(outcome.status).toBe("PASS");
    expect(outcome.score).toBe(100);
  });
});

describe("RequestRespondedWithinSlaRule (VLD-003)", () => {
  function request({
    closedAt,
    dueAt,
    status,
  }: {
    closedAt: Date | null;
    dueAt: Date | null;
    status: "CLOSED" | "IN_PROGRESS";
  }): DataSubjectRequestRecord {
    return {
      id: randomUUID(),
      organizationId: randomUUID(),
      requestType: "ACCESS",
      requesterReference: "subject@example.com",
      status,
      assignedTo: null,
      openedAt: new Date(Date.now() - 5 * DAY),
      dueAt,
      closedAt,
      resolutionSummary: null,
      version: 1,
      createdBy: null,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
  }

  it("passes when all requests are within SLA", async () => {
    const snapshot = emptySnapshot();
    snapshot.dataSubjectRequests = [
      request({
        closedAt: new Date(Date.now() - DAY),
        dueAt: new Date(Date.now() + 10 * DAY),
        status: "CLOSED",
      }),
    ];

    const outcome = await new RequestRespondedWithinSlaRule().evaluate(snapshot);
    expect(outcome.status).toBe("PASS");
  });

  it("fails when a request was closed after its due date", async () => {
    const snapshot = emptySnapshot();
    snapshot.dataSubjectRequests = [
      request({
        closedAt: new Date(Date.now() - DAY),
        dueAt: new Date(Date.now() - 30 * DAY),
        status: "CLOSED",
      }),
    ];

    const outcome = await new RequestRespondedWithinSlaRule().evaluate(snapshot);
    expect(outcome.status).toBe("FAIL");
  });

  it("fails when an open request is past due", async () => {
    const snapshot = emptySnapshot();
    snapshot.dataSubjectRequests = [
      request({
        closedAt: null,
        dueAt: new Date(Date.now() - 5 * DAY),
        status: "IN_PROGRESS",
      }),
    ];

    const outcome = await new RequestRespondedWithinSlaRule().evaluate(snapshot);
    expect(outcome.status).toBe("FAIL");
  });
});

import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import type { RuleEvaluationInput } from "../domain/rule-evaluation.types.js";
import {
  AgentHealthRule,
  CatalogFreshnessRule,
  ConsentCacheFreshnessRule,
  DataFlowComplianceRule,
  DsrEscalatedRule,
  PiiWithoutBasisRule,
  UnmappedSystemRule,
} from "../rules/agent-control-plane.rules.js";
import { REGISTERED_EVALUATORS } from "../domain/rule.registry.js";

function baseSnapshot(): RuleEvaluationInput {
  return {
    organizationId: randomUUID(),
    organization: {
      isSignificantDataFiduciary: false,
      processesChildrenData: false,
      hasDpoUser: false,
      frameworkId: null,
    },
    controls: [],
    dataAssets: [],
    processingActivities: [],
    notices: [],
    consentRecords: [],
    dataSubjectRequests: [],
    openErasureRequests: 0,
    vendors: [],
    openFindings: [],
    agents: [],
    catalogRevisionAgeHours: null,
  };
}

describe("agent control-plane rules", () => {
  it("registers all agent-aware rule codes", () => {
    const codes = new Set(REGISTERED_EVALUATORS.map((e) => e.descriptor.code));
    for (const code of [
      "VLD-UNMAPPED-SYSTEM",
      "VLD-PII-NO-BASIS",
      "VLD-CATALOG-STALE",
      "VLD-AGENT-HEALTH",
      "VLD-CONSENT-CACHE",
      "VLD-DSR-ESCALATED",
      "VLD-DATA-FLOW",
    ]) {
      expect(codes.has(code)).toBe(true);
    }
  });

  it("UnmappedSystemRule fails on open findings", async () => {
    const snapshot = baseSnapshot();
    snapshot.openFindings = [
      {
        id: randomUUID(),
        ruleCode: "VLD-UNMAPPED-SYSTEM",
        severity: "HIGH",
        status: "OPEN",
        systemId: randomUUID(),
        dataAssetId: null,
        lastSeenAt: new Date(),
      },
    ];
    const outcome = await new UnmappedSystemRule().evaluate(snapshot);
    expect(outcome.status).toBe("FAIL");
  });

  it("PiiWithoutBasisRule fails on CRITICAL findings", async () => {
    const snapshot = baseSnapshot();
    snapshot.openFindings = [
      {
        id: randomUUID(),
        ruleCode: "VLD-PII-NO-BASIS",
        severity: "CRITICAL",
        status: "OPEN",
        systemId: null,
        dataAssetId: randomUUID(),
        lastSeenAt: new Date(),
      },
    ];
    const outcome = await new PiiWithoutBasisRule().evaluate(snapshot);
    expect(outcome.status).toBe("FAIL");
  });

  it("CatalogFreshnessRule fails when agents exist but no revision", async () => {
    const snapshot = baseSnapshot();
    snapshot.agents = [
      { id: randomUUID(), state: "ONLINE", lastHeartbeatAt: new Date() },
    ];
    snapshot.catalogRevisionAgeHours = null;
    const outcome = await new CatalogFreshnessRule().evaluate(snapshot);
    expect(outcome.status).toBe("FAIL");
  });

  it("AgentHealthRule fails for stale heartbeat", async () => {
    const snapshot = baseSnapshot();
    snapshot.agents = [
      {
        id: randomUUID(),
        state: "ONLINE",
        lastHeartbeatAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      },
    ];
    const outcome = await new AgentHealthRule().evaluate(snapshot);
    expect(outcome.status).toBe("FAIL");
  });

  it("ConsentCacheFreshnessRule fails without fresh ONLINE agent", async () => {
    const snapshot = baseSnapshot();
    snapshot.agents = [
      {
        id: randomUUID(),
        state: "OFFLINE",
        lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
      },
    ];
    const outcome = await new ConsentCacheFreshnessRule().evaluate(snapshot);
    expect(outcome.status).toBe("FAIL");
  });

  it("DsrEscalatedRule fails on escalated findings", async () => {
    const snapshot = baseSnapshot();
    snapshot.openFindings = [
      {
        id: randomUUID(),
        ruleCode: "VLD-DSR-ESCALATED",
        severity: "CRITICAL",
        status: "OPEN",
        systemId: null,
        dataAssetId: null,
        lastSeenAt: new Date(),
      },
    ];
    const outcome = await new DsrEscalatedRule().evaluate(snapshot);
    expect(outcome.status).toBe("FAIL");
  });

  it("DataFlowComplianceRule fails for critical vendor without DPA", async () => {
    const snapshot = baseSnapshot();
    snapshot.vendors = [
      {
        id: randomUUID(),
        name: "Salesforce",
        status: "ACTIVE",
        criticality: "CRITICAL",
        hasActiveDpa: false,
        latestReviewOutcome: null,
        crossBorderAllowed: false,
      },
    ];
    const outcome = await new DataFlowComplianceRule().evaluate(snapshot);
    expect(outcome.status).toBe("FAIL");
  });
});

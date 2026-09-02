import type { ValidationRuleEvaluator } from "../domain/rule-evaluator.interface.js";
import type { RuleEvaluationInput } from "../domain/rule-evaluation.types.js";

const AGENT_OFFLINE_SLA_HOURS = 2;
const CATALOG_STALE_SLA_HOURS = 168; // 7 days
const CONSENT_CACHE_HEARTBEAT_SLA_HOURS = 1;

function findingsFor(input: RuleEvaluationInput, ruleCode: string) {
  return (input.openFindings ?? []).filter(
    (f) =>
      f.ruleCode === ruleCode &&
      (f.status === "OPEN" || f.status === "ACKNOWLEDGED"),
  );
}

/** VLD-UNMAPPED-SYSTEM — discovered systems without TPRM vendor mapping. */
export class UnmappedSystemRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "VLD-UNMAPPED-SYSTEM",
    title: "Discovered systems are mapped to registered vendors",
    description:
      "Agent-discovered data systems must map to a registered vendor or declared processing activity.",
    category: "VENDOR" as const,
    severity: "HIGH" as const,
  };

  async evaluate(input: RuleEvaluationInput) {
    const open = findingsFor(input, this.descriptor.code);
    if (open.length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No unmapped discovered systems.",
      };
    }
    return {
      status: "FAIL" as const,
      score: Math.max(0, 100 - open.length * 15),
      explanation: `${open.length} discovered system(s) are not mapped to registered vendors/TPRM.`,
      evidenceRequired: true,
    };
  }
}

/** VLD-PII-NO-BASIS — high-confidence PII without legal basis / purpose. */
export class PiiWithoutBasisRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "VLD-PII-NO-BASIS",
    title: "PII fields have a documented legal basis",
    description:
      "High-confidence PII discovered by agents must link to a processing activity with a legal basis.",
    category: "PURPOSE" as const,
    severity: "CRITICAL" as const,
  };

  async evaluate(input: RuleEvaluationInput) {
    const open = findingsFor(input, this.descriptor.code);
    if (open.length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No PII-without-basis findings.",
      };
    }
    return {
      status: "FAIL" as const,
      score: Math.max(0, 100 - open.length * 20),
      explanation: `${open.length} field/asset finding(s) report PII without a documented legal basis.`,
      evidenceRequired: true,
    };
  }
}

/** VLD-CATALOG-STALE — catalog freshness SLA. */
export class CatalogFreshnessRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "VLD-CATALOG-STALE",
    title: "Data catalog discovery is fresh",
    description:
      "Organizations with agent mode enabled must receive discovery revisions within the freshness SLA.",
    category: "GOVERNANCE" as const,
    severity: "MEDIUM" as const,
  };

  async evaluate(input: RuleEvaluationInput) {
    const age = input.catalogRevisionAgeHours;
    const hasAgents = (input.agents ?? []).length > 0;
    if (!hasAgents) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No enrolled agents — catalog freshness not applicable.",
      };
    }
    if (age === null) {
      return {
        status: "FAIL" as const,
        score: 0,
        explanation:
          "Agents are enrolled but no catalog revision has been received.",
        evidenceRequired: true,
      };
    }
    if (age > CATALOG_STALE_SLA_HOURS) {
      return {
        status: "FAIL" as const,
        score: 40,
        explanation: `Latest catalog revision is ${Math.round(age)}h old (SLA ${CATALOG_STALE_SLA_HOURS}h).`,
        evidenceRequired: true,
      };
    }
    const drift = findingsFor(input, "VLD-CATALOG-DRIFT");
    if (drift.length > 0) {
      return {
        status: "FAIL" as const,
        score: 60,
        explanation: `${drift.length} catalog drift finding(s) are open.`,
        evidenceRequired: true,
      };
    }
    return {
      status: "PASS" as const,
      score: 100,
      explanation: `Catalog revision age ${Math.round(age)}h within SLA.`,
    };
  }
}

/** VLD-AGENT-HEALTH — agent offline/degraded beyond SLA. */
export class AgentHealthRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "VLD-AGENT-HEALTH",
    title: "Zone agents remain healthy",
    description:
      "Enrolled agents must heartbeat within SLA and not remain OFFLINE/DEGRADED.",
    category: "SECURITY" as const,
    severity: "HIGH" as const,
  };

  async evaluate(input: RuleEvaluationInput) {
    const agents = input.agents ?? [];
    if (agents.length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No enrolled agents.",
      };
    }
    const now = Date.now();
    const unhealthy = agents.filter((a) => {
      if (a.state === "OFFLINE" || a.state === "DEGRADED" || a.state === "REVOKED") {
        return true;
      }
      if (!a.lastHeartbeatAt) return true;
      const ageH =
        (now - new Date(a.lastHeartbeatAt).getTime()) / (60 * 60 * 1000);
      return ageH > AGENT_OFFLINE_SLA_HOURS;
    });
    if (unhealthy.length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: `${agents.length} agent(s) healthy within ${AGENT_OFFLINE_SLA_HOURS}h SLA.`,
      };
    }
    return {
      status: "FAIL" as const,
      score: Math.max(0, 100 - unhealthy.length * 25),
      explanation: `${unhealthy.length}/${agents.length} agent(s) offline, degraded, or past heartbeat SLA.`,
      evidenceRequired: true,
    };
  }
}

/** VLD-CONSENT-CACHE — consent cache sync freshness (agent heartbeats). */
export class ConsentCacheFreshnessRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "VLD-CONSENT-CACHE",
    title: "Consent hot-path cache stays fresh",
    description:
      "When agents are enrolled, at least one ONLINE agent must have heartbeated within the consent-cache SLA.",
    category: "CONSENT" as const,
    severity: "HIGH" as const,
  };

  async evaluate(input: RuleEvaluationInput) {
    const agents = input.agents ?? [];
    if (agents.length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No agents — consent cache freshness not applicable.",
      };
    }
    const onlineFresh = agents.some((a) => {
      if (
        a.state !== "ONLINE" &&
        a.state !== "ENROLLED" &&
        a.state !== "ACTIVE" &&
        a.state !== "PENDING"
      ) {
        return false;
      }
      if (!a.lastHeartbeatAt) return false;
      const ageH =
        (Date.now() - new Date(a.lastHeartbeatAt).getTime()) /
        (60 * 60 * 1000);
      return ageH <= CONSENT_CACHE_HEARTBEAT_SLA_HOURS;
    });
    if (onlineFresh) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "At least one agent heartbeated within consent-cache SLA.",
      };
    }
    return {
      status: "FAIL" as const,
      score: 20,
      explanation: `No agent heartbeated within ${CONSENT_CACHE_HEARTBEAT_SLA_HOURS}h — consent invalidation may be stale.`,
      evidenceRequired: true,
    };
  }
}

/** VLD-DSR-ESCALATED — exhausted DSR agent tasks. */
export class DsrEscalatedRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "VLD-DSR-ESCALATED",
    title: "Escalated DSR agent tasks are resolved",
    description:
      "DSR erasure tasks that exhausted agent retries must be closed or remediating.",
    category: "RIGHTS" as const,
    severity: "CRITICAL" as const,
  };

  async evaluate(input: RuleEvaluationInput) {
    const open = findingsFor(input, this.descriptor.code);
    if (open.length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No escalated DSR agent findings.",
      };
    }
    return {
      status: "FAIL" as const,
      score: 0,
      explanation: `${open.length} escalated DSR agent task finding(s) require human resolution.`,
      evidenceRequired: true,
    };
  }
}

/** VLD-DATA-FLOW — discovered flows vs DPA / cross-border flags. */
export class DataFlowComplianceRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "VLD-DATA-FLOW",
    title: "Discovered data flows comply with vendor DPAs",
    description:
      "Critical vendors without active DPAs or with uncontrolled cross-border transfers fail continuous monitoring.",
    category: "VENDOR" as const,
    severity: "HIGH" as const,
  };

  async evaluate(input: RuleEvaluationInput) {
    const vendors = input.vendors ?? [];
    if (vendors.length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No vendors registered.",
      };
    }
    const criticalMissingDpa = vendors.filter(
      (v) =>
        v.status === "ACTIVE" &&
        (v.criticality === "CRITICAL" || v.criticality === "HIGH") &&
        !v.hasActiveDpa,
    );
    if (criticalMissingDpa.length > 0) {
      return {
        status: "FAIL" as const,
        score: Math.max(0, 100 - criticalMissingDpa.length * 20),
        explanation: `${criticalMissingDpa.length} high/critical vendor(s) lack an active DPA for discovered data flows.`,
        evidenceRequired: true,
      };
    }
    return {
      status: "PASS" as const,
      score: 100,
      explanation: "High/critical vendors have active DPAs for data flows.",
    };
  }
}

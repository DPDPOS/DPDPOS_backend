import type { ValidationRuleEvaluator } from "../domain/rule-evaluator.interface.js";
import type {
  ControlValidationSnapshot,
  RuleEvaluationInput,
} from "../domain/rule-evaluation.types.js";

const ACTIVE = new Set(["IN_PROGRESS", "IMPLEMENTED", "VERIFIED"]);
const DONE = new Set(["IMPLEMENTED", "VERIFIED"]);

function findControl(
  input: RuleEvaluationInput,
  code: string,
): ControlValidationSnapshot | undefined {
  return input.controls.find((c) => c.code === code);
}

function controlProgressFail(
  control: ControlValidationSnapshot | undefined,
  code: string,
  label: string,
) {
  if (!control) {
    return {
      status: "FAIL" as const,
      score: 0,
      explanation: `Framework control ${code} (${label}) is missing from the published programme.`,
      evidenceRequired: true,
    };
  }
  if (!ACTIVE.has(control.status)) {
    return {
      status: "FAIL" as const,
      score: 20,
      explanation: `${code} (${label}) is ${control.status}. Advance it and attach proof.`,
      evidenceRequired: true,
    };
  }
  if (control.approvedEvidenceCount === 0) {
    return {
      status: "FAIL" as const,
      score: 50,
      explanation: `${code} is ${control.status} but has no approved/locked evidence.`,
      evidenceRequired: true,
    };
  }
  return null;
}

/** DPDP Rule 7 — breach notification readiness (72-hour SLA capability). */
export class BreachNotificationReadyRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "breach-notification-ready",
    title: "Breach notification procedure ready",
    description:
      "Organisation must maintain a breach response control capable of notifying within 72 hours (DPDP Rule 7).",
    category: "BREACH",
    severity: "CRITICAL",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    const fail = controlProgressFail(
      findControl(input, "CTRL-BREACH"),
      "CTRL-BREACH",
      "Breach notification",
    );
    if (fail) return fail;
    return {
      status: "PASS" as const,
      score: 100,
      explanation: "Breach notification control is active with approved evidence.",
    };
  }
}

/** DPDP Rule 6 — encryption / security safeguards. */
export class EncryptionSafeguardsRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "encryption-safeguards",
    title: "Encryption / security safeguards",
    description:
      "High-sensitivity assets require encryption safeguards (CTRL-ENCRYPTION or CTRL-SECURITY).",
    category: "SECURITY",
    severity: "HIGH",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    const sensitive = input.dataAssets.filter(
      (a) =>
        !a.deletedAt &&
        (a.sensitivity === "HIGH" ||
          a.sensitivity === "CRITICAL" ||
          a.category === "PERSONAL" ||
          a.category === "SENSITIVE"),
    );

    if (sensitive.length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No high-sensitivity assets registered; encryption check skipped.",
      };
    }

    const encryption = findControl(input, "CTRL-ENCRYPTION");
    const security = findControl(input, "CTRL-SECURITY");
    const primary = encryption ?? security;
    const code = encryption ? "CTRL-ENCRYPTION" : "CTRL-SECURITY";

    const fail = controlProgressFail(primary, code, "Security safeguards");
    if (fail) {
      return {
        ...fail,
        explanation: `${fail.explanation} (${sensitive.length} sensitive asset(s) in inventory).`,
      };
    }
    return {
      status: "PASS" as const,
      score: 100,
      explanation: `Security safeguards active for ${sensitive.length} sensitive asset(s).`,
    };
  }
}

/** DPDP s.16 — cross-border transfer controls. */
export class CrossBorderTransferControlledRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "cross-border-transfer-controlled",
    title: "Cross-border transfers controlled",
    description:
      "Where vendors allow cross-border transfer or list restricted countries, CTRL-TRANSFER must be in progress with evidence.",
    category: "TRANSFER",
    severity: "HIGH",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    const { env } = await import("../../../config/env.js");
    const restricted = new Set(
      env.RESTRICTED_TRANSFER_COUNTRIES.map((c) => c.toUpperCase()),
    );

    const crossBorderVendors = (input.vendors ?? []).filter(
      (v) => v.crossBorderAllowed && v.status !== "INACTIVE",
    );
    const restrictedCountryVendors = (input.vendors ?? []).filter((v) => {
      if (v.status === "INACTIVE") return false;
      return (v.countries ?? []).some((c) =>
        restricted.has(String(c).toUpperCase()),
      );
    });
    const foreignRecipients = input.processingActivities.filter(
      (a) =>
        !a.deletedAt &&
        typeof a.recipientType === "string" &&
        /cross.?border|foreign|international|transfer/i.test(a.recipientType),
    );

    const restrictedCountryAssets = input.dataAssets.filter((a) => {
      if (a.deletedAt) return false;
      const countries = (a as { countries?: string[] }).countries ?? [];
      return countries.some(
        (c) =>
          restricted.has(String(c).toUpperCase()) ||
          String(c).toUpperCase() !== "IN",
      );
    });

    if (
      crossBorderVendors.length === 0 &&
      foreignRecipients.length === 0 &&
      restrictedCountryVendors.length === 0 &&
      restrictedCountryAssets.length === 0
    ) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No cross-border transfers detected in vendors or activities.",
      };
    }

    const fail = controlProgressFail(
      findControl(input, "CTRL-TRANSFER"),
      "CTRL-TRANSFER",
      "Cross-border transfer",
    );
    if (fail) {
      return {
        ...fail,
        explanation: `${fail.explanation} (${crossBorderVendors.length} cross-border vendor(s), ${restrictedCountryVendors.length} restricted-country vendor(s), ${restrictedCountryAssets.length} foreign/restricted asset(s), ${foreignRecipients.length} activity(ies)).`,
      };
    }
    return {
      status: "PASS" as const,
      score: 100,
      explanation: "Cross-border transfer control is active with evidence.",
    };
  }
}

/** DPDP s.9 — children's data. */
export class ChildrenDataProtectedRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "children-data-protected",
    title: "Children's data protections",
    description:
      "If the organisation processes children's data, CTRL-CHILDREN must be implemented with evidence.",
    category: "CHILDREN",
    severity: "CRITICAL",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    if (!input.organization.processesChildrenData) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "Organisation profile does not indicate children's data processing.",
      };
    }

    const control = findControl(input, "CTRL-CHILDREN");
    if (!control || !DONE.has(control.status) || control.approvedEvidenceCount === 0) {
      return {
        status: "FAIL" as const,
        score: 0,
        explanation:
          "Children's data processing is in scope but CTRL-CHILDREN is not implemented with approved evidence (verifiable parental consent required).",
        evidenceRequired: true,
      };
    }
    return {
      status: "PASS" as const,
      score: 100,
      explanation: "Children's data control is implemented with evidence.",
    };
  }
}

/** DPDP s.10 — SDF must appoint a DPO. */
export class SdfDpoAppointedRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "sdf-dpo-appointed",
    title: "SDF Data Protection Officer appointed",
    description:
      "Significant Data Fiduciaries must appoint a DPO (CTRL-SDF-DPO + DPO role user).",
    category: "GOVERNANCE",
    severity: "CRITICAL",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    if (!input.organization.isSignificantDataFiduciary) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "Organisation is not marked as a Significant Data Fiduciary.",
      };
    }

    const control = findControl(input, "CTRL-SDF-DPO");
    const controlOk =
      control && DONE.has(control.status) && control.approvedEvidenceCount > 0;
    const hasDpo = input.organization.hasDpoUser;

    if (!controlOk || !hasDpo) {
      const gaps = [
        !controlOk ? "CTRL-SDF-DPO not implemented with evidence" : null,
        !hasDpo ? "no user with DPO role" : null,
      ]
        .filter(Boolean)
        .join("; ");
      return {
        status: "FAIL" as const,
        score: 0,
        explanation: `SDF obligations unmet: ${gaps}.`,
        evidenceRequired: true,
      };
    }
    return {
      status: "PASS" as const,
      score: 100,
      explanation: "SDF DPO appointed and control evidenced.",
    };
  }
}

/** DPDP s.4 — purpose limitation. */
export class PurposeLimitationDocumentedRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "purpose-limitation-documented",
    title: "Purpose limitation documented",
    description:
      "Every active processing activity must declare a purpose; CTRL-PURPOSE should be progressing.",
    category: "PURPOSE",
    severity: "HIGH",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    const missing = input.processingActivities.filter(
      (a) => !a.deletedAt && !(a.purpose && String(a.purpose).trim()),
    );

    if (missing.length > 0) {
      return {
        status: "FAIL" as const,
        score: 0,
        explanation: `${missing.length} processing activity(ies) lack a documented purpose.`,
        evidenceRequired: true,
      };
    }

    if (input.processingActivities.filter((a) => !a.deletedAt).length === 0) {
      return {
        status: "PASS" as const,
        score: 100,
        explanation: "No processing activities registered yet.",
      };
    }

    const fail = controlProgressFail(
      findControl(input, "CTRL-PURPOSE"),
      "CTRL-PURPOSE",
      "Purpose limitation",
    );
    if (fail) return fail;

    return {
      status: "PASS" as const,
      score: 100,
      explanation: "Purposes documented and purpose-limitation control active.",
    };
  }
}

/** DPDP Rule 8 — automated deletion / purpose expiry. */
export class AutoDeletionEnforcedRule implements ValidationRuleEvaluator {
  readonly descriptor = {
    code: "auto-deletion-enforced",
    title: "Automated deletion / purpose expiry",
    description:
      "Retention must be set on assets and CTRL-AUTO-DELETE must progress; open erasure requests are tracked.",
    category: "RETENTION",
    severity: "HIGH",
  } as const;

  async evaluate(input: RuleEvaluationInput) {
    const assetsMissingRetention = input.dataAssets.filter(
      (a) => !a.deletedAt && !(a.retentionPeriod && String(a.retentionPeriod).trim()),
    );

    const fail = controlProgressFail(
      findControl(input, "CTRL-AUTO-DELETE"),
      "CTRL-AUTO-DELETE",
      "Automated deletion",
    );

    if (assetsMissingRetention.length > 0 || fail) {
      const parts = [
        assetsMissingRetention.length
          ? `${assetsMissingRetention.length} asset(s) missing retention metadata`
          : null,
        fail?.explanation ?? null,
        input.openErasureRequests > 0
          ? `${input.openErasureRequests} open erasure request(s)`
          : null,
      ].filter(Boolean);
      return {
        status: "FAIL" as const,
        score: assetsMissingRetention.length && fail ? 0 : 35,
        explanation: parts.join(". ") + ".",
        evidenceRequired: true,
      };
    }

    return {
      status: "PASS" as const,
      score: 100,
      explanation: "Retention metadata present and auto-deletion control evidenced.",
    };
  }
}

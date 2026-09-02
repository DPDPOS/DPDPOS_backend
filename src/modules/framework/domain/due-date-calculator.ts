import { DPDP_REGULATORY_DEADLINES } from "../../../shared/domain/dpdp.constants.js";
import type {
  ControlTemplate,
  DataSensitivity,
  FrameworkProfile,
  MaturityLevel,
} from "./templates.js";

export type CompanySize = "small" | "medium" | "large";

const SIZE_MULTIPLIER: Record<CompanySize, number> = {
  small: 1.0,
  medium: 0.85,
  large: 0.7,
};

const MATURITY_MULTIPLIER: Record<MaturityLevel, number> = {
  basic: 1.2,
  intermediate: 1.0,
  advanced: 0.85,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Map control codes to applicable regulatory deadline caps. */
const REGULATORY_CAPS: Record<string, keyof typeof DPDP_REGULATORY_DEADLINES> =
  {
    "CTRL-CONSENT-MGR": "CONSENT_MANAGER_REGISTRATION",
  };

function riskMultiplier(profile: FrameworkProfile): number {
  if (profile.isSdf || profile.dataSensitivity === "high") return 0.8;
  return 1.0;
}

export function calculateDueDays(
  template: ControlTemplate,
  profile: FrameworkProfile,
): number {
  const size = profile.companySize ?? "medium";
  const raw =
    template.dueDaysFromGenerate *
    SIZE_MULTIPLIER[size] *
    MATURITY_MULTIPLIER[profile.maturityLevel] *
    riskMultiplier(profile);

  return Math.max(7, Math.round(raw));
}

export function calculateDueAt(
  template: ControlTemplate,
  profile: FrameworkProfile,
  generatedAt: Date,
): Date {
  const dueDays = calculateDueDays(template, profile);
  let dueAt = new Date(generatedAt.getTime() + dueDays * MS_PER_DAY);

  const capKey = REGULATORY_CAPS[template.code];
  if (capKey) {
    const capDate = new Date(DPDP_REGULATORY_DEADLINES[capKey]);
    if (dueAt > capDate) {
      dueAt = capDate;
    }
  }

  const fullCompliance = new Date(DPDP_REGULATORY_DEADLINES.FULL_COMPLIANCE);
  if (dueAt > fullCompliance) {
    dueAt = fullCompliance;
  }

  return dueAt;
}

export function sensitivityRank(
  sensitivity: DataSensitivity,
): number {
  return { low: 1, medium: 2, high: 3 }[sensitivity];
}

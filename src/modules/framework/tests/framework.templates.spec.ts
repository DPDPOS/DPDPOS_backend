import { describe, expect, it } from "vitest";
import {
  CONTROL_TEMPLATES,
  selectTemplatesForProfile,
} from "../domain/templates.js";
import { calculateDueDays } from "../domain/due-date-calculator.js";
import { DPDP_CHILD_AGE_THRESHOLD } from "../../../shared/domain/dpdp.constants.js";
import { resolveFrameworkCode } from "../../controls/domain/control-catalog.js";

const baseProfile = {
  industryProfile: "retail",
  maturityLevel: "basic" as const,
  dataSensitivity: "low" as const,
  departmentCount: 0,
  processorCount: 0,
  isSdf: false,
  processesChildrenData: false,
  crossBorderTransfers: false,
  companySize: "medium" as const,
  includeNistControls: false,
};

describe("framework template catalog", () => {
  it("always includes core foundation and legal-critical controls", () => {
    const selected = selectTemplatesForProfile(baseProfile);

    const codes = selected.controls.map((c) => c.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "CTRL-NOTICE",
        "CTRL-CONSENT",
        "CTRL-CONSENT-MGR",
        "CTRL-PURPOSE",
        "CTRL-INVENTORY",
        "CTRL-SECURITY",
        "CTRL-BREACH",
        "CTRL-RETENTION",
        "CTRL-AUTO-DELETE",
        "CTRL-RIGHTS",
        "CTRL-GRIEVANCE",
      ]),
    );
    expect(codes).not.toContain("CTRL-SDF-DPO");
    expect(codes).not.toContain("CTRL-PROCESSOR");
    expect(codes).not.toContain("CTRL-TRAINING");
    expect(selected.requirements.length).toBeGreaterThan(0);
  });

  it("adds SDF and processor controls when profile requires them", () => {
    const selected = selectTemplatesForProfile({
      ...baseProfile,
      industryProfile: "fintech",
      maturityLevel: "advanced",
      dataSensitivity: "high",
      departmentCount: 5,
      processorCount: 2,
      isSdf: true,
      crossBorderTransfers: true,
    });

    const codes = selected.controls.map((c) => c.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "CTRL-SDF-DPO",
        "CTRL-SDF-AUDIT",
        "CTRL-SDF-DPIA",
        "CTRL-PROCESSOR",
        "CTRL-TRAINING",
        "CTRL-TRANSFER",
      ]),
    );
    expect(selected.controls.length).toBeGreaterThanOrEqual(15);
  });

  it("includes children's control when processesChildrenData is true regardless of sensitivity", () => {
    const withChildren = selectTemplatesForProfile({
      ...baseProfile,
      processesChildrenData: true,
      dataSensitivity: "low",
    });
    const withoutChildren = selectTemplatesForProfile(baseProfile);

    expect(withChildren.controls.some((c) => c.code === "CTRL-CHILDREN")).toBe(
      true,
    );
    expect(withoutChildren.controls.some((c) => c.code === "CTRL-CHILDREN")).toBe(
      false,
    );
  });

  it("includes transfer control when crossBorderTransfers is true at basic maturity", () => {
    const selected = selectTemplatesForProfile({
      ...baseProfile,
      crossBorderTransfers: true,
      maturityLevel: "basic",
      dataSensitivity: "low",
    });

    expect(selected.controls.some((c) => c.code === "CTRL-TRANSFER")).toBe(true);
  });

  it("uses Governance phase instead of Significant Fiduciary", () => {
    const sdf = selectTemplatesForProfile({
      ...baseProfile,
      isSdf: true,
      maturityLevel: "advanced",
    });
    const phases = sdf.controls.map((c) => c.phase);
    expect(phases).not.toContain("Significant Fiduciary");
    expect(phases).not.toContain("Oversight");
    expect(phases).toContain("Governance");
    expect(sdf.controls.find((c) => c.code === "CTRL-SDF-DPO")?.phase).toBe(
      "Foundation",
    );
  });

  it("references DPDP child age threshold in children's requirement", () => {
    const req = selectTemplatesForProfile({
      ...baseProfile,
      processesChildrenData: true,
    }).requirements.find((r) => r.code === "REQ-CHILDREN-01");
    expect(req?.description).toContain(String(DPDP_CHILD_AGE_THRESHOLD));
  });

  it("risk-adjusts due dates by company size", () => {
    const tpl = CONTROL_TEMPLATES.find((c) => c.code === "CTRL-NOTICE")!;
    const small = calculateDueDays(tpl, { ...baseProfile, companySize: "small" });
    const large = calculateDueDays(tpl, { ...baseProfile, companySize: "large" });
    expect(large).toBeLessThan(small);
  });

  it("maps assessment codes to framework codes via catalog", () => {
    expect(resolveFrameworkCode("DPDP-CONSENT-NOTICE")).toBe("CTRL-NOTICE");
    expect(resolveFrameworkCode("DPDP-BREACH-NOTIFY")).toBe("CTRL-BREACH");
    expect(resolveFrameworkCode("DPDP-CONSENT-MGR")).toBe("CTRL-CONSENT-MGR");
  });
});

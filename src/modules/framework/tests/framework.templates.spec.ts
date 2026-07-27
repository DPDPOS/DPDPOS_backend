import { describe, expect, it } from "vitest";
import {
  CONTROL_TEMPLATES,
  selectTemplatesForProfile,
} from "../domain/templates.js";

describe("framework template catalog", () => {
  it("always includes core foundation controls", () => {
    const selected = selectTemplatesForProfile({
      industryProfile: "retail",
      maturityLevel: "basic",
      dataSensitivity: "low",
      departmentCount: 0,
      processorCount: 0,
      isSdf: false,
    });

    const codes = selected.controls.map((c) => c.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "CTRL-NOTICE",
        "CTRL-CONSENT",
        "CTRL-PURPOSE",
        "CTRL-INVENTORY",
        "CTRL-SECURITY",
        "CTRL-RETENTION",
        "CTRL-RIGHTS",
      ]),
    );
    expect(codes).not.toContain("CTRL-SDF-DPO");
    expect(codes).not.toContain("CTRL-PROCESSOR");
    expect(codes).not.toContain("CTRL-TRAINING");
    expect(selected.requirements.length).toBeGreaterThan(0);
  });

  it("adds SDF and processor controls when profile requires them", () => {
    const selected = selectTemplatesForProfile({
      industryProfile: "fintech",
      maturityLevel: "advanced",
      dataSensitivity: "high",
      departmentCount: 5,
      processorCount: 2,
      isSdf: true,
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
    expect(selected.controls.length).toBeGreaterThanOrEqual(12);
  });

  it("filters industry-specific children's data control", () => {
    const education = selectTemplatesForProfile({
      industryProfile: "education",
      maturityLevel: "basic",
      dataSensitivity: "medium",
      departmentCount: 2,
      processorCount: 0,
      isSdf: false,
    });
    const retail = selectTemplatesForProfile({
      industryProfile: "retail",
      maturityLevel: "basic",
      dataSensitivity: "medium",
      departmentCount: 2,
      processorCount: 0,
      isSdf: false,
    });

    expect(education.controls.some((c) => c.code === "CTRL-CHILDREN")).toBe(true);
    expect(retail.controls.some((c) => c.code === "CTRL-CHILDREN")).toBe(false);
    expect(CONTROL_TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });
});

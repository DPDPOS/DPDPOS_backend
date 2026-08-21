import { describe, expect, it } from "vitest";
import {
  normalizeIndustry,
  INDUSTRY_DOMAIN_KEYS,
} from "../domain/industry-domains.js";
import {
  getQuestionsForDomain,
  buildQuestionnaireCatalogPayload,
} from "../domain/questionnaire-catalog.js";

describe("industry questionnaire catalog", () => {
  it("normalises common free-text industries", () => {
    expect(normalizeIndustry("Financial Services")).toBe("banking_finance");
    expect(normalizeIndustry("fintech")).toBe("banking_finance");
    expect(normalizeIndustry("Healthcare")).toBe("healthcare");
    expect(normalizeIndustry("e-commerce")).toBe("ecommerce_retail");
    expect(normalizeIndustry("EdTech")).toBe("education_edtech");
    expect(normalizeIndustry("SaaS")).toBe("it_saas");
    expect(normalizeIndustry("telecom")).toBe("telecom");
    expect(normalizeIndustry("Automobile")).toBe("automobile");
    expect(normalizeIndustry("Food Manufacturing")).toBe("food_manufacturing");
    expect(normalizeIndustry("Hotels")).toBe("hotels");
    expect(normalizeIndustry("Space Technology")).toBe("space_technology");
    expect(normalizeIndustry("aerospace")).toBe("space_technology");
    expect(normalizeIndustry("banking_finance")).toBe("banking_finance");
    expect(normalizeIndustry("unknown widget")).toBeNull();
    expect(normalizeIndustry(null)).toBeNull();
  });

  it("merges core + industry pack for each domain", () => {
    const coreOnly = getQuestionsForDomain(null);
    expect(coreOnly.some((q) => q.code === "Q-NOTICE-PUBLISHED")).toBe(true);
    expect(coreOnly.some((q) => q.industryDomain)).toBe(false);

    for (const key of INDUSTRY_DOMAIN_KEYS) {
      const merged = getQuestionsForDomain(key);
      expect(merged.length).toBeGreaterThan(coreOnly.length);
      expect(merged.some((q) => q.industryDomain === key)).toBe(true);
      expect(merged.some((q) => q.stageId === "industry_context")).toBe(true);
    }
  });

  it("builds catalog payload with domain label", () => {
    const payload = buildQuestionnaireCatalogPayload("healthcare");
    expect(payload.industryDomain).toBe("healthcare");
    expect(payload.industryDomainLabel).toMatch(/Healthcare/i);
    expect(payload.stages.some((s) => s.stageId === "industry_context")).toBe(
      true,
    );
  });
});

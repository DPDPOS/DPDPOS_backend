import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const contractsDir = join(root, "docs/contracts/agent");

const schemas = [
  "discovery-report.schema.json",
  "dsr-task.schema.json",
  "dsr-result.schema.json",
  "agent-health.schema.json",
  "compliance-finding.schema.json",
] as const;

describe("agent control-plane JSON Schema contracts", () => {
  for (const name of schemas) {
    it(`parses ${name}`, () => {
      const raw = readFileSync(join(contractsDir, name), "utf8");
      const json = JSON.parse(raw) as Record<string, unknown>;
      expect(json.$schema || json.type || json.properties).toBeTruthy();
    });
  }

  it("discovery report sample validates required top-level keys in schema", () => {
    const schema = JSON.parse(
      readFileSync(join(contractsDir, "discovery-report.schema.json"), "utf8"),
    ) as { required?: string[] };
    expect(schema.required ?? []).toEqual(
      expect.arrayContaining(["reportId", "agentId", "discoveredAt"]),
    );
  });

  it("compliance finding schema documents dedupeKey", () => {
    const schema = JSON.parse(
      readFileSync(join(contractsDir, "compliance-finding.schema.json"), "utf8"),
    ) as { properties?: Record<string, unknown>; required?: string[] };
    expect(schema.properties?.dedupeKey).toBeTruthy();
  });
});

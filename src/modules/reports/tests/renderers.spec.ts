import { describe, expect, it } from "vitest";
import { renderCsv } from "../../../infrastructure/reporting/csv-renderer.js";
import { renderExcel } from "../../../infrastructure/reporting/excel-renderer.js";
import { renderPdf } from "../../../infrastructure/reporting/pdf-renderer.js";

describe("report renderers", () => {
  it("renders downloadable PDF and Excel-compatible artifacts", async () => {
    await expect(
      renderPdf([{ title: "Compliance summary" }]),
    ).resolves.toSatisfy(
      (output: Buffer) => output.subarray(0, 5).toString() === "%PDF-",
    );
    await expect(
      renderExcel([{ title: "Compliance summary" }]),
    ).resolves.toSatisfy((output: Buffer) =>
      output.toString().includes("<Workbook"),
    );
  });

  it("formats sectioned PDF as readable labels, not raw JSON", async () => {
    const pdf = await renderPdf(
      [
        {
          section: "Executive Summary",
          complianceScorePercent: 67,
          openViolations: 5,
        },
        {
          section: "Phase Progress",
          phase: "Foundation",
          progressPercent: 80,
          gateMet: "Yes",
        },
      ],
      { title: "Board Pack" },
    );
    const text = pdf.toString("latin1");
    expect(text).toContain("Board Pack");
    expect(text).toContain("EXECUTIVE SUMMARY");
    expect(text).toContain("Compliance Score Percent");
    expect(text).not.toContain('"section":"Executive Summary"');
  });

  it("flattens sectioned CSV to section,metric,value", () => {
    const csv = renderCsv([
      { section: "Executive Summary", complianceScorePercent: 67 },
      { section: "Phase Progress", phase: "Foundation", progressPercent: 80 },
    ]);
    expect(csv.split("\n")[0]).toBe("section,metric,value");
    expect(csv).toContain("Executive Summary");
    expect(csv).toContain("Compliance Score Percent");
    expect(csv).toContain("67");
  });
});

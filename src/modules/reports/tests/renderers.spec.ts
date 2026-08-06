import { describe, expect, it } from "vitest";
import { renderExcel } from "../../../infrastructure/reporting/excel-renderer.js";
import { renderPdf } from "../../../infrastructure/reporting/pdf-renderer.js";

describe("report renderers", () => {
  it("renders downloadable PDF and Excel-compatible artifacts", async () => {
    await expect(renderPdf([{ title: "Compliance summary" }])).resolves.toSatisfy((output: Buffer) => output.subarray(0, 5).toString() === "%PDF-");
    await expect(renderExcel([{ title: "Compliance summary" }])).resolves.toSatisfy((output: Buffer) => output.toString().includes("<Workbook"));
  });
});

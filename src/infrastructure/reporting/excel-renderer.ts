function escapeXml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Produces Excel-readable SpreadsheetML without adding a heavy workbook dependency. */
export async function renderExcel(input: unknown): Promise<Buffer> {
  const rows = Array.isArray(input) ? input as Record<string, unknown>[] : [input as Record<string, unknown>];
  const headers = Object.keys(rows[0] ?? {});
  const renderRow = (values: unknown[]) => `<Row>${values.map((value) => `<Cell><Data ss:Type="String">${escapeXml(typeof value === "object" ? JSON.stringify(value) : value)}</Data></Cell>`).join("")}</Row>`;
  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Report"><Table>${renderRow(headers)}${rows.map((row) => renderRow(headers.map((header) => row[header]))).join("")}</Table></Worksheet></Workbook>`;
  return Buffer.from(xml, "utf8");
}

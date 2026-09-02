function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSectionedReport(rows: Record<string, unknown>[]): boolean {
  if (rows.length === 0) return false;
  const withSection = rows.filter((r) => typeof r.section === "string").length;
  return withSection >= Math.ceil(rows.length * 0.5);
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function cell(value: unknown): string {
  const text =
    typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : String(value ?? "");
  return `<Cell><Data ss:Type="String">${escapeXml(text)}</Data></Cell>`;
}

function renderRow(values: unknown[]): string {
  return `<Row>${values.map(cell).join("")}</Row>`;
}

/** Produces Excel-readable SpreadsheetML without adding a heavy workbook dependency. */
export async function renderExcel(input: unknown): Promise<Buffer> {
  const rows = (
    Array.isArray(input) ? input : [input]
  ) as Record<string, unknown>[];

  let tableXml: string;

  if (isSectionedReport(rows)) {
    const body = rows.flatMap((row) => {
      const section = String(row.section ?? "");
      return Object.entries(row)
        .filter(([k, v]) => k !== "section" && v !== null && v !== undefined && v !== "")
        .map(([key, value]) =>
          renderRow([section, humanizeKey(key), value]),
        );
    });
    tableXml = `${renderRow(["Section", "Metric", "Value"])}${body.join("")}`;
  } else {
    const headerSet = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) headerSet.add(key);
    }
    const headers = [...headerSet];
    tableXml = `${renderRow(headers)}${rows
      .map((row) => renderRow(headers.map((h) => row[h] ?? "")))
      .join("")}`;
  }

  const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Report"><Table>${tableXml}</Table></Worksheet></Workbook>`;
  return Buffer.from(xml, "utf8");
}

/**
 * CSV renderer that handles heterogeneous report rows.
 * - Homogeneous tables keep a wide header row.
 * - Mixed "sectioned" reports (board pack / compliance summary) flatten to
 *   section,metric,value so every row is readable in Excel.
 */

function isSectionedReport(rows: Record<string, unknown>[]): boolean {
  if (rows.length === 0) return false;
  const withSection = rows.filter((r) => typeof r.section === "string").length;
  return withSection >= Math.ceil(rows.length * 0.5);
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return JSON.stringify(str);
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderSectionedCsv(rows: Record<string, unknown>[]): string {
  const lines = ["section,metric,value"];
  for (const row of rows) {
    const section = String(row.section ?? "");
    for (const [key, value] of Object.entries(row)) {
      if (key === "section") continue;
      if (value === null || value === undefined || value === "") continue;
      lines.push(
        [escapeCell(section), escapeCell(humanizeKey(key)), escapeCell(value)].join(
          ",",
        ),
      );
    }
  }
  return lines.join("\n");
}

function renderTabularCsv(rows: Record<string, unknown>[]): string {
  const headerSet = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) headerSet.add(key);
  }
  const headers = [...headerSet];
  if (headers.length === 0) return "";

  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) =>
      headers.map((h) => escapeCell(row[h] ?? "")).join(","),
    ),
  ];
  return lines.join("\n");
}

export function renderCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  if (isSectionedReport(rows)) return renderSectionedCsv(rows);
  return renderTabularCsv(rows);
}

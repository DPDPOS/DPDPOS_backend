function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E\n]/g, "?");
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function wrapLine(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += maxChars) {
        lines.push(word.slice(i, i + maxChars));
      }
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

type PdfLine = { text: string; style: "title" | "section" | "body" | "blank" };

function rowsToLines(
  rows: Record<string, unknown>[],
  title?: string,
): PdfLine[] {
  const lines: PdfLine[] = [];
  if (title) {
    lines.push({ text: title, style: "title" });
    lines.push({
      text: `Generated ${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`,
      style: "body",
    });
    lines.push({ text: "", style: "blank" });
  }

  let lastSection: string | null = null;

  for (const row of rows) {
    const entries = Object.entries(row).filter(
      ([, v]) => v !== null && v !== undefined && v !== "",
    );
    if (entries.length === 0) continue;

    const section =
      typeof row.section === "string" ? (row.section as string) : null;
    const rest = entries.filter(([k]) => k !== "section");

    if (section && section !== lastSection) {
      if (lastSection !== null) lines.push({ text: "", style: "blank" });
      lines.push({ text: section.toUpperCase(), style: "section" });
      lastSection = section;
    } else if (!section && lastSection !== null) {
      lines.push({ text: "", style: "blank" });
      lastSection = null;
    }

    if (rest.length === 0) continue;

    // Compact one-liners for simple metric rows (severity/count, phase/progress, etc.)
    if (rest.length <= 4 && section) {
      const summary = rest
        .map(([k, v]) => `${humanizeKey(k)}: ${formatValue(v)}`)
        .join("   |   ");
      for (const wrapped of wrapLine(summary, 88)) {
        lines.push({ text: wrapped, style: "body" });
      }
    } else {
      for (const [key, value] of rest) {
        const label = humanizeKey(key);
        const formatted = formatValue(value);
        const wrapped = wrapLine(`${label}: ${formatted}`, 88);
        for (const line of wrapped) {
          lines.push({ text: line, style: "body" });
        }
      }
    }
  }

  if (lines.length === 0) {
    lines.push({ text: "No data found for this report.", style: "body" });
  }

  return lines;
}

function buildPageContent(pageLines: PdfLine[], pageNumber: number, totalPages: number): string {
  const ops: string[] = ["BT"];
  let y = 760;
  let first = true;

  for (const line of pageLines) {
    if (line.style === "blank") {
      y -= 10;
      continue;
    }

    const fontSize = line.style === "title" ? 14 : line.style === "section" ? 11 : 10;
    const leading = line.style === "title" ? 18 : line.style === "section" ? 16 : 13;

    if (y < 56) break;

    ops.push(`/F1 ${fontSize} Tf`);
    if (first) {
      ops.push(`50 ${y} Td`);
      first = false;
    } else {
      ops.push(`0 -${leading} Td`);
    }
    ops.push(`(${escapePdfText(line.text)}) Tj`);
    y -= leading;
  }

  // Footer page number — separate text object at bottom
  ops.push("ET");
  ops.push("BT");
  ops.push("/F1 8 Tf");
  ops.push(`50 36 Td`);
  ops.push(`(${escapePdfText(`Page ${pageNumber} of ${totalPages}`)}) Tj`);
  ops.push("ET");

  return ops.join("\n");
}

/**
 * Renders a readable multi-page text PDF for compliance exports.
 * Sectioned rows (with a `section` field) become headed blocks; other rows
 * render as labeled key/value lines — never raw JSON dumps.
 */
export async function renderPdf(
  input: unknown,
  options?: { title?: string },
): Promise<Buffer> {
  const rows = (Array.isArray(input) ? input : [input]).filter(
    (row): row is Record<string, unknown> =>
      row !== null && typeof row === "object",
  );

  const allLines = rowsToLines(rows, options?.title ?? "DPDPOS Report");

  // Paginate: ~50 body lines per page at 10pt with margins.
  const LINES_PER_PAGE = 48;
  const pages: PdfLine[][] = [];
  let bucket: PdfLine[] = [];
  let used = 0;

  for (const line of allLines) {
    const cost = line.style === "blank" ? 0.5 : line.style === "title" ? 1.4 : line.style === "section" ? 1.2 : 1;
    if (used + cost > LINES_PER_PAGE && bucket.length > 0) {
      pages.push(bucket);
      bucket = [];
      used = 0;
    }
    bucket.push(line);
    used += cost;
  }
  if (bucket.length > 0) pages.push(bucket);
  if (pages.length === 0) pages.push([{ text: "No data.", style: "body" }]);

  const pageContents = pages.map((pageLines, i) =>
    buildPageContent(pageLines, i + 1, pages.length),
  );

  // Object layout:
  // 1 Catalog, 2 Pages, 3..N+2 Page objects, N+3 Font, then content streams
  const pageCount = pages.length;
  const fontObjNum = pageCount + 3;
  const firstContentObj = fontObjNum + 1;

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>"); // 1

  const pageKids = Array.from(
    { length: pageCount },
    (_, i) => `${3 + i} 0 R`,
  ).join(" ");
  objects.push(`<< /Type /Pages /Kids [${pageKids}] /Count ${pageCount} >>`); // 2

  for (let i = 0; i < pageCount; i += 1) {
    const contentRef = firstContentObj + i;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /Contents ${contentRef} 0 R >>`,
    );
  }

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const content of pageContents) {
    objects.push(
      `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
    );
  }

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "utf8")];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(
      Buffer.from(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`, "utf8"),
    );
  }
  const xrefOffset = Buffer.concat(chunks).length;
  const xrefEntries = offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, "0")} 00000 n `)
    .join("\n");
  chunks.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xrefEntries}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      "utf8",
    ),
  );
  return Buffer.concat(chunks);
}

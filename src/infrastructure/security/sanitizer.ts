export function sanitizeString(input: string): string {
  return input.replace(/[<>]/g, "").trim();
}

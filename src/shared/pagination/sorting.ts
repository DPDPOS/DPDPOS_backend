export function parseSort(
  sort: string | undefined,
  allowed: readonly string[],
): { field: string; direction: "asc" | "desc" } | undefined {
  if (!sort) return undefined;
  const direction = sort.startsWith("-") ? "desc" : "asc";
  const field = sort.startsWith("-") ? sort.slice(1) : sort;
  if (!allowed.includes(field)) {
    return undefined;
  }
  return { field, direction };
}

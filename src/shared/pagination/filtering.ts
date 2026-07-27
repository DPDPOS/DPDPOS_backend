export function pickAllowedFilters<T extends Record<string, unknown>>(
  input: T,
  allowed: readonly (keyof T)[],
): Partial<T> {
  const result: Partial<T> = {};
  for (const key of allowed) {
    if (input[key] !== undefined) {
      result[key] = input[key];
    }
  }
  return result;
}

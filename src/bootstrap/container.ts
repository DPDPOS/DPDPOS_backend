/**
 * Composition root — wire interfaces to concrete adapters as modules land.
 * Keep this file as the only place that knows every module at once.
 */
export const container = {
  // populated incrementally: repositories, services, adapters
} as const;

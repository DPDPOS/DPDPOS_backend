import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    extensions: [".ts", ".js"],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts", "src/modules/**/tests/**/*.spec.ts"],
    exclude: ["node_modules", "dist"],
    // Force MFA on for auth challenge specs even when local .env disables it.
    env: {
      AUTH_MFA_ENABLED: "true",
    },
    // HTTP/integration specs share Redis/DB under parallel file runners.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

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
  },
});

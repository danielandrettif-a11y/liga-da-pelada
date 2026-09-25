import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../../../src") } },
  test: { include: ["manager/staged/phase-2/**/*.test.ts"] },
});

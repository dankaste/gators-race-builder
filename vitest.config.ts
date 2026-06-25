import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // Engine tests are pure logic; default node environment is fine.
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});

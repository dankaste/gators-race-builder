import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Engine tests are pure logic; default node environment is fine.
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});

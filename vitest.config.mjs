import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: [["text", { skipFull: false }]],
      include: [
        "src/connect.ts",
        "src/util/serial.ts",
        "src/util/format-firmware-title.ts",
        "src/no-port-picked/index.ts",
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});

import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Use happy-dom for hotkey tests that need KeyboardEvent
    projects: [
      {
        test: {
          name: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/core/hotkeys/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "hotkeys",
          include: ["src/core/hotkeys/**/*.test.ts"],
          environment: "happy-dom",
        },
      },
    ],
  },
})

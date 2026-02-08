import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      // Target: 80% (REQ-77). Uncomment when coverage is reached:
      // lines: 80, functions: 80, branches: 80, statements: 80,
    },
  },
});

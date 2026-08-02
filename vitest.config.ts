import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    {
      name: "vitest-css-module-stub",
      enforce: "pre",
      resolveId(id) {
        return id.endsWith(".module.css")
          ? "\0vitest-css-module-stub"
          : undefined;
      },
      load(id) {
        if (id !== "\0vitest-css-module-stub") return undefined;
        return `
          export default new Proxy({}, {
            get: (_target, property) =>
              typeof property === "string" ? property : undefined
          });
        `;
      },
    },
    react(),
  ],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname) },
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true,
    css: false,
    exclude: [
      "e2e/**",
      "node_modules/**",
      ".next/**",
      ".playwright-output/**",
    ],
  },
});

import { defineConfig } from "vitest/config";
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "**/dist/**",
        "**/*.d.ts",
      ],
    },
  },
  
});
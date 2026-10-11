import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    // The Playwright scripts in test/e2e are standalone programs (they launch a
    // browser and call process.exit), not Vitest suites. Their *.test.mjs names
    // match Vitest's default glob, so without this `npm run test` tries to run
    // them as suites and exits non-zero.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
  },
});

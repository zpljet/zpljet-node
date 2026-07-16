import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The e2e suite hits the live API and consumes quota — it only runs via
    // `npm run test:e2e` (vitest.e2e.config.ts). Excluding it here (instead
    // of with a shell-quoted --exclude flag) keeps `npm test` safe on every
    // platform, including Windows cmd.exe.
    exclude: [...configDefaults.exclude, "test/e2e.test.ts"],
  },
});

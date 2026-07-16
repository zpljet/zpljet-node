import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Live tests run only through `npm run test:e2e`.
    exclude: [...configDefaults.exclude, "tests/e2e.test.ts"],
  },
});

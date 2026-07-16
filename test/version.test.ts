import { expect, it } from "vitest";
import pkg from "../package.json";
import { VERSION } from "../src/version";

it("src/version.ts matches package.json", () => {
  expect(VERSION).toBe(pkg.version);
});

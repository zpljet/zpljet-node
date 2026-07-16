import { expect, it } from "vitest";
import pkg from "../package.json";
import { VERSION } from "../src/version";

it("matches package.json version", () => {
  expect(VERSION).toBe(pkg.version);
});

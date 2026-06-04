import { describe, it, expect } from "vitest";

const pkg = await import("../");

describe("Test packaging", () => {
it("resolves package exports", () => {
  expect(pkg.MCDFile).toBeDefined();
  expect(pkg.TXTFile).toBeDefined();
  expect(pkg.MCDParser).toBeDefined();
});
});
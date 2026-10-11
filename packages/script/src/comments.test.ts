import { describe, expect, it } from "vitest";
import { hasComments } from "./comments.ts";

describe("hasComments", () => {
  it("finds a comment line", () => {
    expect(hasComments("# memo\nversion: 1\n", "yaml")).toBe(true);
  });

  it("finds a comment after a value", () => {
    expect(hasComments("version: 1 # memo\n", "yaml")).toBe(true);
  });

  it("finds a comment inside a list", () => {
    expect(hasComments("phases:\n  # p1\n  - id: p1\n", "yaml")).toBe(true);
  });

  it("does not take a # inside a text for a comment", () => {
    expect(hasComments('name: "Phase #2"\n', "yaml")).toBe(false);
  });

  it("finds nothing in JSON", () => {
    expect(hasComments('{"version": 1}', "json")).toBe(false);
  });
});

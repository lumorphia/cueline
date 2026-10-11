import { describe, expect, it } from "vitest";
import { formatClock, formatRemaining } from "./format.ts";

describe("formatClock", () => {
  it("shows minutes, seconds and tenths", () => {
    expect(formatClock(151_449)).toBe("02:31.4");
  });

  it("shows a countdown with a minus sign", () => {
    expect(formatClock(-4_950)).toBe("-00:04.9");
  });

  it("goes past an hour in minutes", () => {
    expect(formatClock(3_725_000)).toBe("62:05.0");
  });
});

describe("formatRemaining", () => {
  it("shows the seconds left with one decimal", () => {
    expect(formatRemaining(5_249)).toBe("5.2");
  });

  it("shows zero once the time has come", () => {
    expect(formatRemaining(-300)).toBe("0.0");
  });
});

import { describe, expect, it } from "vitest";
import { formatTime, parseTimeInput } from "./time-input.ts";

describe("parseTimeInput", () => {
  it.each([
    ["75.5", 75.5],
    ["1:15.5", 75.5],
    ["0:08", 8],
    ["10:00", 600],
    ["-5", -5],
    ["-0:05", -5],
    [" 1:02.25 ", 62.25],
    ["1：15", 75],
  ])("reads %j as %d seconds", (text, seconds) => {
    expect(parseTimeInput(text)).toBe(seconds);
  });

  it.each(["", "abc", "1:", "1:60", "1:2:3", "--5"])("refuses %j", (text) => {
    expect(parseTimeInput(text)).toBeNull();
  });
});

describe("formatTime", () => {
  it.each([
    [8, "0:08"],
    [75.5, "1:15.5"],
    [62.25, "1:02.25"],
    [600, "10:00"],
    [-5, "-0:05"],
    [0, "0:00"],
  ])("shows %d seconds as %s", (seconds, text) => {
    expect(formatTime(seconds)).toBe(text);
  });

  it("shows a time that reads back to the same seconds", () => {
    expect(parseTimeInput(formatTime(123.456))).toBe(123.456);
  });
});

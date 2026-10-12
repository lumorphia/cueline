import { SCRIPT_ISSUE_CODES } from "@cueline/script";
import { describe, expect, it } from "vitest";
import { en } from "../i18n/en.ts";
import { ja } from "../i18n/ja.ts";
import { translate } from "../i18n/translate.ts";
import { formatPath, issueText } from "./issue-text.ts";

describe("formatPath", () => {
  it("joins keys with dots and indexes with brackets", () => {
    expect(formatPath(["phases", 1, "events", 0, "at"])).toBe("phases[1].events[0].at");
  });

  it("shows the whole script for an empty path", () => {
    expect(formatPath([])).toBe("");
  });
});

describe("issueText", () => {
  it.each(SCRIPT_ISSUE_CODES)("has Japanese and English messages for %s", (code) => {
    expect(ja).toHaveProperty(`issue.${code}`);
    expect(en).toHaveProperty(`issue.${code}`);
  });

  it("fills the values of the issue into the message", () => {
    const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
      translate("ja", key, params);
    const issue = {
      severity: "error",
      code: "duplicate_event_id",
      path: [],
      params: { id: "e1" },
    } as const;
    expect(issueText(t, issue)).toContain("e1");
  });
});

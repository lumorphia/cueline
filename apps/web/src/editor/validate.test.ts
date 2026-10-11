import { describe, expect, it } from "vitest";
import { addEvent, addPhase, newScript, updateEvent, updateNotification } from "./draft.ts";
import { issuesAt, validateDraft } from "./validate.ts";

const base = () => newScript({ name: "テスト_検証", randomId: () => "x" });

describe("validateDraft", () => {
  it("finds nothing wrong in a fresh script", () => {
    expect(validateDraft(base())).toEqual({ errors: [], warnings: [] });
  });

  it("reports an empty event name at its path", () => {
    const s = updateEvent(addEvent(base(), 0), 0, 0, { name: "" });
    expect(validateDraft(s).errors).toContainEqual(
      expect.objectContaining({ code: "too_short", path: ["phases", 0, "events", 0, "name"] }),
    );
  });

  it("reports a manual phase call that would come before the phase starts", () => {
    let s = addEvent(addPhase(base()), 1, { at: 2 });
    s = updateNotification(s, 1, 0, 0, { before: 5 });
    expect(validateDraft(s).errors.map((i) => i.code)).toContain("fires_before_manual_start");
  });

  it("does not give lines (they would be lines of the generated text)", () => {
    const s = updateEvent(addEvent(base(), 0), 0, 0, { name: "" });
    expect(validateDraft(s).errors.every((i) => i.line === undefined)).toBe(true);
  });
});

describe("issuesAt", () => {
  const s = updateNotification(updateEvent(addEvent(base(), 0), 0, 0, { name: "" }), 0, 0, 0, {
    text: "",
  });
  const { errors } = validateDraft(s);

  it("picks the issues of one field", () => {
    expect(issuesAt(errors, ["phases", 0, "events", 0, "name"]).map((i) => i.code)).toEqual([
      "too_short",
    ]);
  });

  it("picks the issues under a row", () => {
    expect(issuesAt(errors, ["phases", 0, "events", 0])).toHaveLength(2);
  });

  it("picks nothing for a field without issues", () => {
    expect(issuesAt(errors, ["phases", 0, "events", 0, "at"])).toEqual([]);
  });
});

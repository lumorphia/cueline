// テストの中で作るスクリプト。テストからだけ使う (index.ts からは出さない)
import { stringify } from "yaml";

type Obj = Record<string, unknown>;

export const notification = (overrides: Obj = {}): Obj => ({
  type: "speech",
  text: "テスト_コール",
  ...overrides,
});

export const event = (id: string, at: number, overrides: Obj = {}): Obj => ({
  id,
  at,
  name: `テスト_${id}`,
  notifications: [notification()],
  ...overrides,
});

export const phase = (id: string, start: Obj, events: Obj[] = []): Obj => ({
  id,
  name: `テスト_${id}`,
  start,
  events,
});

export const absolute = (at: number): Obj => ({ type: "absolute", at });
export const manual = (): Obj => ({ type: "manual" });

export function script(overrides: Obj = {}): Obj {
  return {
    version: 1,
    metadata: { id: "test-boss", name: "テスト_ボス", language: "ja-JP" },
    phases: [phase("p1", absolute(0), [event("raidwide-1", 15)])],
    ...overrides,
  };
}

export const yamlOf = (value: Obj): string => stringify(value);

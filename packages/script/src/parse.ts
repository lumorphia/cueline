// スクリプトを読む (docs/design/02-timeline-script.md の「検証の段」)。前の段で失敗したら次の段に進まない
import { LineCounter, parseDocument } from "yaml";
import type { Document } from "yaml";
import type { z } from "zod";
import { error } from "./issues.ts";
import type { IssuePath, ScriptIssue } from "./issues.ts";
import { LIMITS } from "./limits.ts";
import { scriptV1 } from "./schema-v1.ts";
import type { ScriptV1Input } from "./schema-v1.ts";
import { LATEST_VERSION } from "./script.ts";
import type { Script } from "./script.ts";

export type ParseResult =
  | { ok: true; script: Script; warnings: readonly ScriptIssue[] }
  | { ok: false; issues: readonly ScriptIssue[] };

export type ParseOptions = { format?: "yaml" | "json" };

const fail = (issues: readonly ScriptIssue[]): ParseResult => ({ ok: false, issues });

export function parseScript(text: string, _options: ParseOptions = {}): ParseResult {
  // 1. 大きさ
  if (text.length > LIMITS.maxChars) {
    return fail([error("too_large", [], { max: LIMITS.maxChars })]);
  }

  // 2. 読み取り。JSON は YAML として読める (YAML 1.2 は JSON を含む) ので、どちらも同じパーサーで読む
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { schema: "core", uniqueKeys: true, lineCounter });
  const readIssues = [
    ...doc.errors.map((e) =>
      withLine(error(e.code === "DUPLICATE_KEY" ? "duplicate_key" : "yaml_syntax"), e.linePos),
    ),
    ...doc.warnings
      .filter((w) => w.code === "TAG_RESOLVE_FAILED")
      .map((w) => withLine(error("unsupported_tag"), w.linePos)),
  ];
  if (readIssues.length > 0) return fail(readIssues);

  let data: unknown;
  try {
    data = doc.toJS({ maxAliasCount: LIMITS.maxAliasCount });
  } catch {
    return fail([error("too_many_aliases", [], { max: LIMITS.maxAliasCount })]);
  }
  if (depthOf(data) > LIMITS.maxDepth) {
    return fail([error("too_deep", [], { max: LIMITS.maxDepth })]);
  }
  if (!isRecord(data)) return fail([error("not_object")]);

  // 3. 版
  const versionIssue = checkVersion(data["version"]);
  if (versionIssue) return fail([locate(versionIssue, doc, lineCounter)]);

  // 4. 形
  const parsed = scriptV1.safeParse(data);
  if (!parsed.success) {
    return fail(
      parsed.error.issues.flatMap((i) => fromZod(i, data)).map((i) => locate(i, doc, lineCounter)),
    );
  }

  return { ok: true, script: normalize(parsed.data), warnings: [] };
}

function checkVersion(version: unknown): ScriptIssue | null {
  if (version === undefined) return error("version_missing", ["version"]);
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return error("version_invalid", ["version"]);
  }
  if (version > LATEST_VERSION) {
    return error("app_update_required", ["version"], { latest: LATEST_VERSION });
  }
  if (version < 1) return error("version_unsupported", ["version"], { latest: LATEST_VERSION });
  return null;
}

// --- zod の問題を ScriptIssue にする ---

type ZodIssue = z.core.$ZodIssue;

function fromZod(issue: ZodIssue, data: unknown): ScriptIssue[] {
  const path = issue.path.filter((p): p is string | number => typeof p !== "symbol");
  switch (issue.code) {
    case "unrecognized_keys":
      return issue.keys.map((key) => error("unknown_key", [...path, key]));
    case "invalid_type":
      return [error(valueAt(data, path) === undefined ? "required" : "invalid_type", path)];
    case "invalid_format":
      return [error("invalid_format", path)];
    case "invalid_value":
      return [error("invalid_choice", path, { choices: issue.values.map(String).join(", ") })];
    case "invalid_union":
      // discriminatedUnion の type が知らない値のとき。path は type を指している
      return issue.discriminator
        ? [error("invalid_choice", path, { choices: optionsOf(issue).join(", ") })]
        : [error("invalid", path)];
    case "too_big":
      return [
        sizeIssue("too_long", "too_many", path, issue.origin, { max: Number(issue.maximum) }),
      ];
    case "too_small":
      return [
        sizeIssue("too_short", "too_few", path, issue.origin, { min: Number(issue.minimum) }),
      ];
    default:
      return [error("invalid", path)];
  }
}

// zod は判別の候補を options に入れるが、型には出していない
function optionsOf(issue: object): string[] {
  const options = (issue as { options?: unknown }).options;
  return Array.isArray(options) ? options.map(String) : [];
}

function sizeIssue(
  forString: "too_long" | "too_short",
  forArray: "too_many" | "too_few",
  path: IssuePath,
  origin: string,
  params: Record<string, number>,
): ScriptIssue {
  if (origin === "string") return error(forString, path, params);
  if (origin === "array") return error(forArray, path, params);
  return error("out_of_range", path, params);
}

// --- 位置 ---

function withLine(issue: ScriptIssue, linePos: readonly { line: number }[] | undefined) {
  const line = linePos?.[0]?.line;
  return line === undefined ? issue : { ...issue, line };
}

/** 問題のパスに当たる YAML の行を付ける。無ければ (必須のキーが無いなど) 親をたどる */
function locate(issue: ScriptIssue, doc: Document, lineCounter: LineCounter): ScriptIssue {
  for (let n = issue.path.length; n >= 0; n--) {
    const node = doc.getIn(issue.path.slice(0, n), true) as { range?: [number, number, number] };
    const offset = node?.range?.[0];
    if (offset !== undefined) return { ...issue, line: lineCounter.linePos(offset).line };
  }
  return issue;
}

// --- 値の扱い ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueAt(data: unknown, path: IssuePath): unknown {
  return path.reduce<unknown>(
    (acc, key) => (acc !== null && typeof acc === "object" ? (acc as never)[key] : undefined),
    data,
  );
}

/** 入れ子の深さ。スカラーは 0、空の配列やオブジェクトは 1 */
function depthOf(root: unknown): number {
  let max = 0;
  const stack: [unknown, number][] = [[root, 1]];
  while (stack.length > 0) {
    const [value, depth] = stack.pop() as [unknown, number];
    if (value === null || typeof value !== "object") continue;
    max = Math.max(max, depth);
    if (depth > LIMITS.maxDepth) return depth;
    for (const child of Object.values(value)) stack.push([child, depth + 1]);
  }
  return max;
}

function normalize(input: ScriptV1Input): Script {
  const defaultBefore = input.defaults?.before ?? 0;
  const { tags, description, author, ...metadata } = input.metadata;
  return {
    version: 1,
    metadata: {
      ...metadata,
      ...(description === undefined ? {} : { description }),
      ...(author === undefined ? {} : { author }),
      tags: tags ?? [],
    },
    ...(input.countdown ? { countdown: input.countdown } : {}),
    defaults: { before: defaultBefore },
    phases: input.phases.map((phase) => ({
      ...phase,
      events: phase.events.map((event) => ({
        ...event,
        notifications: (event.notifications ?? []).map((n) => ({
          type: n.type,
          text: n.text,
          before: n.before ?? defaultBefore,
          tags: n.tags ?? [],
          priority: n.priority ?? "normal",
          enabled: n.enabled ?? true,
        })),
      })),
    })),
  };
}

// スクリプト v1 の形 (docs/design/02-timeline-script.md の「項目」)。未知のキーはエラー (strictObject)
import { z } from "zod";
import { LIMITS } from "./limits.ts";

// zod 4 は速く検証するために new Function を試す。CSP (script-src 'self'、Trusted Types) の下では違反になるので使わせない
// (docs/design/07-security.md)。スキーマを作るときに読まれるので、スキーマの定義より前に設定する
z.config({ jitless: true });

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const tagId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/);
const name = z.string().min(1).max(100);
const seconds = z.number().min(LIMITS.minSeconds).max(LIMITS.maxSeconds);
const before = z.number().min(0).max(LIMITS.maxBefore);

const notification = z.strictObject({
  type: z.enum(["speech", "display"]),
  text: z.string().min(1).max(200),
  before: before.optional(),
  tags: z.array(tagId).max(LIMITS.maxTags).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  enabled: z.boolean().optional(),
});

const event = z.strictObject({
  id,
  at: seconds,
  name,
  notifications: z.array(notification).max(LIMITS.maxNotificationsPerEvent).optional(),
});

const start = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("absolute"), at: z.number().min(0).max(LIMITS.maxSeconds) }),
  z.strictObject({ type: z.literal("manual") }),
]);

const phase = z.strictObject({
  id,
  name,
  start,
  events: z.array(event).max(LIMITS.maxEvents),
});

export const scriptV1 = z.strictObject({
  version: z.literal(1),
  metadata: z.strictObject({
    id,
    name,
    description: z.string().max(1000).optional(),
    author: z.string().max(100).optional(),
    // BCP 47 の大まかな形 (ja-JP、en-US、zh-Hant-TW など)
    language: z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/),
    tags: z
      .array(z.strictObject({ id: tagId, label: z.string().min(1).max(32) }))
      .max(LIMITS.maxTags)
      .optional(),
  }),
  countdown: z.strictObject({ default: z.number().gt(0).max(LIMITS.maxCountdown) }).optional(),
  defaults: z.strictObject({ before }).optional(),
  phases: z.array(phase).min(1).max(LIMITS.maxPhases),
});

export type ScriptV1Input = z.infer<typeof scriptV1>;

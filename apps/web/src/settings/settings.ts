// 利用者の設定 (要件 8 章、docs/design/06-storage.md)。localStorage に版つきの JSON で置き、読めなければ既定値に戻す
import { z } from "zod";

// zod の new Function を CSP の下で試させない (packages/script の schema-v1.ts と同じ。07-security)
z.config({ jitless: true });

const schema = z.strictObject({
  version: z.literal(1),
  voice: z.strictObject({
    voiceURI: z.string().nullable(),
    rate: z.number().min(0.5).max(2),
    volume: z.number().min(0).max(1),
    pitch: z.number().min(0).max(2),
  }),
  /** テスト再生で測った、話し始めるまでの遅れ (ms) */
  latencyMs: z.number().min(0).max(5000).nullable(),
  /** 測った遅れの分だけ早く話すか */
  compensateLatency: z.boolean(),
  conflict: z.enum(["interrupt", "queue", "priority"]),
  rewindPolicy: z.enum(["by-operation", "keep", "rearm"]),
  /** スクリプトに countdown が無いときのプルカウントの秒数 */
  countdownSeconds: z.number().int().min(1).max(60),
  nudgeSeconds: z.number().min(0.1).max(10),
  upcomingCount: z.number().int().min(1).max(10),
  /** スクリプト (metadata.id) ごとの聞くタグ。無ければ全部 */
  tagsByScript: z.record(z.string(), z.array(z.string()).max(32)),
});

export type Settings = z.infer<typeof schema>;

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  voice: { voiceURI: null, rate: 1.2, volume: 1, pitch: 1 },
  latencyMs: null,
  compensateLatency: true,
  conflict: "interrupt",
  rewindPolicy: "by-operation",
  countdownSeconds: 15,
  nudgeSeconds: 1,
  upcomingCount: 5,
  tagsByScript: {},
};

const KEY = "tc:settings";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function loadSettings(storage: StorageLike): Settings {
  try {
    const text = storage.getItem(KEY);
    if (text === null) return DEFAULT_SETTINGS;
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(storage: StorageLike, settings: Settings): void {
  try {
    storage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくても、この画面の間は設定が効く
  }
}

export function tagsFor(settings: Settings, scriptId: string): ReadonlySet<string> | null {
  const tags = settings.tagsByScript[scriptId];
  return tags ? new Set(tags) : null;
}

export function withTags(
  settings: Settings,
  scriptId: string,
  tags: readonly string[] | null,
): Settings {
  const { [scriptId]: _old, ...rest } = settings.tagsByScript;
  return { ...settings, tagsByScript: tags === null ? rest : { ...rest, [scriptId]: [...tags] } };
}

/** エンジンに渡す lookaheadMs。測った立ち上がりの遅れの分だけ早く話す (PoC-002: 端末ごとにほぼ一定) */
export const lookaheadFor = (settings: Settings): number =>
  settings.compensateLatency && settings.latencyMs !== null ? Math.round(settings.latencyMs) : 0;

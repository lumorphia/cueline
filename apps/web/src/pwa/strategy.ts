// Service Worker の決まり (要件 NFR-201、docs/design/01-architecture.md の「配信と PWA」)。
// 事前に保存した本体だけを cache から返し、ほか (VOICEVOX など他のサイト、POST) は network に任せる。
// 利用者のデータ (スクリプト、設定) は Service Worker の cache に入れない (06)
export type Strategy = "app-shell" | "cache-first" | "network";

type RequestLike = { url: string; mode: string; method: string };

export function strategyFor(
  request: RequestLike,
  origin: string,
  precache: readonly string[],
): Strategy {
  if (request.method !== "GET") return "network";
  const url = new URL(request.url);
  if (url.origin !== origin) return "network";
  // ページのどの URL も同じ index.html (single-page-application)
  if (request.mode === "navigate") return "app-shell";
  return precache.includes(url.pathname) ? "cache-first" : "network";
}

/** ビルドしたファイルから、事前に保存するものを選ぶ。index.html は "/" として持つ */
export function precacheList(files: readonly string[]): string[] {
  return files
    .filter((f) => f !== "sw.js" && f !== "_headers" && !f.endsWith(".map"))
    .map((f) => (f === "index.html" ? "/" : `/${f}`));
}

/** 一覧から決まる cache の名前。一覧が変わる (= 新しい版) と名前も変わり、古い cache を消せる */
export function cacheName(list: readonly string[]): string {
  const text = [...list].sort().join("\n");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `cueline-${hash.toString(16).padStart(8, "0")}`;
}

/**
 * Cloudflare の `_headers` (apps/web/public/_headers) を読む。E2E のサーバー (e2e/serve.ts) が本番と同じヘッダーを
 * 付けるために使う。扱うのは、パスの行と、その下の字下げした `名前: 値` の行、`#` の注釈だけ。
 * パスの `*` は何にでも当たる (Cloudflare の splat)
 */
export type HeaderRule = { path: string; headers: Record<string, string> };

export function parseHeaders(text: string): HeaderRule[] {
  return text.split(/\r?\n/).reduce<HeaderRule[]>((rules, line, index) => {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return rules;
    if (!/^\s/.test(line)) return [...rules, { path: trimmed, headers: {} }];
    const last = rules.at(-1);
    if (!last) throw new Error(`_headers の ${index + 1} 行目: path の行より前にヘッダーがある`);
    const colon = trimmed.indexOf(":");
    if (colon <= 0) throw new Error(`_headers の ${index + 1} 行目: "名前: 値" の形でない`);
    const name = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    return [...rules.slice(0, -1), { ...last, headers: { ...last.headers, [name]: value } }];
  }, []);
}

function matches(pattern: string, pathname: string): boolean {
  const regex = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${regex}$`).test(pathname);
}

export function headersFor(rules: readonly HeaderRule[], pathname: string): Record<string, string> {
  return rules
    .filter((rule) => matches(rule.path, pathname))
    .reduce<Record<string, string>>((acc, rule) => ({ ...acc, ...rule.headers }), {});
}

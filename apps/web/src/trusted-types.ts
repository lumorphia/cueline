// Trusted Types (docs/design/07-security.md の CSP、require-trusted-types-for 'script')。
// Worker の URL は、同じオリジンのものだけを通す。それ以外は投げる
type Policy = { createScriptURL(url: string): unknown };
type TrustedTypesLike = {
  createPolicy(name: string, rules: { createScriptURL(url: string): string }): Policy;
};

const factory = (globalThis as { trustedTypes?: TrustedTypesLike }).trustedTypes;

function sameOrigin(url: string): string {
  const parsed = new URL(url, location.href);
  if (parsed.origin !== location.origin) throw new Error(`同じオリジンでない URL: ${url}`);
  return parsed.href;
}

// Trusted Types の無いブラウザ (Firefox、Safari の古い版) では、確かめた文字列をそのまま使う
const policy: Policy = factory?.createPolicy("timeline-call", { createScriptURL: sameOrigin }) ?? {
  createScriptURL: sameOrigin,
};

export const scriptUrl = (url: string) => policy.createScriptURL(url);

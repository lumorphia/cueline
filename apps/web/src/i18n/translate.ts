// 文言を引く (ADR-0011)。i18n のライブラリは入れず、{name} の穴を埋めるだけ
import { en } from "./en.ts";
import { ja } from "./ja.ts";
import type { MessageKey } from "./ja.ts";

export type Language = "ja" | "en";
export type Params = Record<string, string | number>;

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { ja, en };

export function translate(language: Language, key: MessageKey, params: Params = {}): string {
  return DICTIONARIES[language][key].replace(/\{(\w+)\}/g, (hole, name: string) =>
    name in params ? String(params[name]) : hole,
  );
}

/** ブラウザの言語から決める。日本語でなければ英語 */
export function detectLanguage(languages: readonly string[]): Language {
  return languages.some((l) => l.toLowerCase().startsWith("ja")) ? "ja" : "en";
}

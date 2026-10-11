// 画面の言語を配る。選んだ言語は端末に覚える (使えなければ毎回ブラウザの言語から決める)
import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { MessageKey } from "./ja.ts";
import { detectLanguage, translate } from "./translate.ts";
import type { Language, Params } from "./translate.ts";

const STORAGE_KEY = "tc:language";

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ja" || saved === "en") return saved;
  } catch {
    // 保存が使えない (プライベートブラウズなど)
  }
  return detectLanguage(navigator.languages);
}

type I18n = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: MessageKey, params?: Params) => string;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState(initialLanguage);
  const value = useMemo<I18n>(
    () => ({
      language,
      setLanguage(next) {
        setLanguageState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // 覚えられなくても切り替えはできる
        }
      },
      t: (key, params) => translate(language, key, params),
    }),
    [language],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider の外で useI18n を使った");
  return value;
}

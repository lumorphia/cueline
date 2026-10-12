// このアプリについて (公開ゲート RM-31、ADR-0005)。ゲームに触れないこと、データを外に送らないこと、非公式であることを書く
import { useI18n } from "../i18n/context.tsx";
import type { MessageKey } from "../i18n/ja.ts";

const REPOSITORY = "https://github.com/lumorphia/cueline";

const SECTIONS: { title: MessageKey; body: MessageKey }[] = [
  { title: "about.whatTitle", body: "about.what" },
  { title: "about.gameTitle", body: "about.game" },
  { title: "about.dataTitle", body: "about.data" },
  { title: "about.unofficialTitle", body: "about.unofficial" },
];

export function AboutView() {
  const { t } = useI18n();
  return (
    <section className="flex flex-col gap-4" data-testid="about">
      <h2 className="text-base font-semibold">{t("about.title")}</h2>
      {SECTIONS.map((s) => (
        <div key={s.title} className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">{t(s.title)}</h3>
          <p className="text-sm leading-relaxed">{t(s.body)}</p>
        </div>
      ))}
      <p className="text-sm">FINAL FANTASY XIV © SQUARE ENIX</p>
      <ul className="flex flex-col gap-1 text-sm">
        <li>
          <a className="underline" href={REPOSITORY} rel="noreferrer" target="_blank">
            {t("about.source")}
          </a>{" "}
          (AGPL-3.0-only)
        </li>
        <li>
          <a
            className="underline"
            href={`${REPOSITORY}/security/advisories/new`}
            rel="noreferrer"
            target="_blank"
          >
            {t("about.security")}
          </a>
        </li>
      </ul>
    </section>
  );
}

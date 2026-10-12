// スクリプトの問題の一覧。どこが (行、パス)、何が、どう直すかを出す (要件 FR-002)
import type { ScriptIssue } from "@cueline/script";
import { useI18n } from "../i18n/context.tsx";
import { formatPath, issueText } from "./issue-text.ts";

export function IssueList({ issues }: { issues: readonly ScriptIssue[] }) {
  const { t } = useI18n();
  return (
    <ul className="flex flex-col gap-1 text-sm" data-testid="issues">
      {issues.map((issue, i) => (
        <li key={i} className="rounded bg-neutral-500/10 px-2 py-1">
          {issue.line !== undefined && (
            <span className="mr-2 font-mono opacity-70">
              {t("library.line", { line: issue.line })}
            </span>
          )}
          {issue.path.length > 0 && (
            <code className="mr-2 opacity-70">{formatPath(issue.path)}</code>
          )}
          <span>{issueText(t, issue)}</span>
        </li>
      ))}
    </ul>
  );
}

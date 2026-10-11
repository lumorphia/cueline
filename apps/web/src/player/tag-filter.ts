// 聞くタグの絞り込み (要件 FR-006)。選んだタグを持つ通知と、タグの無い通知だけを鳴らす。null は「全部」
export function shouldPlay(
  notification: { tags: readonly string[]; enabled: boolean },
  chosen: ReadonlySet<string> | null,
): boolean {
  if (!notification.enabled) return false;
  if (chosen === null || notification.tags.length === 0) return true;
  return notification.tags.some((tag) => chosen.has(tag));
}

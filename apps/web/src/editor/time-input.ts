// エディタの時刻の入力 (要件 FR-004)。「分:秒」(1:15.5) でも秒 (75.5) でも受け付け、表示は「分:秒」
const PATTERN = /^(-)?(?:(\d+):)?(\d+(?:\.\d+)?)$/;

/** 読めなければ null。分のある形では、秒は 60 未満 */
export function parseTimeInput(text: string): number | null {
  const m = PATTERN.exec(text.trim().replace("：", ":"));
  if (!m) return null;
  const [, minus, minutes, seconds] = m;
  const sec = Number(seconds);
  if (minutes !== undefined && sec >= 60) return null;
  const total = Number(minutes ?? 0) * 60 + sec;
  return (minus ? -1 : 1) * (Math.round(total * 1000) / 1000);
}

/** 0:08、1:15.5、-0:05 の形。小数は要るところまで (ミリ秒まで) */
export function formatTime(seconds: number): string {
  const sign = seconds < 0 ? "-" : "";
  const ms = Math.round(Math.abs(seconds) * 1000);
  const minutes = Math.floor(ms / 60000);
  const rest = ms - minutes * 60000;
  const whole = Math.floor(rest / 1000);
  const fraction = rest % 1000;
  const tail = fraction === 0 ? "" : `.${String(fraction).padStart(3, "0").replace(/0+$/, "")}`;
  return `${sign}${minutes}:${String(whole).padStart(2, "0")}${tail}`;
}

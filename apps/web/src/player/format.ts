// 再生画面の時刻の書式 (docs/design/05-ui.md)

/** 論理時刻を mm:ss.d にする。プルカウント中は先頭に - を付ける。0.1 秒未満は切り捨て */
export function formatClock(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const tenths = Math.floor(Math.abs(ms) / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${sign}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
}

/** 残り時間の秒 (小数 1 桁)。過ぎたら 0.0 */
export function formatRemaining(ms: number): string {
  return (Math.floor(Math.max(0, ms) / 100) / 10).toFixed(1);
}

// PoC-001 の集計。DOM を使わない (node でも確かめられるように)。

export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

export function summarize(records) {
  const lates = records.map((r) => r.lateMs);
  return {
    count: records.length,
    p50: percentile(lates, 50),
    p95: percentile(lates, 95),
    max: lates.length === 0 ? null : Math.max(...lates),
  };
}

// 表示の状態ごとに分けて集計する。
export function summarizeBy(records, keyOf) {
  const groups = new Map();
  for (const r of records) {
    const key = keyOf(r);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].map(([key, rs]) => ({ key, ...summarize(rs) }));
}

// 遅れが時間とともに積もっていないかを見る。最初と最後の 1/10 の中央値を比べる。
export function driftTrend(records) {
  if (records.length < 20) return null;
  const n = Math.floor(records.length / 10);
  const head = percentile(
    records.slice(0, n).map((r) => r.lateMs),
    50,
  );
  const tail = percentile(
    records.slice(-n).map((r) => r.lateMs),
    50,
  );
  return { headP50: head, tailP50: tail, diff: tail - head };
}

const COLUMNS = [
  "index",
  "dueMs",
  "firedMs",
  "lateMs",
  "visibility",
  "focus",
  "timer",
  "audio",
  "wakeLock",
  "wallDriftMs",
];

export function toCsv(records, meta) {
  const header = Object.entries(meta).map(([k, v]) => `# ${k}: ${String(v).replaceAll("\n", " ")}`);
  const rows = records.map((r) => COLUMNS.map((c) => String(r[c] ?? "")).join(","));
  return [...header, COLUMNS.join(","), ...rows].join("\n") + "\n";
}

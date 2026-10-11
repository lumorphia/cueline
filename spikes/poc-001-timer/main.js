// PoC-001 タイマーの精度 (docs/design/08-poc.md)。
// エンジンと同じ作り (論理時刻は毎回時計から計算、タイマーは次の予定まで 1 本) で、
// 予定の時刻と、気づいた時刻の差 (遅れ) を記録する。
import { driftTrend, summarize, summarizeBy, toCsv } from "./stats.js";

const $ = (id) => document.getElementById(id);

// --- タイマー (メインスレッド / Worker) ---

function mainTimer() {
  return {
    set: (cb, delayMs) => setTimeout(cb, delayMs),
    clear: (h) => clearTimeout(h),
    dispose: () => {},
  };
}

function workerTimer() {
  const worker = new Worker("./timer-worker.js");
  const callbacks = new Map();
  let nextId = 1;
  worker.onmessage = (e) => {
    const cb = callbacks.get(e.data.id);
    callbacks.delete(e.data.id);
    cb?.();
  };
  return {
    set(cb, delayMs) {
      const id = nextId++;
      callbacks.set(id, cb);
      worker.postMessage({ type: "set", id, delayMs });
      return id;
    },
    clear(id) {
      callbacks.delete(id);
      worker.postMessage({ type: "clear", id });
    },
    dispose: () => worker.terminate(),
  };
}

// --- 音 (AudioContext を動かしたままにするか) ---

async function startAudio(mode) {
  if (mode === "none") return null;
  const ctx = new AudioContext();
  await ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  // silent: 0、inaudible: 聞こえない程度の小さな音 (「音を鳴らしている」と見なされるかを比べる)
  gain.gain.value = mode === "silent" ? 0 : 0.0001;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  return ctx;
}

function beep(ctx) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0.2;
  osc.frequency.value = 880;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.05);
}

// --- 計測 ---

let run = null;

async function start() {
  const minutes = Number($("minutes").value);
  const intervalMs = Number($("interval").value) * 1000;
  const timerMode = $("timer").value;
  const selectedAudio = $("audio").value;
  const wantWakeLock = $("wakelock").checked;
  const wantBeep = $("beep").checked;

  // 音を鳴らすには AudioContext が要る。「なし」で音を選んだら無音として数える (記録にもそう残す)。
  const audioMode = selectedAudio === "none" && wantBeep ? "silent" : selectedAudio;
  const audioCtx = await startAudio(audioMode);
  let wakeLock = null;
  if (wantWakeLock && "wakeLock" in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request("screen");
    } catch (err) {
      log(`Wake Lock を取れなかった: ${err}`);
    }
  }

  const timer = timerMode === "worker" ? workerTimer() : mainTimer();
  const startMono = performance.now();
  const startWall = Date.now();
  const total = Math.floor((minutes * 60_000) / intervalMs);

  run = {
    timer,
    audioCtx,
    wakeLock,
    wantBeep,
    timerMode,
    audioMode,
    startMono,
    startWall,
    intervalMs,
    total,
    next: 1,
    handle: null,
    records: [],
    earlyWakes: 0,
    meta: {
      startedAt: new Date(startWall).toISOString(),
      userAgent: navigator.userAgent,
      minutes,
      intervalMs,
      timer: timerMode,
      audio: audioMode,
      wakeLockRequested: wantWakeLock,
    },
  };
  log(`開始: ${total} 回、${intervalMs}ms ごと、timer=${timerMode}, audio=${audioMode}`);
  schedule();
  setRunning(true);
}

function dueOf(i) {
  return run.startMono + i * run.intervalMs;
}

function schedule() {
  if (run.next > run.total) return finish();
  const delay = Math.max(0, dueOf(run.next) - performance.now());
  run.handle = run.timer.set(wake, delay);
}

function wake() {
  const now = performance.now();
  if (now < dueOf(run.next)) {
    // 早く起きた (丸め)。鳴らさずに張り直す。
    run.earlyWakes += 1;
    return schedule();
  }
  // 起きた時点までに来ている予定を全部処理する (03 の process())。
  while (run.next <= run.total && dueOf(run.next) <= now) {
    const due = dueOf(run.next);
    const wallDriftMs = Date.now() - run.startWall - (now - run.startMono);
    run.records = [
      ...run.records,
      {
        index: run.next,
        dueMs: Math.round(due - run.startMono),
        firedMs: Math.round((now - run.startMono) * 10) / 10,
        lateMs: Math.round((now - due) * 10) / 10,
        visibility: document.visibilityState,
        focus: document.hasFocus(),
        timer: run.timerMode,
        audio: run.audioMode,
        wakeLock: run.wakeLock ? !run.wakeLock.released : false,
        wallDriftMs: Math.round(wallDriftMs),
      },
    ];
    run.next += 1;
  }
  if (run.wantBeep) beep(run.audioCtx);
  render();
  schedule();
}

function finish() {
  log("終わり");
  stop();
}

function stop() {
  if (!run) return;
  run.timer.clear(run.handle);
  run.timer.dispose();
  run.audioCtx?.close();
  run.wakeLock?.release();
  run.handle = null;
  setRunning(false);
  render();
}

// --- 表示 ---

function fmt(v) {
  return v === null || v === undefined ? "-" : `${v.toFixed(1)}ms`;
}

function render() {
  if (!run) return;
  const all = summarize(run.records);
  const trend = driftTrend(run.records);
  const elapsed = (performance.now() - run.startMono) / 1000;
  $("summary").textContent = [
    `経過 ${Math.floor(elapsed / 60)}分${Math.floor(elapsed % 60)}秒  記録 ${all.count} / ${run.total}`,
    `全体  p50 ${fmt(all.p50)}  p95 ${fmt(all.p95)}  最大 ${fmt(all.max)}  早起き ${run.earlyWakes}`,
    ...summarizeBy(run.records, (r) => `${r.visibility}/${r.focus ? "focus" : "nofocus"}`).map(
      (g) =>
        `  ${g.key.padEnd(16)} n=${g.count}  p50 ${fmt(g.p50)}  p95 ${fmt(g.p95)}  最大 ${fmt(g.max)}`,
    ),
    trend
      ? `積もり  最初の1/10 p50 ${fmt(trend.headP50)}  最後の1/10 p50 ${fmt(trend.tailP50)}  差 ${fmt(trend.diff)}`
      : "積もり  (記録が 20 件未満)",
    `壁の時計とのずれ ${run.records.at(-1)?.wallDriftMs ?? "-"}ms`,
  ].join("\n");
}

function log(text) {
  const line = `${new Date().toLocaleTimeString()} ${text}`;
  $("log").textContent = `${line}\n${$("log").textContent}`;
}

function setRunning(running) {
  $("start").disabled = running;
  $("stop").disabled = !running;
  $("download").disabled = !run || run.records.length === 0;
}

function download() {
  if (!run) return;
  const blob = new Blob([toCsv(run.records, run.meta)], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `poc-001-${run.timerMode}-${run.audioMode}-${run.meta.startedAt.replaceAll(":", "")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.addEventListener("visibilitychange", () => {
  log(`visibility: ${document.visibilityState}`);
  if (run?.wakeLock?.released && document.visibilityState === "visible") log("Wake Lock が外れた");
});
window.addEventListener("focus", () => log("focus"));
window.addEventListener("blur", () => log("blur"));

$("start").addEventListener("click", () => start());
$("stop").addEventListener("click", () => stop());
$("download").addEventListener("click", () => download());
$("env").textContent = [
  navigator.userAgent,
  `Worker: ${"Worker" in window}  AudioContext: ${"AudioContext" in window}  Wake Lock: ${"wakeLock" in navigator}`,
  `secure context: ${window.isSecureContext}`,
].join("\n");
setRunning(false);

// PoC-002 Web Speech (docs/design/08-poc.md)。
// A 立ち上がり / B 重なり / C cancel の直後 / D 長く鳴らし続ける、の 4 つを測る。
import { createArbiter } from "./arbiter.js";

const $ = (id) => document.getElementById(id);
const synth = window.speechSynthesis;
const now = () => performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- 記録 ---

let rows = [];
const COLUMNS = [
  "test",
  "run",
  "callId",
  "event",
  "atMs",
  "latencyMs",
  "detail",
  "visibility",
  "voice",
  "local",
];
const t0 = now();

function record(row) {
  const v = currentVoice();
  rows = [
    ...rows,
    {
      ...row,
      atMs: Math.round((row.atMs ?? now()) - t0),
      visibility: document.visibilityState,
      voice: v?.name ?? "(既定)",
      local: v ? v.localService : "",
    },
  ];
  $("download").disabled = false;
}

function log(text) {
  $("log").textContent = `${new Date().toLocaleTimeString()} ${text}\n${$("log").textContent}`;
}

function pct(values, p) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

const fmt = (v) => (v === null ? "-" : `${Math.round(v)}ms`);

// --- 声と設定 ---

let voices = [];

function loadVoices() {
  voices = synth.getVoices();
  const sel = $("voice");
  const lang = $("lang").value.toLowerCase();
  const sorted = [...voices].sort(
    (a, b) =>
      Number(b.lang.toLowerCase().startsWith(lang)) - Number(a.lang.toLowerCase().startsWith(lang)),
  );
  sel.replaceChildren(
    new Option("(ブラウザの既定)", ""),
    ...sorted.map(
      (v) =>
        new Option(`${v.name} [${v.lang}] ${v.localService ? "端末" : "オンライン"}`, v.voiceURI),
    ),
  );
  $("voices").textContent =
    `声 ${voices.length} 個 (端末 ${voices.filter((v) => v.localService).length})`;
}

function currentVoice() {
  return voices.find((v) => v.voiceURI === $("voice").value) ?? null;
}

function utterance(text) {
  const u = new SpeechSynthesisUtterance(text);
  const v = currentVoice();
  if (v) u.voice = v;
  u.lang = v?.lang ?? $("lang").value;
  u.rate = Number($("rate").value);
  u.volume = Number($("volume").value);
  return u;
}

// Chrome は参照の無い utterance を回収して onend を出さないことがあるので、持っておく
const alive = new Set();

function webSpeechProvider() {
  return {
    speak(call, { onStart, onEnd, onError }) {
      const u = utterance(call.text);
      alive.add(u);
      u.onstart = () => onStart();
      u.onend = () => {
        alive.delete(u);
        onEnd();
      };
      u.onerror = (e) => {
        alive.delete(u);
        onError(e.error);
      };
      synth.speak(u);
    },
    cancel: () => synth.cancel(),
  };
}

// 利用者の操作の中で一度鳴らし、以降の読み上げを使える状態にする (04 の「音のアンロック」)
let audioCtx = null;
async function unlock() {
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  synth.speak(u);
  audioCtx ??= new AudioContext();
  await audioCtx.resume().catch(() => {});
}

// 1 つ話して、onstart までの遅れと結果を返す
function speakOnce(text, timeoutMs = 10_000) {
  return new Promise((resolve) => {
    const u = utterance(text);
    alive.add(u);
    const tCall = now();
    let tStart = null;
    const done = (result, detail = "") => {
      alive.delete(u);
      clearTimeout(timer);
      resolve({ tCall, tStart, tEnd: now(), result, detail });
    };
    const timer = setTimeout(() => done("timeout"), timeoutMs);
    u.onstart = () => (tStart = now());
    u.onend = () => done(tStart === null ? "end-without-start" : "ok");
    u.onerror = (e) => done("error", e.error);
    synth.speak(u);
  });
}

// --- A 立ち上がり ---

async function testLatency() {
  await unlock();
  const n = Number($("a-runs").value);
  const lat = [];
  let failures = 0;
  log(`A 開始: ${n} 回`);
  for (let i = 1; i <= n; i++) {
    const r = await speakOnce($("a-text").value);
    const latency = r.tStart === null ? null : r.tStart - r.tCall;
    if (latency === null) failures += 1;
    else lat.push(latency);
    record({
      test: "A",
      run: i,
      callId: i,
      event: r.result,
      atMs: r.tCall,
      latencyMs: latency?.toFixed(1),
      detail: r.detail,
    });
    $("a-result").textContent =
      `${i}/${n}  p50 ${fmt(pct(lat, 50))}  p95 ${fmt(pct(lat, 95))}  最大 ${fmt(lat.length ? Math.max(...lat) : null)}  失敗 ${failures}`;
    await sleep(400);
  }
  log("A 終わり");
}

// --- B 重なり ---

const B_CALLS = [
  { id: "1", text: "いち。5秒後に全体攻撃です。", priority: "normal" },
  { id: "2", text: "に。タンク強攻撃。", priority: "low" },
  { id: "3", text: "さん。散開。", priority: "high" },
];

async function testOverlap() {
  await unlock();
  const mode = $("b-mode").value;
  const gapMs = Number($("b-gap").value) * 1000;
  const runs = Number($("b-runs").value);
  const restartDelayMs = Number($("c-delay").value);
  const summary = [];
  log(`B 開始: ${mode}、間隔 ${gapMs}ms、${runs} 回`);
  for (let run = 1; run <= runs; run++) {
    const events = [];
    const arbiter = createArbiter({
      mode,
      provider: webSpeechProvider(),
      now,
      restartDelayMs,
      onEvent: (e) => {
        events.push(e);
        record({
          test: `B-${mode}-${gapMs}`,
          run,
          callId: e.call?.id ?? "",
          event: e.type,
          atMs: e.at,
          detail: e.error ?? e.reason ?? "",
        });
      },
    });
    const base = now();
    B_CALLS.forEach((c, i) =>
      setTimeout(() => arbiter.speak({ ...c, dueAt: base + i * gapMs }), i * gapMs),
    );
    await sleep(2 * gapMs + 6000);
    arbiter.cancelAll();
    const started = B_CALLS.filter((c) =>
      events.some((e) => e.type === "start" && e.call.id === c.id),
    ).map((c) => c.id);
    const lastStarted = events.some((e) => e.type === "start" && e.call.id === "3");
    summary.push(
      `#${run} 話し始めた: ${started.join(",") || "なし"}  最後 (3) ${lastStarted ? "鳴った" : "鳴らない"}`,
    );
    $("b-result").textContent = summary.join("\n");
    await sleep(800);
  }
  log("B 終わり");
}

// --- C cancel の直後 ---

async function testCancel() {
  await unlock();
  const runs = Number($("c-runs").value);
  const delay = Number($("c-delay").value);
  let ok = 0;
  const lat = [];
  log(`C 開始: cancel の後 ${delay}ms 空けて話す、${runs} 回`);
  for (let i = 1; i <= runs; i++) {
    const long = utterance("これは途中で止める長い文です。止められたら次が聞こえるはずです。");
    alive.add(long);
    synth.speak(long);
    await sleep(700);
    synth.cancel();
    if (delay > 0) await sleep(delay);
    const r = await speakOnce("次", 3000);
    alive.delete(long);
    const latency = r.tStart === null ? null : r.tStart - r.tCall;
    if (r.result === "ok") ok += 1;
    if (latency !== null) lat.push(latency);
    record({
      test: `C-${delay}`,
      run: i,
      callId: i,
      event: r.result,
      atMs: r.tCall,
      latencyMs: latency?.toFixed(1),
      detail: r.detail,
    });
    $("c-result").textContent =
      `${i}/${runs}  次が鳴った ${ok}  p50 ${fmt(pct(lat, 50))}  p95 ${fmt(pct(lat, 95))}`;
    await sleep(600);
  }
  log("C 終わり");
}

// --- D 長く鳴らし続ける ---

let dRun = null;

async function startLong() {
  await unlock();
  const minutes = Number($("d-minutes").value);
  const everyMs = Number($("d-every").value) * 1000;
  let wakeLock = null;
  if ($("d-wakelock").checked && "wakeLock" in navigator) {
    wakeLock = await navigator.wakeLock
      .request("screen")
      .catch((err) => (log(`Wake Lock を取れなかった: ${err}`), null));
  }
  const worker = new Worker("./timer-worker.js");
  const start = now();
  const total = Math.floor((minutes * 60_000) / everyMs);
  const lat = [];
  let ok = 0;
  let i = 0;
  dRun = { worker, wakeLock };
  log(`D 開始: ${everyMs / 1000} 秒ごとに ${total} 回`);
  const tick = async () => {
    i += 1;
    const due = start + i * everyMs;
    const r = await speakOnce(`${i} 回目`, 5000);
    const latency = r.tStart === null ? null : r.tStart - r.tCall;
    if (r.result === "ok") ok += 1;
    if (latency !== null) lat.push(latency);
    record({
      test: "D",
      run: i,
      callId: i,
      event: r.result,
      atMs: r.tCall,
      latencyMs: latency?.toFixed(1),
      detail: `${r.detail} timerLate=${(r.tCall - due).toFixed(1)}`,
    });
    $("d-result").textContent =
      `${i}/${total}  鳴った ${ok}  p50 ${fmt(pct(lat, 50))}  p95 ${fmt(pct(lat, 95))}  最大 ${fmt(lat.length ? Math.max(...lat) : null)}  Wake Lock ${wakeLock && !wakeLock.released ? "あり" : "なし"}`;
    if (i < total && dRun)
      worker.postMessage({
        type: "set",
        id: i + 1,
        delayMs: Math.max(0, start + (i + 1) * everyMs - now()),
      });
    else stopLong();
  };
  worker.onmessage = () => tick();
  worker.postMessage({ type: "set", id: 1, delayMs: everyMs });
  $("d-start").disabled = true;
  $("d-stop").disabled = false;
}

function stopLong() {
  if (!dRun) return;
  dRun.worker.terminate();
  dRun.wakeLock?.release();
  dRun = null;
  $("d-start").disabled = false;
  $("d-stop").disabled = true;
  log("D 終わり");
}

// --- 書き出し ---

function download() {
  const header = [`# userAgent: ${navigator.userAgent}`, `# savedAt: ${new Date().toISOString()}`];
  const body = rows.map((r) =>
    COLUMNS.map((c) => `"${String(r[c] ?? "").replaceAll('"', '""')}"`).join(","),
  );
  const blob = new Blob([[...header, COLUMNS.join(","), ...body].join("\n") + "\n"], {
    type: "text/csv",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `poc-002-${new Date().toISOString().replaceAll(":", "")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- つなぐ ---

const guard = (fn) => async () => {
  try {
    await fn();
  } catch (err) {
    log(`失敗: ${err}`);
  }
};

synth.addEventListener?.("voiceschanged", loadVoices);
$("lang").addEventListener("change", loadVoices);
$("test").addEventListener(
  "click",
  guard(async () => (await unlock(), speakOnce($("a-text").value))),
);
$("a-start").addEventListener("click", guard(testLatency));
$("b-start").addEventListener("click", guard(testOverlap));
$("c-start").addEventListener("click", guard(testCancel));
$("d-start").addEventListener("click", guard(startLong));
$("d-stop").addEventListener("click", stopLong);
$("download").addEventListener("click", download);
document.addEventListener("visibilitychange", () => log(`visibility: ${document.visibilityState}`));
$("env").textContent = [
  navigator.userAgent,
  `speechSynthesis: ${"speechSynthesis" in window}  Wake Lock: ${"wakeLock" in navigator}  secure context: ${window.isSecureContext}`,
].join("\n");
$("download").disabled = true;
$("d-stop").disabled = true;
loadVoices();

# 03. エンジン

`@timeline-call/engine`。タイムラインを受け取り、論理時刻を進め、通知を鳴らす時刻になったら知らせる。DOM を使わない (ADR-0004)。

## 外から受け取るもの

```ts
type Clock = { now(): number }; // 単調時計のミリ秒。ブラウザでは performance.now()
type Timer = {
  set(callback: () => void, delayMs: number): TimerHandle;
  clear(handle: TimerHandle): void;
};

createEngine({
  timeline, // script.buildTimeline の結果
  clock,
  timer,
  lookaheadMs, // 何ミリ秒前に知らせるか。Web Speech は 0、作ってから鳴らす型は 300 など (04)
  lateToleranceMs, // これより遅れて気づいた通知は鳴らさない。仮の値 2000 (PoC-001 で決める)
  rewindPolicy, // 時刻を戻したときの鳴らし済みの扱い。下の「戻したとき」(仮の既定 "by-operation")
  onFire, // (notification, dueAtMono) => void
  onMissed, // (notifications, lateMs) => void。再同期を促す
  onStateChange,
});
```

テストでは偽の `Clock` と `Timer` を渡し、時間を好きなだけ進める。30 分の再生も一瞬で確かめる。

## 論理時刻 (ADR-0006)

```
logical(now) = anchor.logical + (now - anchor.mono)   (再生中)
logical      = anchor.logical                          (一時停止中・停止中)
```

- アンカー `{ logical, mono }` は、開始・一時停止・再開・シーク・同期・補正のたびに付け直す
- タイマーの回数で時間を数えない。タイマーが何秒遅れても、次に時計を読めば正しい論理時刻になる
- 単位はミリ秒の整数 (02)。0 は戦闘開始 (プル)。プルカウント中は負

## フェーズ

- 実行時のフェーズは `{ phaseId, startLogical }` の列で持つ (開始したフェーズの履歴)
- `absolute` のフェーズは、論理時刻が `start.at` に達したら自動で始まる
- `manual` のフェーズは、`startPhase(phaseId)` が呼ばれたときに、その瞬間の論理時刻で始まる。押されるまでは前のフェーズのまま時刻が進む (前のフェーズの最後のイベントより後でも)
- 今のフェーズは「履歴の最後」。フェーズ時刻は `logical - startLogical`
- 通知の鳴る論理時刻は、そのフェーズが始まって初めて決まる。まだ始まっていないフェーズの通知は予定に入らない

## 予定とタイマー

```
process():
  t = logical(clock.now())
  absolute のフェーズの自動開始を反映する
  due = 未実行の通知のうち、鳴る論理時刻 <= t + lookahead のもの (時刻順)
  for n in due:
    late = t - n.fireLogical
    if late > lateTolerance: missed に入れる (skipped)
    else: onFire(n, dueAtMono(n)); fired に入れる
  if missed が空でない: onMissed(missed, 最大の late)
  次に鳴る通知 (と次の absolute のフェーズの開始) までのタイマーを 1 本張る
```

- タイマーは常に 1 本。張り直すときは前のものを消す
- タイマーが早く起きたら (ブラウザの丸めで起こりうる)、何も鳴らさずに張り直すだけ
- `dueAtMono(n)` は、その通知が鳴るべき単調時計の時刻。作ってから鳴らす型 (04) はこれで Web Audio の時刻を決める
- 同じ瞬間の通知は、`priority` の高い順、次にスクリプトの順で知らせる。競合の扱いは speech が決める (04)

### ブラウザのタイマー

`apps/web` の `Timer` は 2 つ用意し、PoC-001 で選ぶ (ADR-0006 の仮の値)。

- **Worker のタイマー**: 専用 Worker の中で `setTimeout` し、起きたらメインスレッドへ `postMessage`。見えないタブでのメインスレッドのタイマーの間引きを受けにくい
- **メインスレッドのタイマー**: `setTimeout` そのまま

どちらでも、論理時刻は時計から計算するのでずれない。違いは「気づくのがどれだけ遅れるか」だけ。

## 状態機械

| 状態        | 意味                                                               |
| ----------- | ------------------------------------------------------------------ |
| `ready`     | 読み込んだ。時刻は 0 (またはカウントの開始の負の値) で止まっている |
| `countdown` | プルカウント中。論理時刻は負で進む                                 |
| `running`   | 戦闘中。論理時刻は 0 以上で進む                                    |
| `paused`    | 一時停止。時刻は止まる                                             |
| `finished`  | 最後のフェーズの最後の通知を過ぎた (時刻は進み続ける。一覧は空)    |

| 操作                  | 前の状態                                     | 後の状態                          | 何が起きるか                                                                 |
| --------------------- | -------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `startCountdown(sec)` | `ready`                                      | `countdown`                       | 論理時刻を `-sec` にして進める。0 で `running` へ                            |
| `start()`             | `ready`、`countdown`                         | `running`                         | 論理時刻を 0 にして進める (カウント中に押したら、そこを 0 にする)            |
| `pause()`             | `countdown`、`running`、`finished`           | `paused`                          | アンカーを止める。鳴っているコールは speech が止める                         |
| `resume()`            | `paused`                                     | 前の状態                          | 止めた論理時刻から進める                                                     |
| `stop()`              | どれでも                                     | `ready`                           | 未実行の予定を捨てる (要件 FR-101)。実行済みの集合とフェーズの履歴を空にする |
| `restart()`           | どれでも                                     | `ready`                           | `stop()` と同じ。画面で「もう一度カウント」にすぐ移れる                      |
| `seek(logical)`       | `countdown`、`running`、`paused`、`finished` | 同じ (`finished` は `running` へ) | 下の「補正」                                                                 |
| `nudge(deltaMs)`      | 同上                                         | 同上                              | `seek(logical + delta)`                                                      |
| `syncTo(eventId)`     | 同上                                         | 同上                              | そのイベントの時刻を今にする。下                                             |
| `startPhase(phaseId)` | `running`、`paused`                          | 同じ                              | `manual` のフェーズを今始める。`absolute` のフェーズなら `seek(start.at)`    |
| `undo()`              | 同上                                         | 同じ                              | 直前の補正 (seek、nudge、syncTo、startPhase) を取り消す                      |

`stop()` を押し間違えると戦闘中に何も鳴らなくなるので、画面は長押しか 2 回押しにする (05)。

## 補正と実行済み (ADR-0006)

`seek(target)` は次をする。補正の前の状態 (アンカー、フェーズの履歴、実行済みの集合) を `undo` のために 1 つ取っておく。

1. **フェーズの履歴を直す**: `target` が `manual` のフェーズの開始より前なら、そのフェーズ (と後のもの) を履歴から外す (まだ始まっていないことに戻す)。`absolute` のフェーズは `target` から決まる
2. **進めたとき** (`target > 今`): 今から `target` までに鳴るはずだった未実行の通知を、鳴らさずに `skipped` にする
3. **戻したとき** (`target < 今`): `rewindPolicy` に従う (下)
4. アンカーを `{ logical: target, mono: now }` にして、タイマーを張り直す

要件 FR-105 の「過去のイベントが再実行されない」は、2 (飛び越えた過去を鳴らさない) で満たす。

### 戻したとき (仮。実戦で試してから決める)

戻したあとに鳴らし済みの通知をもう一度鳴らすかは、精度の問題ではなく使い方の問題で、PoC では答えが出ない。M2 の試作を実戦で使ってから決める (ADR-0006、RM-32)。それまでは `rewindPolicy` で切り替えられるようにし、設定画面にも出す。

| `rewindPolicy`            | 動き                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `by-operation` (仮の既定) | 小さな補正 (`nudge`、`syncTo`) では鳴らし済みのまま。大きな戻し (`seek` で時刻やフェーズの開始を指定) では、戻した先より後を未実行に戻す |
| `keep`                    | どの操作でも鳴らし済みのまま (要件 FR-105 の文面どおり)                                                                                  |
| `rearm`                   | どの操作でも、戻した先より後を未実行に戻す                                                                                               |

`by-operation` を仮の既定にしたのは、戦闘中にいちばん多い操作が「アプリが早い分を -1s で直す」ことだから。このとき直前に鳴ったコールがもう一度鳴ると邪魔になる。一方で、フェーズの頭まで戻すのは「やり直したい」ときなので、もう一度鳴ってほしい。

次の例は `by-operation` のとき。

例 (通知 A が 10 秒、B が 20 秒、C が 30 秒に鳴る):

| 操作               | A     | B       | C      |
| ------------------ | ----- | ------- | ------ |
| 12 秒まで再生      | fired | 未実行  | 未実行 |
| `seek(25s)`        | fired | skipped | 未実行 |
| `seek(15s)` (戻す) | fired | 未実行  | 未実行 |
| 30 秒まで再生      | fired | fired   | fired  |

### イベント同期

`syncTo(eventId)`: そのイベントの論理時刻が「今」になるように `seek` する。

- イベントが今のフェーズにあれば `seek(phase.startLogical + event.at)`
- イベントがまだ始まっていない `manual` のフェーズにあれば、そのフェーズを `now - event.at` に始めたことにする (フェーズの開始を押し忘れたときの救い)
- そのイベント自身の通知 (`before` 付きのもの) は、鳴るはずの時刻を過ぎているので `skipped` になる

## 大きな時間差 (スリープ、タブの停止)

- `process()` で、遅れて気づいた通知が `lateTolerance` を超えたら鳴らさず `onMissed` を出す。画面は「時間がずれた可能性があります。イベント同期で合わせてください」を出す
- `apps/web` は `visibilitychange` で見えるようになったときに `process()` を呼ぶ
- 時計そのもの (`performance.now()`) はスリープ中も進むので、論理時刻は実時間に合ったまま。ずれるのはゲームの側 (スリープ中も戦闘が進んでいる) ではなく、鳴らし損ねた通知があること

## スナップショット

`snapshot()` は、画面が読むための不変の値を返す。

```ts
type EngineSnapshot = {
  state: EngineState;
  logicalMs: number;
  phase: { id: string; name: string; phaseMs: number } | null;
  upcoming: UpcomingNotification[]; // 次の N 件。残り時間つき
  fired: ReadonlySet<NotificationId>;
  skipped: ReadonlySet<NotificationId>;
  canUndo: boolean;
};
```

`snapshot()` は時計を読むだけで状態を変えない。`requestAnimationFrame` ごとに呼んでよい。

## テストで確かめること

- 偽の時計で 30 分 (と 2 時間) 再生し、すべての通知が予定の論理時刻ちょうどに知らされる (累積のずれ 0、要件 11.3-5)
- タイマーがランダムに遅れても (偽のタイマーが 0〜900ms 遅れて起きる)、知らせる時刻の遅れは各回のタイマーの遅れを超えず、積もらない
- 上の表の `seek` の例
- `rewindPolicy` の 3 つで、`nudge(-1s)` の直後に、直前に鳴った通知がもう一度鳴るか鳴らないかが表のとおりになる
- `lateTolerance` を超えた通知は鳴らずに `onMissed` に入る
- `manual` のフェーズは押すまで始まらず、押した瞬間からフェーズ時刻が 0 になる
- `syncTo` で、まだ始まっていない `manual` のフェーズのイベントに合わせるとフェーズが始まる
- `undo` で補正の前に戻る
- 同じ瞬間の通知は `priority` の順に知らされる

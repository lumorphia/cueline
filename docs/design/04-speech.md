# 04. 読み上げ

`@timeline-call/speech`。engine から受け取った通知を、選んだエンジンの声で鳴らす (ADR-0010)。

## 境界

```ts
type Call = {
  id: NotificationId;
  text: string;
  language: string; // metadata.language
  priority: "low" | "normal" | "high";
  dueAtMono: number; // 鳴るべき単調時計の時刻 (03)
};

interface SpeechProvider {
  readonly kind: "immediate" | "prepared"; // その場で読む型 / 作ってから鳴らす型
  status(): ProviderStatus; // ready / unavailable (理由つき)
  prepare(texts: readonly string[], onProgress?): Promise<PrepareResult>; // immediate は何もしない
  speak(call: Call): CallHandle; // prepared は dueAtMono に合わせて鳴らす
  cancel(): void; // 鳴っているもの、待っているものを全部止める
  test(text: string): Promise<void>; // 要件 FR-206
}
```

- `SpeechManager` が今のプロバイダと設定を持ち、`CallArbiter` を通して `speak` する
- ブラウザの API (`speechSynthesis`、`AudioContext`、`fetch`) は各プロバイダの中だけで使う。テストでは偽のプロバイダを渡す

## 競合 (要件 FR-205、Call Arbiter)

鳴っている最中に次のコールが来たときの扱い。設定で選ぶ。

| 方式        | 動き                                                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| 中断 (既定) | 鳴っているものを `cancel` し、新しいものを鳴らす                                                                        |
| 順番        | 待ち行列に入れ、終わったら次。行列は 3 件まで (超えたら古いものから捨てる)。予定から 2 秒以上遅れたものは鳴らさず捨てる |
| 優先度      | 新しいものの `priority` が鳴っているもの以上なら中断して鳴らす。低ければ捨てる                                          |

- どの方式でも、行列は無制限に伸びない (要件 FR-205)
- 捨てたコールは画面の一覧に「鳴らさなかった」として出す (実行済みの区別と別。engine の状態は変えない)
- 既定は「中断」。PoC-002 で、PC の Chrome で最後のコールが毎回最後まで鳴った (`docs/spikes/poc-002-speech.md`)
- 中断された読み上げの `interrupted` の知らせは、次の読み上げを始めた後に届く。プロバイダの知らせはどのコールのものかを見て、今のコールでなければ読み捨てる

## Web Speech (P0、要件 FR-201)

- 声: `speechSynthesis.getVoices()` を、`voiceschanged` を待って読む。`metadata.language` に合う声を先に並べる。設定で選んだ声が無ければ、言語の合う最初の声にし、画面で知らせる
- 速さ (0.5〜2.0)、音量 (0〜1)、高さ (0〜2) は `SpeechSynthesisUtterance` に渡す
- 中断は `speechSynthesis.cancel()` してから、間を空けずに `speak()`。PoC-002 で、PC の Chrome は cancel の直後でも 20 回とも落ちなかった (話し始めはふだんより 45ms ほど遅い)。iPhone で落ちるなら間を空ける
- オンラインの声 (Edge の「Natural」の声など) は、通信の遅れとオフラインで鳴らないおそれがある。声の一覧で「オンライン」(`localService === false`) と分かるようにし、既定では端末の中の声を選ぶ
- `onstart` までの遅れ (立ち上がり) を測り、設定画面に出す (PoC-002 の道具をそのまま使う)

### 音のアンロック (ADR-0009)

スマホでは、利用者の操作の中でなければ音を鳴らし始められない。プルカウント・開始・テストの各ボタンの押下の中で、次を一度行う。

1. 空 (音量 0) の `SpeechSynthesisUtterance` を `speak`
2. `AudioContext` を作り `resume()` (作ってから鳴らす型と、背景での間引きの対策に使う)

アンロックできなかったら (`AudioContext.state` が `running` にならない)、「画面をタップしてください」を出す。

### 見えないタブでの間引き

PC で、タブが隠れている (最小化、別のタブを前にした) と、ブラウザはタイマーを間引く。音を鳴らしているページは間引きが緩むことがあるので、再生中は `AudioContext` を動かしたままにする案がある。効くかどうか、無音で足りるかは PoC-001 で確かめ、効かなければ「タブを見えるところに置いてください」と画面で案内する (要件 13 章)。

## VOICEVOX (P1、要件 FR-202〜FR-204)

- 接続先は設定で指定する。既定は `http://127.0.0.1:50021`。スクリプトは接続先を持たない (NFR-102)
- 接続の確認は `GET /version` と `GET /speakers`。失敗の理由 (届かない、CORS、ブラウザの許可が要る) を分けて出し、直し方の案内を出す (PoC-003 の結果で書く)
- 生成は `POST /audio_query` → 速さ・高さ・抑揚・音量を書き換え → `POST /synthesis` (WAV)。同時に 2 本まで
- `prepare(texts)`: スクリプトの読み上げの文を集め、同じ文を 1 つにし (要件 FR-203)、キャッシュに無いものだけを作る。進み具合を出す。再生の開始前に終える
- 作った音声は `decodeAudioData` で `AudioBuffer` にして手元に置き、`speak` では `AudioBufferSourceNode.start(when)` で `dueAtMono` に合わせて鳴らす。`when` は `performance.now()` と `AudioContext.currentTime` の対応 (`getOutputTimestamp()`) から計算する
- engine には `lookaheadMs` (300 など) を渡し、少し早めに知らせてもらって予約する (03)
- 作れなかった文は Web Speech で鳴らす (要件 13 章「標準 TTS への切り替え」)

### キャッシュ (要件 FR-204)

キーは次を正規化して並べた文字列の SHA-256。

```
engine=voicevox
engineVersion=<GET /version>
speaker=<style id>
speed=<1.00> pitch=<0.00> intonation=<1.00> volume=<1.00>
text=<NFC にした文>
```

保存は IndexedDB (06)。WAV のまま入れる。

## 音声パック (P1、要件 FR-207)

PC で作った音声を、タイムラインと一緒にスマホへ渡すためのファイル。拡張子は `.tcpack` (中身は zip)。

```
manifest.json
timeline.yaml        書き出したスクリプト (02 の最新の版)
audio/<key>.wav      キャッシュのキーをファイル名にした音声
```

```json
{
  "format": 1,
  "engine": { "name": "voicevox", "version": "x.y.z" },
  "voice": { "speaker": "話者名", "style": "スタイル名", "styleId": 0 },
  "params": { "speed": 1.0, "pitch": 0.0, "intonation": 1.0, "volume": 1.0 },
  "credits": ["VOICEVOX:話者名"],
  "entries": [{ "key": "<sha256>", "text": "5秒後、全体攻撃", "file": "audio/<sha256>.wav" }]
}
```

- 読み込むときは、`timeline.yaml` をふつうのスクリプトと同じ検証に通す (07)。`entries` に無い文は Web Speech で鳴らす
- 上限: パック全体 100 MiB、音声 1 つ 5 MiB、entries 5000。zip の展開後の大きさも数える (zip 爆弾の対策)
- クレジットは再生画面と設定画面に出す。話者によって配布に条件があるので、書き出すときに「他の人に渡す前に、話者の利用規約を確かめてください」と出す (ADR-0010)

## テストで確かめること

- 3 つの競合の方式が、偽のプロバイダの上で表のとおりに動く
- 「順番」の行列が 3 件を超えない
- 「優先度」で低いものが捨てられ、画面に「鳴らさなかった」として出る
- キャッシュのキーは、同じ設定で同じ、どれか 1 つ違えば違う
- 音声パックの往復 (書き出して読み込むと同じ entries になる) と、上限を超えたパックを断ること

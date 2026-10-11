# 02. タイムラインスクリプト (v1)

スクリプトは宣言的なデータ (ADR-0007)。YAML と JSON のどちらでも書け、同じ形に読み込む。

## 例

架空のボスのサンプル (要件 FR-007。同梱するものの縮小版)。

```yaml
version: 1

metadata:
  id: sample-crystal-golem
  name: "サンプル: 水晶のゴーレム"
  description: "架空のボスで作った、仕様を一通り使うサンプル"
  author: "Lumorphia"
  language: ja-JP
  tags:
    - id: tank
      label: "タンク"
    - id: healer
      label: "ヒーラー"
    - id: dps
      label: "DPS"

countdown:
  default: 15

defaults:
  before: 3

phases:
  - id: p1
    name: "フェーズ1"
    start:
      type: absolute
      at: 0
    events:
      - id: prepull-buff
        at: -5
        name: "プル前のバフ"
        notifications:
          - type: speech
            before: 0
            text: "バフ"
            tags: [healer]

      - id: crystal-roar-1
        at: 12.5
        name: "クリスタルロア"
        notifications:
          - type: speech
            before: 5
            text: "5秒後、全体攻撃"
          - type: display
            before: 5
            text: "全体攻撃"

      - id: shard-buster-1
        at: 30
        name: "シャードバスター"
        notifications:
          - type: speech
            text: "タンク強攻撃"
            tags: [tank]
            priority: high

  - id: p2
    name: "フェーズ2"
    start:
      type: manual
    events:
      - id: prism-spread-1
        at: 8
        name: "プリズム散開"
        notifications:
          - type: speech
            text: "散開"
```

## 項目

### トップ

| キー        | 型     | 必須 | 説明                                                |
| ----------- | ------ | ---- | --------------------------------------------------- |
| `version`   | 整数   | ○    | スキーマの版。今は `1`                              |
| `metadata`  | object | ○    | 下                                                  |
| `countdown` | object |      | `default`: プルカウントの既定秒数 (0 < x ≤ 60)      |
| `defaults`  | object |      | `before`: 通知の `before` を省いたときの値 (既定 0) |
| `phases`    | array  | ○    | 1 つ以上                                            |

### `metadata`

| キー          | 型     | 必須 | 説明                                                                        |
| ------------- | ------ | ---- | --------------------------------------------------------------------------- |
| `id`          | 文字列 | ○    | `^[a-z0-9][a-z0-9-]{0,63}$`。保存のときの名前の衝突に使う                   |
| `name`        | 文字列 | ○    | 1〜100 文字                                                                 |
| `description` | 文字列 |      | 〜1000 文字                                                                 |
| `author`      | 文字列 |      | 〜100 文字                                                                  |
| `language`    | 文字列 | ○    | 読み上げの言語 (BCP 47。`ja-JP`、`en-US` など)。画面の言語とは別 (ADR-0011) |
| `tags`        | array  |      | 使うタグの一覧。`id` (`^[a-z0-9][a-z0-9-]{0,31}$`) と `label` (〜32 文字)   |

### `phases[]`

| キー     | 型     | 必須 | 説明                                               |
| -------- | ------ | ---- | -------------------------------------------------- |
| `id`     | 文字列 | ○    | `^[a-z0-9][a-z0-9-]{0,63}$`。スクリプトの中で一意  |
| `name`   | 文字列 | ○    | 1〜100 文字                                        |
| `start`  | object | ○    | `{ type: absolute, at: 秒 }` か `{ type: manual }` |
| `events` | array  | ○    | 0 個以上                                           |

- `absolute` の `at` は **論理時刻** (戦闘開始からの秒)。0 以上
- `manual` は利用者がボタンを押したときに始まる (ADR-0008)
- **最初のフェーズは `absolute` の `at: 0`**。プルの瞬間に始まるフェーズが要る
- `absolute` のフェーズは `at` の昇順に並べる
- **`manual` のフェーズより後のフェーズは、すべて `manual`**。`manual` の開始時刻は実行時にしか分からないので、その後に論理時刻の決め打ちを置けない。フェーズの中の時刻はフェーズ時刻で書けるので、これで足りる

### `phases[].events[]`

| キー            | 型     | 必須 | 説明                                                                                               |
| --------------- | ------ | ---- | -------------------------------------------------------------------------------------------------- |
| `id`            | 文字列 | ○    | `^[a-z0-9][a-z0-9-]{0,63}$`。**スクリプト全体で一意** (フェーズをまたいで)                         |
| `at`            | 数     | ○    | フェーズ時刻 (秒、小数可、ミリ秒まで)。負の値は最初のフェーズでだけ許す (プルカウント中のイベント) |
| `name`          | 文字列 | ○    | 1〜100 文字。一覧とイベント同期のボタンに出す                                                      |
| `notifications` | array  |      | 0〜10 個                                                                                           |

### `notifications[]`

| キー       | 型                          | 必須 | 説明                                                                    |
| ---------- | --------------------------- | ---- | ----------------------------------------------------------------------- |
| `type`     | `speech` \| `display`       | ○    | 読み上げか、画面に大きく出すか                                          |
| `text`     | 文字列                      | ○    | 1〜200 文字                                                             |
| `before`   | 数                          |      | イベントの何秒前に鳴らすか (0 以上、600 以下)。省くと `defaults.before` |
| `tags`     | 文字列の配列                |      | `metadata.tags` の `id`。省くと全員に鳴る                               |
| `priority` | `low` \| `normal` \| `high` |      | 競合の「優先度」方式で使う。既定 `normal` (04)                          |
| `enabled`  | 真偽                        |      | 既定 `true`。`false` は一覧には出すが鳴らさない                         |

通知の ID は `<イベントの id>#<通知の位置>` (例 `crystal-roar-1#0`) で、展開のときに付ける。実行済みの集合はこの ID で持つ (ADR-0006)。

## 時刻

- 通知が鳴るフェーズ時刻は `at - before`。論理時刻は `フェーズの開始 + at - before`
- フェーズ時刻と論理時刻は、型の上でも別にする (`PhaseSeconds` と `LogicalSeconds` の branded type)
- 時刻は数で受け、内部ではミリ秒の整数 (`Math.round(秒 * 1000)`) にして扱う。比較で浮動小数の誤差を起こさない
- `manual` のフェーズの通知は、鳴るフェーズ時刻が 0 以上でなければならない (始まる前に鳴らすことはできない)。0 未満はエラー
- `absolute` のフェーズで、鳴る論理時刻が `-countdown` より前になるものは警告 (プルカウントを短くすると鳴らない)
- `absolute` のフェーズで、次のフェーズの開始より後にあるイベントは警告 (フェーズが重なっている。鳴らすことはできる)

## 検証の段

`parseScript(text, { format? }) -> Result<Script, ScriptIssue[]>`。前の段で失敗したら次の段に進まない。

1. **大きさ**: 文字数が上限を超えたら読まない
2. **読み取り**: 拡張子か `format` で YAML / JSON を決める (分からなければ YAML。JSON は YAML として読める)。YAML は `yaml` パッケージで、スキーマ `core`、独自のタグなし、`maxAliasCount` を上限に、重複したキーはエラー
3. **版**: `version` が無い・整数でない・知らない版なら、ここで止める。新しすぎる版は「アプリを更新してください」
4. **形**: その版の zod のスキーマ (`.strict()`。未知のキーはエラー)
5. **意味**: ID の重複 (フェーズ、イベント)、タグの参照、フェーズの並びと `manual` の後の規則、時刻の規則、数の上限
6. **移行**: 最新の版へ。v1 しか無い今は何もしない

`ScriptIssue`:

```ts
type ScriptIssue = {
  severity: "error" | "warning";
  code: ScriptIssueCode; // "duplicate_event_id" など。画面の文言はこれを辞書で引く (ADR-0011)
  path: (string | number)[]; // ["phases", 1, "events", 0, "at"]
  params?: Record<string, string | number>; // 文言に埋める値
  line?: number; // YAML の行 (分かるとき)
};
```

エラーが 1 つでもあれば読み込まない。警告だけなら読み込み、画面に出す。

## 上限 (初期値)

| 項目                        | 上限          |
| --------------------------- | ------------- |
| スクリプトの大きさ          | 1 MiB         |
| YAML のエイリアスの数       | 100           |
| 入れ子の深さ                | 16            |
| フェーズ数                  | 50            |
| イベント数 (全体)           | 2000          |
| 1 イベントの通知数          | 10            |
| 通知数 (全体、展開後)       | 5000          |
| タグの数                    | 32            |
| 時刻の範囲 (`at`、論理時刻) | -60〜36000 秒 |

上限は `packages/script` の 1 か所に置き、テストで「上限ちょうどは通り、1 つ超えると断る」を確かめる。

## 書き出し (要件 FR-005)

`serializeScript(script, "yaml" | "json")`。読み込んだ版ではなく最新の版で書き出す。キーの順は上の表の順に揃え、`before` などの既定値は省かずに書く (他人が読んで分かるように)。書き出したものを読み直すと同じ `Script` になることを、テストで確かめる (往復のテスト)。

## 後の版に入れるもの (予約)

- **分岐 (要件 FR-106、P1)**: フェーズに `branches: [{ id, label, goto: phaseId }]` を持たせ、利用者が選ぶ。v2 で入れる
- **ループ (要件 FR-107、P1)**: イベントに `repeat: { count, every }`。展開後の数を上限で縛る。v2 で入れる
- **他の形式からの取り込み (要件 9.5、P2)**: `packages/script` の外 (`packages/import-*`) に変換器を置き、変換した結果を v1 / v2 のスクリプトとして同じ検証に通す。ログで同期する指示は読み捨てる (ADR-0005)
- **JSON Schema**: zod から生成して書き出し、エディタの補完に使えるようにする (M2)

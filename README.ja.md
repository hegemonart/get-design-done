<div align="center">

# GET DESIGN DONE

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語** · [한국어](README.ko.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Deutsch](README.de.md)

**AI コーディングエージェントのためのデザイン品質パイプライン: ブリーフ → 探索 → 計画 → 実装 → 検証。**

**Get Design Done は、AI が生成した UI をあなたのブリーフ、デザインシステム、リファレンス、品質ゲートに結びつけたまま進めます。Claude Code、OpenCode、Gemini CLI、Kilo、Codex、Copilot、Cursor、Windsurf、Antigravity、Augment、Trae、Qwen Code、CodeBuddy、Cline で動作します。**

[![npm version](https://img.shields.io/npm/v/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![npm downloads](https://img.shields.io/npm/dm/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![CI](https://img.shields.io/github/actions/workflow/status/hegemonart/get-design-done/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/hegemonart/get-design-done/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/hegemonart/get-design-done?style=for-the-badge&logo=github&color=181717)](https://github.com/hegemonart/get-design-done)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

<br>

```bash
npx @hegemonart/get-design-done@latest
```

**macOS、Linux、Windows で動作します。**

<br>

*「AI コーディングエージェントは UI を速く出荷します。Get Design Done は、それがデザインとして出荷されるようにします。」*

<br>

[なぜ作ったか](#なぜ作ったか) · [仕組み](#仕組み) · [コマンド](#コマンド) · [接続](#接続) · [なぜ動くか](#なぜ動くか)

</div>

---

> [!IMPORTANT]
> ### Claude Design バンドルをすでにお持ちですか?
>
> [claude.ai/design](https://claude.ai/design) でデザインをエクスポートした場合、ステージ 1〜3 を完全にスキップできます:
>
> ```
> /gdd:handoff ./my-design.html
> ```
>
> バンドルの CSS カスタムプロパティを D-XX デザイン決定としてパースし、Handoff Faithfulness スコアリングを伴う検証パスを実行し、オプションで実装ステータスを Figma に書き戻します。

---

## なぜ作ったか

私は AI コーディングエージェントで出荷するデザイナーです。コード側のワークフローは成熟しています。仕様、タスク、テスト、コミット、レビューのループ。デザイン側はそうではありませんでした。

繰り返し直面した問題はこうでした。エージェントは単体ではよく見える画面を生成できますが、作業そのものは *切り離されています*。トークンは既存システムと一致しません。コントラスト比は WCAG を下回ります。階層は画面ごとに再発明されます。古いアンチパターンが新しいコンポーネントに入り込みます。そして元のブリーフに対して出力を検証するものがないため、問題は PR レビューやハンドオフ後に遅れて見つかります。

そこで Get Design Done を作りました。AI コーディングエージェントに、開発者がエンジニアリングワークフローで当然期待している構造を与えるデザインパイプラインです。ブリーフを捕捉し、現在のデザインシステムをマッピングし、判断をリファレンスに接地し、作業を原子的なタスクに分解し、そのタスクを実行し、出荷前に結果を検証します。

舞台裏には 37 個の専門エージェント、クエリ可能なインテルストア、ティア対応モデルルーティング、12 個の任意ツール接続、原子的コミット、solidify-with-rollback の結果から学習する no-regret 適応レイヤーがあります。日常的に使うのは、デザイン作業を一貫させる数個の `/gdd:*` コマンドです。

— **Hegemon**

---

AI 生成デザインは AI 生成コードと同じ失敗形態を持ちます。望むものを記述し、もっともらしいものを受け取り、しかし出力をブリーフに戻すシステムがないため、規模を拡大すると崩れます。

Get Design Done はデザイン作業のためのコンテキストエンジニアリングレイヤーです。「この UI を良くして」を、追跡可能なサイクルに変えます: ブリーフ → インベントリ → リファレンス → 計画 → 実装 → 検証。

---

## 得られるもの

- **ブリーフに接地したデザイン作業** — 各サイクルは問題、対象ユーザー、制約、成功指標、必須要件から始まります。
- **デザインシステム抽出** — GDD は変更を計画する前に、トークン、タイポグラフィ、スペーシング、コンポーネント、モーション、アクセシビリティ、ダークモード、デザイン負債をインベントリします。
- **リファレンスに支えられた判断** — エージェントは組み込みのデザインリファレンスに加え、任意で Figma、Refero、Pinterest、Storybook、Chromatic、Preview、Claude Design、paper.design、pencil.dev、Graphify、21st.dev Magic、Magic Patterns 接続を使います。
- **原子的な実行** — デザインタスクは依存関係ごとに分解され、安全な wave で実行され、独立してコミットされます。
- **出荷前の検証** — 監査はブリーフ適合、トークン統合、WCAG コントラスト、コンポーネント適合、モーション一貫性、ダークモードアーキテクチャ、デザインアンチパターンをチェックします。
- **検証失敗時のロールバック** — solidify-with-rollback は各タスクが定着する前に検証します。失敗した作業は自動的に戻されます。

---

## 誰のためか

GDD は、AI コーディングエージェントで UI を出荷し、最初のスクリーンショットを超えて結果が保つことを求めるエンジニア、デザイナー、デザインエンジニア、創業者、プロダクトビルダーのためのものです。

トークンが一致すること、コントラストが WCAG を通過すること、モーションが一貫すること、コンポーネントがシステムに従うこと、最終実装が依頼内容にまだ一致していることを重視するなら使う価値があります。

デザイナーである必要はありません。パイプラインがデザインの規律をエージェントワークフローに持ち込みます。コンテキストを抽出し、足りない判断だけを尋ね、作業をリファレンスに接地し、通常は遅すぎる段階で見つかる問題を先に捕捉します。

### v1.24.0 ハイライト — マルチランタイム・インストーラー

- **`@clack/prompts` 対話型マルチセレクト** — `npx @hegemonart/get-design-done` をフラグなしで実行すると、サポートされる 14 ランタイム(Claude Code、OpenCode、Gemini CLI、Kilo、Codex、Copilot、Cursor、Windsurf、Antigravity、Augment、Trae、Qwen Code、CodeBuddy、Cline)用の洗練されたチェックボックス UI と Global / Local ラジオボタンが表示されます。
- **冪等 + 外部 AGENTS.md 安全** — インストーラーを再実行してもエントリは重複せず、ランタイム固有の指示ファイルを上書きしません。ファイルが書き込まれる前に確認ステップで diff が表示されます。
- **スクリプト CI インターフェイスを保持** — 既存のすべてのフラグ(`--claude`、`--cursor`、`--all`、`--global`、`--local`、`--uninstall`、`--config-dir`)は変更なく動作し続けます。インタラクティブモードはランタイムフラグが渡されない場合のみアクティブ化されます。
- **マルチセレクト・アンインストール** — ランタイムフラグなしの `--uninstall` も対話型マルチセレクトに入り、どのランタイムから削除するかを選びます。

### 以前のリリース

- **v1.23.5** — No-Regret 適応レイヤー(Thompson サンプリングバンディット + AdaNormalHedge アンサンブル + MMR リランク; informed-prior ブートストラップで単一ユーザー可能、opt-in テレメトリ不要)。
- **v1.23.0** — SDK ドメインプリミティブ(solidify-with-rollback ゲート、JSON 出力契約、`Touches:` パターン自動結晶化)。
- **v1.22.0** — SDK 観測可能性(約 24 のタイプ付きイベント、ツールコールごとのトラジェクトリ、追記専用イベントチェーン、シークレットスクラバー)。
- **v1.21.0** — ヘッドレス SDK(Claude Code なしで完全パイプラインを実行する `gdd-sdk` CLI、並列リサーチャー、クロスハーネス MCP)。
- **v1.20.0** — SDK 基盤(レジリエンスプリミティブ、ロックファイル安全な `STATE.md`、11 のタイプ付きツールを持つ `gdd-state` MCP サーバー、TypeScript 基盤)。

完全なリリースノートは [CHANGELOG.md](CHANGELOG.md) を参照。

---

<p align="center">
  <a href="https://www.humbleteam.com/" target="_blank" rel="noopener noreferrer" title="Humbleteam - product design partner">
    <strong>Supported by Humbleteam</strong><br><br>
    <img src="docs/assets/sponsors/humbleteam.svg" alt="Humbleteam product design partner" width="180">
  </a>
</p>

---

## はじめに

```bash
npx @hegemonart/get-design-done@latest
```

インストーラーは以下の選択を促します:
1. **ランタイム** — Claude Code、OpenCode、Gemini、Kilo、Codex、Copilot、Cursor、Windsurf、Antigravity、Augment、Trae、Qwen Code、CodeBuddy、Cline、またはすべて(対話型マルチセレクト)
2. **場所** — Global(すべてのプロジェクト)または Local(現在のプロジェクトのみ)

確認:

```
/gdd:help
```

> [!TIP]
> 摩擦のない自動化体験のために、Claude Code を `--dangerously-skip-permissions` で実行することを推奨します。GDD は自律的なマルチステージ実行のために設計されています。

### 最新の状態を保つ

GDD は頻繁にリリースされます。インストーラーを再実行してください(冪等で、登録済みマーケットプレイスエントリをその場で更新します):

```bash
npx @hegemonart/get-design-done@latest
```

または Claude Code 内から:

```
/gdd:update
```

`/gdd:update` は適用前に changelog をプレビューします。`reference/` 下のローカル修正は保持されます — 構造的更新後に再ステッチが必要な場合は `/gdd:reapply-patches` を実行します。

<details>
<summary><strong>非対話型インストール(Docker、CI、スクリプト)</strong></summary>

```bash
npx @hegemonart/get-design-done --claude --global
npx @hegemonart/get-design-done --claude --local
npx @hegemonart/get-design-done --opencode --global
npx @hegemonart/get-design-done --gemini --global
npx @hegemonart/get-design-done --kilo --global
npx @hegemonart/get-design-done --codex --global
npx @hegemonart/get-design-done --copilot --global
npx @hegemonart/get-design-done --cursor --global
npx @hegemonart/get-design-done --windsurf --global
npx @hegemonart/get-design-done --antigravity --global
npx @hegemonart/get-design-done --augment --global
npx @hegemonart/get-design-done --trae --global
npx @hegemonart/get-design-done --qwen --global
npx @hegemonart/get-design-done --codebuddy --global
npx @hegemonart/get-design-done --cline --global

# すべてのランタイム
npx @hegemonart/get-design-done --all --global

# ドライラン
npx @hegemonart/get-design-done --dry-run

# カスタム設定ディレクトリ
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

</details>

<details>
<summary><strong>代替: Claude Code CLI</strong></summary>

```bash
claude plugin marketplace add hegemonart/get-design-done
claude plugin install get-design-done@get-design-done
```

</details>


## 仕組み

> **既存のコードベースから始めますか?** まず `/gdd:map` を実行してください。5 つの専門マッパー(tokens、components、visual hierarchy、a11y、motion)が並列にディスパッチされ、`.design/map/` に構造化された JSON を書き込みます。

### 1. Brief(ブリーフ)

```
/gdd:brief
```

スキャンや探索の前にデザイン問題を捕捉します。`AskUserQuestion` を介して 1 度に 1 つの質問形式で — 未回答セクションについてのみ: 問題、対象者、制約、成功指標、スコープ。

**生成:** `.design/BRIEF.md`

---

### 2. Explore(探索)

```
/gdd:explore
```

現在のコードベースのデザインシステムをインベントリします — 色、タイポグラフィ、間隔、コンポーネント、モーション、a11y、ダークモード。5 つの並列マッパーと `design-discussant` インタビューが 3 つの成果物を生成します。接続プローブが 12 の外部ツールの可用性を検出します。

**生成:** `.design/DESIGN.md`、`.design/DESIGN-DEBT.md`、`.design/DESIGN-CONTEXT.md`、`.design/map/{tokens,components,a11y,motion,visual-hierarchy}.{md,json}`

---

### 3. Plan(計画)

```
/gdd:plan
```

Explore 出力を原子的でウェーブ協調型、依存関係分析済みのデザインタスクに分解します。各タスクは明示的な `Touches:` パス、並列安全タグ、受け入れ基準を持ちます。`design-planner`(opus)が作成し、`design-plan-checker`(haiku)が実行前にゲートチェックします。

**生成:** `.design/DESIGN-PLAN.md`

---

### 4. Design(実行)

```
/gdd:design
```

タスクをウェーブ順に実行します。各タスクは専用の `design-executor` エージェントを取得し、新しい 200k コンテキスト、原子 git コミット、コンテキスト内ルールに従った自動偏差処理を持ちます。並列安全タスクは worktree で実行されます。

**Solidify-with-rollback**(v1.23.0) — すべてのタスクは固定前に検証(typecheck + build + ターゲットテスト)。検証失敗 → `git stash` 巻き戻し。

**生成:** タスクごとに `.design/tasks/task-NN.md`、タスクごとに原子 git コミット

```
┌────────────────────────────────────────────────────────────────────┐
│  WAVE 実行                                                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  WAVE 1(並列)             WAVE 2(並列)            WAVE 3        │
│  ┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐    ┌─────────┐ │
│  │ Task 01 │ │ Task 02 │ →  │ Task 03 │ │ Task 04 │ →  │ Task 05 │ │
│  └─────────┘ └─────────┘    └─────────┘ └─────────┘    └─────────┘ │
│       │           │              ↑           ↑              ↑      │
│       └───────────┴──────────────┴───────────┴──────────────┘      │
│              Touches: パスが依存関係分析を駆動                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

### 5. Verify(検証)

```
/gdd:verify
```

ブリーフに対して検証 — 必達項目、NN/g ヒューリスティック、監査ルーブリック、トークン統合。3 つのエージェントが順次実行: `design-auditor`(6 軸 1〜4 スコア)、`design-verifier`(目標逆方向)、`design-integration-checker`(D-XX 決定をコードへ grep)。失敗時には構造化されたギャップリストを生成し、`design-fixer` 経由で verify→fix ループに入ります。

**生成:** `.design/DESIGN-VERIFICATION.md`、問題発見時は修正コミット

---

### 6. Ship → Reflect → 次のサイクル

```
/gdd:ship                    # 綺麗な PR ブランチを生成(.design/ コミットをフィルター)
/gdd:reflect                 # design-reflector がテレメトリ + 学習を読み込む
/gdd:apply-reflections       # reflector の提案を確認し選択的に適用
/gdd:complete-cycle          # サイクル成果物をアーカイブ + EXPERIENCE.md を書く
/gdd:new-cycle               # 新しいデザインサイクルを開く
```

または自動ルーティング:

```
/gdd:next                    # 状態を自動検出して次のステップを実行
```

各サイクルはブリーフ、スキャン、計画、実行、検証、サイクルごとの 100〜200 行の `EXPERIENCE.md`(目標 / 行った決定 / 学習 / 廃棄したもの / 次のサイクルへの引き継ぎ)を取得し、これは decision-injector フックの最優先ソースになります。

---

### Fast モード

```
/gdd:fast "<task>"
```

完全なパイプラインを必要としない単一ファイルの些細な修正用。ルーター、キャッシュマネージャ、テレメトリをスキップ。同じ原子コミット保証。

```
/gdd:quick
```

GDD 保証が必要だがオプションのゲート(phase-researcher、assumptions analyzer、integration-checker)をスキップする一時的なタスク用。`/gdd:fast` より安全; フルパイプラインより速い。

---

## なぜ動くか

### コンテキストエンジニアリング

AI コーディング CLI は十分なコンテキストを与えれば強力です。多くの人はそうしません。

GDD があなたのために処理します:

| ファイル | 役割 |
|----------|------|
| `.design/BRIEF.md` | サイクルの問題、対象者、成功指標 |
| `.design/DESIGN.md` | 現在のデザインシステムスナップショット |
| `.design/DESIGN-CONTEXT.md` | D-XX 決定、インタビュー回答、上下流の制約 |
| `.design/DESIGN-PLAN.md` | 原子タスク、ウェーブ振付、依存関係 |
| `.design/DESIGN-VERIFICATION.md` | 検証結果、ギャップリスト、Handoff Faithfulness スコア |
| `.design/intel/` | クエリ可能なナレッジレイヤー |
| `.design/archive/cycle-N/EXPERIENCE.md` | サイクルごとの振り返り、サイクル間メモリ |
| `.design/telemetry/events.jsonl` | ステージ間のタイプ付きイベントストリーム |
| `.design/telemetry/posterior.json` | バンディット事後分布(`adaptive_mode != static` の場合) |

Claude の品質低下境界に合わせたサイズ制限。その下に留まれば、一貫した卓越性が得られます。

### 37 の専門エージェント

各ステージは薄いオーケストレーターが専門エージェントをスポーンするパターンです。重い作業は新しい 200k コンテキストで起こり、メインセッションを占有しません。

| ステージ | オーケストレーター | エージェント |
|---------|------------------|-------------|
| Brief | 1 質問インタビュー | (サブエージェントなし) |
| Explore | 5 マッパー + discussant をスポーン | 5 並列マッパー、design-discussant、research-synthesizer |
| Plan | リサーチャー + planner + checker をスポーン | design-phase-researcher(オプション)、design-planner(opus)、design-plan-checker(haiku) |
| Design | ウェーブ調整 + worktree 隔離 | タスクごとに design-executor、solidify 失敗時に design-fixer |
| Verify | auditor + verifier + checker をスポーン | design-auditor、design-verifier、design-integration-checker |
| Reflect | テレメトリ + 学習を読み込む | design-reflector(opus)、design-authority-watcher、design-update-checker |

### 12 のツール接続

すべてオプション — どの接続も使用できないときパイプラインは優雅にフォールバックします:

- **Figma**(読み取り + 書き込み + Code Connect)
- **Refero** — デザインリファレンス検索
- **Pinterest** — ビジュアルリファレンスへの接地
- **Claude Design** — ハンドオフバンドルインポート
- **Storybook** — コンポーネント仕様の参照
- **Chromatic** — ビジュアル回帰ベースライン diff
- **Preview** — Playwright + Claude Preview MCP ランタイムスクリーンショット
- **paper.design** — MCP キャンバス読み書き
- **pencil.dev** — git 追跡 `.pen` 仕様ファイル
- **Graphify** — ナレッジグラフエクスポート
- **21st.dev Magic** — greenfield ビルド前の先例検索
- **Magic Patterns** — DS-aware コンポーネント生成

### 組み込みデザインリファレンス

プラグインは **18 以上のリファレンスファイル** を出荷します — NN/g 10、Don Norman 感情デザイン、Dieter Rams 10 原則、Disney 12(モーション)、Sonner / Emil Kowalski のコンポーネント作成レンズ、Peak-End、Loss Aversion、Cognitive Load、Aesthetic-Usability、Doherty、Flow、35 のコンポーネント仕様、gestalt、ビジュアル階層、ブランドボイス、161 産業別パレット、67 UI 美学、12 モーションイージング、8 トランジションファミリー、WCAG 2.1 AA、プラットフォーム(iOS/Android/web/visionOS/watchOS)、RTL/CJK、フォームパターン、アンチパターンカタログ。

### 原子的な git コミット

```
abc123f docs(08-02): complete user-card token plan
def456g feat(08-02): unify card surface tokens with --color-bg-elevated
hij789k feat(08-02): replace inline padding with --space-* scale
lmn012o test(08-02): assert card.spec passes WCAG contrast 4.5:1
```

git bisect が失敗したタスクを正確に見つけます。各タスクは独立してリバート可能です。Solidify-with-rollback がタスクレベルの検証ゲートを追加するため、壊れたタスク 3 が verify 実行前にタスク 4〜10 を破壊することはありません。

### 自己改善ループ

各サイクル後、`design-reflector`(opus)が `events.jsonl`、`agent-metrics.json`、`learnings/` を読み、diff を提案します — ティアオーバーライド、並列化ルール、リファレンス追加、frontmatter 更新。`/gdd:apply-reflections` が適用前に diff を表示して尋ねます。

**No-Regret 適応レイヤー**(v1.23.5)はその上に Thompson サンプリングバンディット + AdaNormalHedge アンサンブル + MMR リランクを重ね、informed-prior ブートストラップにより単一ユーザーで実用可能です。

### コストガバナンス

- **`gdd-router` スキル** — 決定論的な意図 → fast / quick / full ルーティング、モデルコールなし。
- **`gdd-cache-manager`** — Layer-B 明示的キャッシュ、SHA-256 入力ハッシュ、5 分 TTL 認識。
- **`budget-enforcer` PreToolUse フック** — `.design/budget.json` からティアオーバーライド、ハードキャップ、遅延スポーンゲートを強制。
- **スポーンごとのコストテレメトリ** — `.design/telemetry/costs.jsonl` 行が `/gdd:optimize` 推奨に供給。

目標: 品質下限の回帰なしにタスクごとのトークンコスト 50〜70% 削減。

---

## コマンド

### コアパイプライン

| コマンド | 役割 |
|---------|------|
| `/gdd:brief` | ステージ 1 — デザインブリーフを捕捉 |
| `/gdd:explore` | ステージ 2 — コードベースインベントリ + インタビュー |
| `/gdd:plan` | ステージ 3 — DESIGN-PLAN.md を生成 |
| `/gdd:design` | ステージ 4 — ウェーブで実行 |
| `/gdd:verify` | ステージ 5 — ブリーフに対して検証 |
| `/gdd:ship` | 綺麗な PR ブランチを生成 |
| `/gdd:next` | STATE.md ベースで次のステージへ自動ルーティング |
| `/gdd:do <text>` | 自然言語ルーター |
| `/gdd:fast <text>` | パイプラインなしの一発些細修正 |
| `/gdd:quick` | GDD 保証ありでオプションゲートをスキップする一時的タスク |

### 初回 + オンボーディング

| コマンド | 役割 |
|---------|------|
| `/gdd:start` | 初回証明パス — リポジトリ内のデザイン課題上位 3 件 |
| `/gdd:new-project` | GDD プロジェクト初期化 |
| `/gdd:connections` | 12 の外部統合のためのオンボーディングウィザード |

### サイクルライフサイクル

| コマンド | 役割 |
|---------|------|
| `/gdd:new-cycle` | 新しいデザインサイクル |
| `/gdd:complete-cycle` | サイクル成果物をアーカイブ + EXPERIENCE.md |
| `/gdd:pause` / `/gdd:resume` | 番号付きチェックポイント |
| `/gdd:continue` | `/gdd:resume` のエイリアス |
| `/gdd:timeline` | サイクル + git log の物語的振り返り |

### 反復 + 決定

| コマンド | 役割 |
|---------|------|
| `/gdd:discuss [topic]` | 適応型デザインインタビュー |
| `/gdd:list-assumptions` | 計画前に隠れたデザイン仮定を表面化 |
| `/gdd:sketch [idea]` | マルチバリアント HTML モックアップ |
| `/gdd:spike [idea]` | タイムボックス付き実現可能性実験 |
| `/gdd:sketch-wrap-up` / `/gdd:spike-wrap-up` | 発見をプロジェクトローカルスキルにパッケージング |
| `/gdd:audit` | 検証 + 監査 + リフレクターラッパー |
| `/gdd:reflect` | オンデマンドリフレクター実行 |
| `/gdd:apply-reflections` | リフレクター提案を確認し選択的に適用 |

### メモリ + ナレッジレイヤー

| コマンド | 役割 |
|---------|------|
| `/gdd:recall <query>` | FTS5 検索 |
| `/gdd:extract-learnings` | サイクル成果物からパターン/決定/教訓を採掘 |
| `/gdd:note <text>` | 摩擦のないアイデアキャプチャ |
| `/gdd:plant-seed <idea>` | トリガー条件付き前向きアイデア |
| `/gdd:analyze-dependencies` | トークンファンアウト、コンポーネントコールグラフ、決定追跡可能性 |
| `/gdd:skill-manifest` | すべての GDD スキルとエージェントをリスト |
| `/gdd:graphify` | プロジェクトナレッジグラフを構築/クエリ/diff |
| `/gdd:watch-authorities` | デザイン権威フィード diff |

### 接続

| コマンド | 役割 |
|---------|------|
| `/gdd:figma-write` | デザイン決定を Figma に書き戻す |
| `/gdd:handoff <bundle>` | Claude Design バンドルをインポート |
| `/gdd:darkmode` | ダークモード実装監査 |
| `/gdd:compare` | DESIGN.md と DESIGN-VERIFICATION.md の差分を計算 |
| `/gdd:style <Component>` | コンポーネントハンドオフドキュメント生成 |

### 診断 + フォレンジック

| コマンド | 役割 |
|---------|------|
| `/gdd:scan` | コードベースデザインシステムインベントリ |
| `/gdd:map` | 5 並列コードベースマッパー |
| `/gdd:debug [desc]` | 症状駆動デザイン調査 |
| `/gdd:health` | `.design/` 成果物の健康レポート |
| `/gdd:progress` | パイプライン位置を表示 |
| `/gdd:stats` | サイクル統計 |
| `/gdd:optimize` | ルールベースコスト分析 |
| `/gdd:warm-cache` | Anthropic キャッシュ事前ウォーミング |

### 配布 + 更新

| コマンド | 役割 |
|---------|------|
| `/gdd:update` | GDD を更新、changelog プレビュー |
| `/gdd:reapply-patches` | 構造的更新後にローカル修正を再ステッチ |
| `/gdd:check-update` | 手動更新チェック |
| `/gdd:settings` | `.design/config.json` を構成 |
| `/gdd:set-profile <profile>` | モデルプロファイルを切り替え |
| `/gdd:undo` | 安全なデザイン変更巻き戻し |
| `/gdd:pr-branch` | 綺麗な PR ブランチ |

### バックログ + ノート

| コマンド | 役割 |
|---------|------|
| `/gdd:todo` | デザインタスクの追加/リスト/選択 |
| `/gdd:add-backlog <idea>` | 将来のサイクルのためにデザインアイデアを駐車 |
| `/gdd:review-backlog` | 駐車項目をレビュー |

### ヘルプ

| コマンド | 役割 |
|---------|------|
| `/gdd:help` | 完全なコマンドリストと使用法 |
| `/gdd:bandit-reset` | Anthropic モデルリリース時に適応レイヤー事後分布をリセット |

---

## 接続

GDD は 12 のツール接続を出荷します。すべてオプション。`/gdd:connections` で構成。

| 接続 | 目的 | プローブ |
|------|------|---------|
| **Figma** | トークン/コンポーネント/スクリーンショット読み取り; アノテーション/Code Connect/実装ステータス書き込み | `mcp__figma__get_metadata` + `use_figma` |
| **Refero** | デザインリファレンス検索 | `mcp__refero__search` |
| **Pinterest** | ブランド + スタイルのビジュアルリファレンス | OAuth + MCP |
| **Claude Design** | ハンドオフバンドルインポート | URL またはローカルファイル |
| **Storybook** | ポート 6006 のコンポーネント仕様参照 | HTTP プローブ |
| **Chromatic** | ビジュアル回帰ベースライン diff | API キー |
| **Preview** | Playwright + Claude Preview MCP | `mcp__Claude_Preview__preview_*` |
| **paper.design** | MCP キャンバス読み書き | `mcp__paper__use_paper` |
| **pencil.dev** | git 追跡 `.pen` 仕様 | リポジトリ内 `.pen` ファイル |
| **Graphify** | ナレッジグラフエクスポート | `mcp__graphify__*` |
| **21st.dev Magic** | greenfield 前の先例検索 | `mcp__magic__search` |
| **Magic Patterns** | DS-aware コンポーネント生成 | `mcp__magic-patterns__generate` |

完全な接続詳細は [`connections/connections.md`](connections/connections.md) を参照。

---

## 構成

GDD はプロジェクト設定を `.design/config.json` に保存します。`/gdd:new-project` 中に構成するか `/gdd:settings` で更新します。

### モデルプロファイル

| プロファイル | 計画 | 実行 | 検証 |
|-------------|------|------|------|
| `quality` | Opus | Opus | Sonnet |
| `balanced`(デフォルト) | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |
| `inherit` | Inherit | Inherit | Inherit |

```
/gdd:set-profile budget
```

### 適応モード

`.design/budget.json#adaptive_mode` 階段(v1.23.5):

| モード | 役割 |
|--------|------|
| `static`(デフォルト) | Phase 10.1 動作 |
| `hedge` | AdaNormalHedge アンサンブル + MMR リランクを有効化。最も安全な導入。 |
| `full` | バンディットルーター + Hedge + MMR がすべてアクティブ |

### 並列化

| 設定 | デフォルト | 制御内容 |
|------|----------|---------|
| `parallelism.enabled` | `true` | worktree で独立したタスクを実行 |
| `parallelism.min_estimated_savings_seconds` | `30` | この閾値以下では並列化をスキップ |
| `parallelism.max_concurrent_workers` | `4` | 同時 worker のハードキャップ |

### 品質ゲート

| 設定 | デフォルト | 制御内容 |
|------|----------|---------|
| `solidify.rollback_mode` | `"stash"` | `stash` / `hard` / `none` |
| `solidify.commands` | 自動検出 | typecheck / build / test コマンドの上書き |
| `verify.iterations_max` | `3` | verify→fix ループ上限 |
| `connection.figma_writeback` | `proposal` | `proposal` / `auto` |

---

## セキュリティ

### 組み込み強化

GDD は Phase 14.5 から多層防御を出荷します:

- **`hooks/gdd-bash-guard.js`** — PreToolUse:Bash が約 50 の危険なパターンをブロック(`rm -rf /`、`chmod 777`、`curl | sh`、`git reset --hard`、フォーク爆弾)、Unicode NFKC + ANSI 正規化後。
- **`hooks/gdd-protected-paths.js`** — PreToolUse:Edit/Write/Bash が `protected_paths` glob リストを強制。
- **`hooks/gdd-read-injection-scanner.ts`** — インバウンド Read コンテンツの不可視 Unicode、HTML コメント、シークレット流出パターンをスキャン。
- **`scripts/lib/blast-radius.cjs`** — `design-executor` のプリフライトが `max_files_per_task: 10` / `max_lines_per_task: 400` を超えるタスクを拒否。
- **`hooks/gdd-mcp-circuit-breaker.js`** — `use_figma` / `use_paper` / `use_pencil` での連続タイムアウトループを切断。

### 機密ファイルの保護

ランタイムの deny リストに機密パスを追加:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/*)",
      "Read(**/*credential*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

> [!IMPORTANT]
> GDD は LLM システムプロンプトになるマークダウンファイルを生成するため、`.design/` 成果物に流れるユーザー制御テキストは潜在的な間接プロンプトインジェクションベクトルです。インジェクションスキャナーが複数のレイヤーで捕捉しますが、多層防御がベストプラクティスです。

---

## トラブルシューティング

**インストール後にコマンドが見つからない?**
- ランタイムを再起動
- `~/.claude/skills/get-design-done/`(グローバル)または `./.claude/skills/get-design-done/`(ローカル)を確認
- `/gdd:help` で登録を確認

**パイプラインがステージの途中で停止?**
- `/gdd:resume` — 最新の番号付きチェックポイントから復元
- `/gdd:health` — `.design/` 成果物の問題を診断
- `/gdd:progress --forensic` — 6 チェック整合性監査

**コスト超過?**
- `/gdd:optimize` — ルールベース推奨
- `/gdd:set-profile budget` — 予算ティアに切り替え
- `.design/budget.json` で `adaptive_mode: "full"` を設定 — バンディットが 5〜10 サイクル内に学習

**最新版に更新?**
```bash
npx @hegemonart/get-design-done@latest
```

**Docker / コンテナ?**

```bash
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

### アンインストール

```bash
# グローバルアンインストール(ランタイムごと)
npx @hegemonart/get-design-done --claude --global --uninstall
npx @hegemonart/get-design-done --opencode --global --uninstall
# ... 14 のランタイムに対して同じ --<runtime> --global --uninstall パターン

# マルチセレクト対話型アンインストール(ランタイムフラグなし)
npx @hegemonart/get-design-done --uninstall

# ローカルアンインストール
npx @hegemonart/get-design-done --claude --local --uninstall
# ... --local フラグ
```

他の構成を保持しながらすべての GDD コマンド、エージェント、フック、設定を削除します。

---

## ライセンス

MIT ライセンス。詳細は [LICENSE](LICENSE) を参照。

---

<div align="center">

**Claude Code はコードを出荷します。Get Design Done はデザインも出荷されることを保証します。**

</div>

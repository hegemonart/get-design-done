<div align="center">

# Hone

[English](../../README.md) · [简体中文](README.zh-CN.md) · **日本語** · [한국어](README.ko.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Deutsch](README.de.md)

> 注記: この翻訳は英語版より遅れている場合があります。正式な版は [README.md](../../README.md) です (translation may lag behind English; see README.md for the canonical version)。

**AI コーディングエージェントのためのデザイン品質パイプライン: ブリーフ -> 探索 -> 計画 -> デザイン -> 検証。**

**Hone は、AI が生成した UI をあなたのブリーフ、デザインシステム、ローカルなデザイン知識、品質ゲートに結びつけたまま進めます。Claude Code 向けに作られ、Codex、Cursor、Gemini、OpenCode、Copilot、Windsurf などにもインストールできます。**

[![npm version](https://img.shields.io/npm/v/@hegemonart/hone?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/hone)
[![npm downloads](https://img.shields.io/npm/dm/@hegemonart/hone?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/hone)
[![CI](https://img.shields.io/github/actions/workflow/status/hegemonart/hone/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/hegemonart/hone/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/hegemonart/hone?style=for-the-badge&logo=github&color=181717)](https://github.com/hegemonart/hone)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

```bash
npx hone
```

> **get-design-done (gdd) から改名。** 既存のインストールは引き続き動作します。非推奨の `/gdd:` エイリアスは1〜2バージョン維持されます。新しいインストールは `npx hone` です。`@hegemonart/get-design-done` は `@hegemonart/hone` を推奨して npm 上で非推奨になります。_(翻訳は英語版 README に遅れる場合があります。)_

**macOS、Linux、Windows で動作します。**

[インストール](#インストール) · [はじめに](#はじめに) · [ユースケース](#ユースケース) · [仕組み](#仕組み) · [コマンド](#コマンド) · [接続](#接続) · [安全性](#安全性とプライバシー)

</div>

---

## これは何か

Hone は、AI コーディングエージェントがあなたのプロダクトにふさわしい UI を出荷できるよう支援します。

「この画面をもっと良くして」といった漠然とした依頼を、追跡可能なデザインワークフローに変えます。ブリーフ、探索、計画、デザイン、検証。

センスだけでエージェントに即興させる代わりに、Hone は構造化されたプロセス、ローカルなデザイン知識、プロジェクト固有のメモリ、任意のデザインツール接続、そして作業を出荷する前の検証を与えます。

## なぜ存在するのか

AI エージェントは UI を素早く生み出します。難しいのは、その UI を一貫させることです。

デザインワークフローがないと、生成されたインターフェイスは漂流します:

- 色とスペーシングがシステムと一致しなくなる
- コンポーネントが再発明される
- コントラストとアクセシビリティが退行する
- 階層が画面ごとに変わる
- 実装が元のブリーフと一致しなくなる

Hone は AI コーディングワークフローに欠けているデザインの規律を加えます。問題を捕捉し、現在のデザインシステムをマッピングし、スコープを絞った変更を計画し、それを原子的なステップで実行し、ブリーフ、トークン、アクセシビリティ、デザイン品質ルーブリックに照らして結果を検証します。

舞台裏では、64 個の専門エージェント、クエリ可能なインテルストア、ティア対応モデルルーティング、39 個の任意ツール接続が動いています。日常的に使うのは、ひと握りの `/hone:*` コマンドです。

## インストール

### npm

```bash
npx hone
```

### Claude Code

```bash
/plugin marketplace add hegemonart/hone
/plugin install hone@hone
/reload-plugins
```

### Codex

```bash
codex plugin marketplace add hegemonart/hone
```

### agentskills.io

[agentskills.io](https://agentskills.io) スキルレジストリから Hone を参照してインストールできます。

### ランタイム直接インストーラー

```bash
# Claude Code
npx @hegemonart/hone --claude --global
npx @hegemonart/hone --claude --local

# その他のランタイム
npx @hegemonart/hone --codex --global
npx @hegemonart/hone --cursor --global
npx @hegemonart/hone --gemini --global

# マルチランタイムインストール
npx @hegemonart/hone --all --global

# 書き込みせずにプレビュー
npx @hegemonart/hone --dry-run
```

## はじめに

軽量な初回パスを実行:

```bash
/hone:start
```

または完全なデザインサイクルを実行:

```bash
/hone:brief
/hone:explore
/hone:plan
/hone:design
/hone:verify
```

自然言語ルーティングの場合:

```bash
/hone:do improve the checkout page hierarchy, spacing, and empty states
```

## ユースケース

### 既存の画面を改善する

画面は技術的には機能しているが、視覚的に一貫性がない、不明瞭、またはデザインが不十分に感じられるときに Hone を使います。

```bash
/hone:do improve the settings page layout and component hierarchy
```

### AI の出力をデザインシステムに戻す

エージェントが、もっともらしく見えるがトークン、スペーシング、状態、コンポーネントと一致しない UI を生成したときに使います。

```bash
/hone:verify
```

### 出荷前の監査

PR、リリース、デザインハンドオフの前に検証を実行します。

```bash
/hone:audit
```

### ダークモードを修正する

```bash
/hone:darkmode
```

### デザインハンドオフをインポートする

```bash
/hone:handoff ./my-design.html
```

これは Claude Design バンドルをパースし、CSS カスタムプロパティをデザイン決定として抽出し、ハンドオフ忠実度チェックを実行します。

### 小さく焦点を絞った修正をする

```bash
/hone:fast "fix contrast in pricing cards"
```

## 何が違うのか

### ローカルなデザイン知識

Hone はデザイン作業のための広範なローカルリファレンスライブラリを同梱しています。基本的なデザイン判断のために、エージェントはライブの Web 検索に頼らずにこれを利用できます。

アクセシビリティ、WCAG、タイポグラフィ、スペーシング、グリッド、色、コントラスト、サーフェス、モーション、UX ライティング、フォーム、空の状態、視覚的階層、ダークモード、レスポンシブ挙動、i18n、リサーチ手法、監査スコアリング、デザインアンチパターンを網羅します。

エージェントは空のプロンプトから始めるわけではありません。計画、実装、検証の各段階で適用できる共有のデザイン語彙と具体的な標準を備えています。

完全なマップ: [docs/KNOWLEDGE-BASE.md](docs/KNOWLEDGE-BASE.md)

### プロジェクト固有のメモリ

Hone は各サイクルを地に足のついたものに保つ `.design/` ワークスペースを作成します:

| アーティファクト | 目的 |
| --- | --- |
| `.design/BRIEF.md` | 問題、対象ユーザー、スコープ、成功指標 |
| `.design/DESIGN.md` | 現在のデザインシステムスナップショット |
| `.design/DESIGN-CONTEXT.md` | 決定、制約、リファレンス |
| `.design/DESIGN-PLAN.md` | 原子的な実装計画 |
| `.design/DESIGN-VERIFICATION.md` | 最終監査とギャップレポート |
| `.design/intel/` | クエリ可能なプロジェクト知識: トークン、コンポーネント、関係、決定 |
| `.design/archive/` | 完了したサイクルの履歴と学習 |

長く使うほど、エージェントが再発見しなければならないことは減ります。

### 出荷前の検証

Hone は UI が「完成したように見える」段階で止まりません。

検証ステージは、結果が次のものと依然一致しているかをチェックします:

- 元のブリーフ
- デザインシステムのトークン
- アクセシビリティの閾値
- コンポーネントの慣習
- 視覚的階層
- モーションとインタラクションのルール
- 記録されたデザイン決定

ギャップが現れると、Hone はレビューを雰囲気任せにする代わりに、構造化された修正リストを生成します。

### スキル挙動テスト

Hone 自身のスキルは、敵対的なプレッシャーシナリオ(時間的プレッシャー、サンクコスト、権威、スコープ最小化)の下で試され、屈するのではなく規律を保つことが確認されます。プレッシャーシナリオの追加方法は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## 仕組み

```text
Brief -> Explore -> Plan -> Design -> Verify -> Ship
```

| ステージ | コマンド | 出力 |
| --- | --- | --- |
| Brief | `/hone:brief` | デザイン問題を捕捉 |
| Explore | `/hone:explore` | UI システム、負債、トークン、コンポーネントをマッピング |
| Plan | `/hone:plan` | 原子的なデザインタスクを作成 |
| Design | `/hone:design` | 検証付きでタスクを実行 |
| Verify | `/hone:verify` | 最終結果を監査 |

### 主要な出力

| ファイル | 役割 |
| --- | --- |
| `.design/BRIEF.md` | サイクルの問題、対象ユーザー、成功指標 |
| `.design/DESIGN.md` | 現在のデザインシステムスナップショット |
| `.design/DESIGN-CONTEXT.md` | デザイン決定と制約 |
| `.design/DESIGN-PLAN.md` | 原子的タスク、ウェーブ、依存関係 |
| `.design/DESIGN-VERIFICATION.md` | 検証結果とギャップリスト |
| `.design/intel/` | このプロジェクトのクエリ可能な知識レイヤー |

## コマンド

Hone は 96 個のスキルを出荷します。以下は大半のユーザーが日常的に必要とするものです。完全なリファレンスは [SKILL.md](SKILL.md) を参照してください。

### コアパイプライン

| コマンド | 目的 |
| --- | --- |
| `/hone:brief` | デザインブリーフを捕捉 |
| `/hone:explore` | 現在の UI システムをインベントリ |
| `/hone:plan` | デザイン計画を生成 |
| `/hone:design` | 計画を実行 |
| `/hone:verify` | 結果を検証 |
| `/hone:ship` | 綺麗な PR ブランチを準備 |
| `/hone:next` | 次のステージへ自動ルーティング |

### 日常的な利用

| コマンド | 目的 |
| --- | --- |
| `/hone:do <task>` | 自然言語ルーター |
| `/hone:fast <task>` | 小さく焦点を絞った修正 |
| `/hone:quick` | 軽量タスクフロー |
| `/hone:audit` | デザイン品質監査 |
| `/hone:darkmode` | ダークモード監査 |
| `/hone:style <component>` | コンポーネントスタイルのハンドオフ |
| `/hone:health` | パイプライン状態を診断 |
| `/hone:progress` | 現在のサイクル進捗を表示 |
| `/hone:resume` | チェックポイントから再開 |

### デザインツールとハンドオフ

| コマンド | 目的 |
| --- | --- |
| `/hone:connections` | 任意の統合を構成 |
| `/hone:figma-extract` | Figma のデザインシステムコンテキストを抽出 |
| `/hone:figma-write` | 決定とステータスを Figma に書き戻す |
| `/hone:handoff <bundle>` | Claude Design バンドルをインポート |
| `/hone:sketch <idea>` | マルチバリアントの HTML モックアップを生成 |
| `/hone:spike <idea>` | タイムボックス付き実現可能性パス |

完全なコマンドリファレンス: [SKILL.md](SKILL.md)

## 接続

Hone は外部ツールなしで動作しますが、39 個の任意の統合に接続できます。すべて任意であり、いずれかの接続が利用できないときパイプラインはフォールバックへ優雅に縮退します。

接続レイヤーは次のカテゴリーにまたがります:

- **デザインサーフェス** - Figma(読み取り + 書き込み + Code Connect)、paper.design、pencil.dev、Penpot、Framer、Webflow、Plasmic
- **リファレンスとリサーチ** - Refero、Pinterest、Lazyweb、Mobbin、Claude Design ハンドオフ
- **コンポーネント生成** - 21st.dev Magic、Magic Patterns、v0.dev、Builder.io
- **コンポーネント仕様とビジュアル QA** - Storybook、Chromatic、Preview(Playwright + Claude Preview MCP)
- **ナレッジグラフ** - Graphify
- **ネイティブおよび非 Web 出力** - Xcode Simulator、Android Emulator、Litmus / Email-on-Acid、印刷レンダラー
- **モーション検証** - Lottie、Rive
- **チームサーフェス** - Slack、Discord、Linear、Jira、Notion、GitHub PR

統合の構成:

```bash
/hone:connections
```

プローブパターンを含む完全な接続リストは [connections/connections.md](connections/connections.md) を参照してください。

## 要件

- Node.js 22 または 24
- Git
- サポートされる AI コーディングランタイム

## マルチランタイムサポート

Hone は 14 の AI コーディングランタイムにインストールできます: Claude Code、Codex、Cursor、Gemini CLI、OpenCode、Kilo、Copilot、Windsurf、Antigravity、Augment、Trae、Qwen Code、CodeBuddy、Cline。同じソーススキルとエージェントが、ランタイムごとのコンバーターによって各ランタイムのネイティブレイアウト(`skills/`、`command/`、`agents/`、または `.clinerules`)へコンパイルされるため、パイプラインはエディターをまたいであなたとともに移動します。

Claude Code が旗艦です。完全な体験はそこで端から端まで動きます。すべてのエージェント、多層防御フック、MCP 連携の接続です。他のランタイムでは同じスキルとエージェントがそのネイティブな形で得られ、MCP 連携の接続は MCP 対応ホストで有効化され、フックレイヤーは Claude Code 固有です。

## 安全性とプライバシー

Hone はデフォルトでローカルファーストです。プロジェクトのアーティファクトを `.design/` 下に書き込み、任意の統合は構成されたときのみ使用し、課題報告は同意ゲート付きに保ちます。

プラグインには、保護パス、危険コマンドのブロック、インジェクションスキャン、MCP サーキットブレーカー、予算強制のための多層防御フックが含まれます。Hone はまた、安全なプロジェクト内省のための 13 個の読み取り専用 MCP ツールを公開します。

機密パスをランタイムの deny リストに追加してください:

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(**/secrets/*)",
      "Read(**/*.pem)",
      "Read(**/*.key)"
    ]
  }
}
```

参照: [SECURITY.md](SECURITY.md) · [PRIVACY.md](PRIVACY.md)

## 更新

```bash
npx hone
```

または Claude Code 内から:

```bash
/hone:update
```

完全なリリース履歴は [CHANGELOG.md](CHANGELOG.md) を参照してください。

## トラブルシューティング

### コマンドが表示されない

ランタイムを再起動して実行:

```bash
/hone:help
```

### パイプラインが詰まっている

```bash
/hone:health
/hone:resume
```

### コストが高すぎる

```bash
/hone:optimize
```

## コントリビュート

```bash
npm install
npm test
npm run typecheck
```

参照: [CONTRIBUTING.md](CONTRIBUTING.md)

## ライセンス

MIT ライセンス。詳細は [LICENSE](LICENSE) を参照してください。サードパーティの帰属表示は [NOTICE](NOTICE) に記載されています。

---

<div align="center">

**Claude Code はコードを出荷します。Hone はデザインも出荷されることを保証します。**

</div>

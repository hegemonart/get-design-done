<div align="center">

# GET DESIGN DONE

[English](README.md) · **简体中文** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Deutsch](README.de.md)

**面向 AI 编码智能体的设计质量流水线:简报 → 探索 → 规划 → 实现 → 验证。**

**Get Design Done 让 AI 生成的 UI 始终贴住你的简报、设计系统、参考资料与质量闸门。支持 Claude Code、OpenCode、Gemini CLI、Kilo、Codex、Copilot、Cursor、Windsurf、Antigravity、Augment、Trae、Qwen Code、CodeBuddy 与 Cline。**

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

**支持 macOS、Linux 与 Windows。**

<br>

*"AI 编码智能体交付 UI 很快。Get Design Done 确保交付出来的是设计。"*

<br>

[为什么做这个](#为什么做这个) · [工作流程](#工作流程) · [命令](#命令) · [接入](#接入) · [为什么能行](#为什么能行)

</div>

---

> [!IMPORTANT]
> ### 已有 Claude Design 导出包?
>
> 如果你从 [claude.ai/design](https://claude.ai/design) 导出了设计,可以直接跳过前三个阶段:
>
> ```
> /gdd:handoff ./my-design.html
> ```
>
> 此命令会把导出包里的 CSS 自定义属性解析为 D-XX 设计决策,运行带 Handoff Faithfulness 评分的验证流程,并可选地把实现状态写回 Figma。

---

## 为什么做这个

我是一个用 AI 编码智能体发布产品的设计师。代码侧工作流已经很成熟:规格、任务、测试、提交、review loop。设计侧还没有。

我反复遇到的问题是:智能体可以生成一个单独看起来不错的界面,但工作本身是**脱节的**。Token 对不上既有设计系统。对比度悄悄跌破 WCAG。层级每个页面都重新发明一遍。旧项目里的反模式渗进新组件。因为没有任何东西把产出回到最初的简报上做验证,这些问题通常要到 PR review 或交付之后才浮出来。

所以我做了 Get Design Done:一条设计流水线,把工程工作流里已经成熟的结构带给 AI 编码智能体。它捕获简报、映射当前设计系统、用参考资料约束决策、把工作拆成原子任务、执行任务,并在发布前验证结果。

幕后是 37 个专用智能体、可查询的 intel 存储、按模型分层的路由、12 个可选工具接入、原子提交,以及基于 solidify-with-rollback 结果学习的 no-regret 自适应层。你日常看到的,只是几个能让设计工作保持一致的 `/gdd:*` 命令。

— **Hegemon**

---

AI 生成设计和 AI 生成代码有同一种失败模式:你描述想要什么,拿到一个看起来合理的东西,然后一上规模就垮,因为没有系统把产出重新拴回简报。

Get Design Done 是设计工作的上下文工程层。它把“把这个 UI 做好一点”变成可追踪的循环:简报 → 盘点 → 参考 → 计划 → 实现 → 验证。

---

## 你会得到什么

- **由简报约束的设计工作** —— 每个周期都从问题、受众、约束、成功指标和必须满足项开始。
- **设计系统抽取** —— GDD 会在规划改动前盘点 token、字体、间距、组件、动效、可访问性、暗色模式和设计债。
- **基于参考的决策** —— 智能体使用内置设计参考,也可以接入 Figma、Refero、Pinterest、Storybook、Chromatic、Preview、Claude Design、paper.design、pencil.dev、Graphify、21st.dev Magic 和 Magic Patterns。
- **原子化执行** —— 设计任务按依赖拆解,以安全 wave 执行,并独立提交。
- **发布前验证** —— 审计会检查简报匹配、token 集成、WCAG 对比度、组件合规、动效一致性、暗色模式架构和设计反模式。
- **验证失败自动回滚** —— solidify-with-rollback 会在任务落地前做验证;失败的工作会自动撤回。

---

## 适合谁

GDD 适合所有用 AI 编码智能体交付 UI、并且希望结果不止第一张截图好看的人 —— 工程师、设计师、设计工程师、创始人和产品构建者都适合。

当你在意 token 是否一致、对比度是否通过 WCAG、动效是否协调、组件是否遵循系统、最终实现是否仍然符合最初需求时,它就有价值。

你不必是专业设计师。流水线会把设计纪律带进智能体工作流:它抽取上下文、只追问缺失决策、用参考资料约束工作,并捕获那些人们通常太晚才发现的问题。

### v1.24.0 亮点 —— 多运行时安装器

- **`@clack/prompts` 交互式多选** —— `npx @hegemonart/get-design-done` 不带任何 flag 时,会打开针对全部 14 个支持运行时(Claude Code、OpenCode、Gemini CLI、Kilo、Codex、Copilot、Cursor、Windsurf、Antigravity、Augment、Trae、Qwen Code、CodeBuddy、Cline)的复选框 UI,以及 Global / Local 单选。任意子集均可,确认后即完成。
- **幂等 + 兼容外部 AGENTS.md** —— 重复运行不会产生重复条目,也不会覆盖你为某个运行时手写的指令文件;任何文件写入前都有确认步骤,显示 diff。
- **保留脚本式 CI 接口** —— 现有的所有 flag(`--claude`、`--cursor`、`--all`、`--global`、`--local`、`--uninstall`、`--config-dir`)继续无变化地工作。仅在没有任何运行时 flag 时,才进入交互模式。
- **多选卸载** —— `--uninstall` 不带运行时 flag 时也会进入交互式多选,按需挑选要清理哪几个运行时。

### 历次发布

- **v1.23.5** —— No-Regret 自适应层(Thompson 采样 bandit + AdaNormalHedge 集成 + MMR 重排;通过 informed-prior 引导,单用户可用,不需要 opt-in 共享遥测)。
- **v1.23.0** —— SDK 领域原语(solidify-with-rollback 闸门、JSON 输出契约、`Touches:` 模式自动结晶化)。
- **v1.22.0** —— SDK 可观测性(约 24 种类型化事件、每次工具调用的轨迹流、仅追加的事件链、密钥擦除器)。
- **v1.21.0** —— 无头 SDK(`gdd-sdk` CLI 不依赖 Claude Code 即可跑完整流水线、并行研究员、跨 harness MCP)。
- **v1.20.0** —— SDK 基础(弹性原语、加锁安全的 `STATE.md`、`gdd-state` MCP 服务器及 11 个类型化工具、TypeScript 基础)。

完整发布说明见 [CHANGELOG.md](CHANGELOG.md)。

---

<p align="center">
  <strong>Supported by</strong>
</p>

<div align="center">
  <a href="https://www.humbleteam.com/" aria-label="Humbleteam">
    <img src="docs/assets/sponsors/humbleteam.svg" alt="Humbleteam logo" width="180">
  </a>
  <br>
  <sub>Product design partner for ambitious startups and AI products.</sub>
</div>

---

## 快速开始

```bash
npx @hegemonart/get-design-done@latest
```

安装器会让你选择:
1. **运行时** —— Claude Code、OpenCode、Gemini、Kilo、Codex、Copilot、Cursor、Windsurf、Antigravity、Augment、Trae、Qwen Code、CodeBuddy、Cline,或全部(交互式多选 —— 一次会话里挑多个运行时)
2. **位置** —— Global(所有项目)或 Local(当前项目)

验证:

```
/gdd:help
```

> [!TIP]
> 建议以 `--dangerously-skip-permissions` 方式运行 Claude Code,以获得流畅的自动化体验。GDD 设计用于自主多阶段执行;每次读文件和 `git commit` 都要人工批准会抵消全部意义。

### 保持最新

GDD 发版频繁。重新跑一次安装器即可(它是幂等的,会原地更新已注册的市场条目):

```bash
npx @hegemonart/get-design-done@latest
```

或在 Claude Code 里:

```
/gdd:update
```

`/gdd:update` 在应用前预览 changelog。`reference/` 下的本地修改会被保留 —— 如果结构性更新后需要重新拼接,用 `/gdd:reapply-patches`。当有新版本时,SessionStart 钩子会显示一行横幅,被状态机门控保护,绝不打断正在运行的阶段。

<details>
<summary><strong>非交互式安装(Docker、CI、脚本)</strong></summary>

```bash
# Claude Code
npx @hegemonart/get-design-done --claude --global   # 安装到 ~/.claude/
npx @hegemonart/get-design-done --claude --local    # 安装到 ./.claude/

# OpenCode
npx @hegemonart/get-design-done --opencode --global

# Gemini CLI
npx @hegemonart/get-design-done --gemini --global

# Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen, CodeBuddy, Cline
# 同样的 --<runtime> --global / --local 模式

# 所有运行时
npx @hegemonart/get-design-done --all --global

# 预演(只打印 diff,不实际写入)
npx @hegemonart/get-design-done --dry-run

# 自定义配置目录(Docker、非默认 Claude 根)
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

</details>

<details>
<summary><strong>另一种方式:Claude Code CLI</strong></summary>

```bash
claude plugin marketplace add hegemonart/get-design-done
claude plugin install get-design-done@get-design-done
```

这就是 npx 安装器在做的事 —— `npx` 只是把两条命令合成一条。

</details>


## 工作流程

> **新接入既有代码库?** 先运行 `/gdd:map`。它会并行派出 5 个专业 mapper(tokens、components、visual hierarchy、a11y、motion)并写入 `.design/map/` —— 这些结构化数据是 Explore 阶段的高质量输入,比基于 grep 的回退方案好得多。

### 1. Brief(简报)

```
/gdd:brief
```

在任何扫描或探索之前先捕获设计问题。该 skill 通过 `AskUserQuestion` 一次一问 —— 只针对未回答的部分:问题、受众、约束、成功指标、范围。

**产出:** `.design/BRIEF.md`

---

### 2. Explore(勘察)

```
/gdd:explore
```

清点当前代码库的设计系统:颜色、排版、间距、组件、动效、可访问性、暗色模式。5 个并行 mapper 加 `design-discussant` 采访产生三份产物。连接探针检测 Figma、Refero、Storybook、Chromatic、Preview、Pinterest、Claude Design、paper.design、pencil.dev、Graphify、21st.dev Magic、Magic Patterns 是否可用。

**产出:** `.design/DESIGN.md`、`.design/DESIGN-DEBT.md`、`.design/DESIGN-CONTEXT.md`、`.design/map/{tokens,components,a11y,motion,visual-hierarchy}.{md,json}`

---

### 3. Plan(计划)

```
/gdd:plan
```

将 Explore 产出分解为原子化、按 wave 编排、带依赖分析的设计任务。每个任务携带明确的 `Touches:` 路径、可并行性标签、验收准则。`design-planner`(opus)起草;`design-plan-checker`(haiku)在执行前对照简报目标做闸门检查。

**产出:** `.design/DESIGN-PLAN.md`

---

### 4. Design(执行)

```
/gdd:design
```

按 wave 顺序执行任务。每个任务有专属的 `design-executor` 智能体,获得全新 200k 上下文,产出原子 git commit,并按代码内上下文的偏差规则自动处理偏差。可并行任务在 worktree 中运行。

**Solidify-with-rollback**(v1.23.0)—— 每个任务在锁定前执行验证(typecheck + build + 定向测试)。验证失败 → `git stash` 回滚。每个任务都是原子的 commit-or-revert。

**产出:** 每个任务一份 `.design/tasks/task-NN.md`,每个任务一次原子 git commit

```
┌────────────────────────────────────────────────────────────────────┐
│  WAVE 执行                                                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  WAVE 1(并行)             WAVE 2(并行)            WAVE 3        │
│  ┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐    ┌─────────┐ │
│  │ Task 01 │ │ Task 02 │ →  │ Task 03 │ │ Task 04 │ →  │ Task 05 │ │
│  │ tokens  │ │ a11y    │    │ button  │ │ form    │    │ verify  │ │
│  └─────────┘ └─────────┘    └─────────┘ └─────────┘    └─────────┘ │
│       │           │              ↑           ↑              ↑      │
│       └───────────┴──────────────┴───────────┴──────────────┘      │
│              Touches: 路径驱动依赖分析                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

### 5. Verify(验证)

```
/gdd:verify
```

回到简报做验证 —— 必达项、NN/g 启发法、审计评分、token 集成。三个智能体顺序运行:`design-auditor`(6 维 1–4 评分)、`design-verifier`(目标向回校验)、`design-integration-checker`(把 D-XX 决策回写到代码)。失败时产生结构化 gap 列表并经 `design-fixer` 进入 verify→fix 循环。

**产出:** `.design/DESIGN-VERIFICATION.md`,如发现问题则有修复 commit

---

### 6. Ship → Reflect → 下一周期

```
/gdd:ship                    # 生成干净的 PR 分支(过滤 .design/ 提交)
/gdd:reflect                 # design-reflector 读取遥测 + 学习
/gdd:apply-reflections       # 审核并选择性应用 reflector 的提案
/gdd:complete-cycle          # 归档周期产物 + 写出 EXPERIENCE.md
/gdd:new-cycle               # 开启新周期
```

或自动路由:

```
/gdd:next                    # 自动检测状态并执行下一步
```

每个周期都包含简报、扫描、计划、执行、验证、以及一份 100–200 行的 `EXPERIENCE.md`(目标 / 决策 / 学习 / 死掉的东西 / 交接给下一周期),这份文件成为 decision-injector 钩子的最高优先级来源。

---

### Fast 模式

```
/gdd:fast "<任务>"
```

不需要走完整流水线的单文件琐碎修复。跳过 router、cache-manager、telemetry。同样的原子 commit 保证。

```
/gdd:quick
```

需要 GDD 保证但跳过可选闸门(无 phase-researcher、无 assumptions analyzer、无 integration-checker)的临时任务。比 `/gdd:fast` 更稳;比完整流水线更快。

---

## 为什么能行

### 上下文工程

AI 编码 CLI 很强 **前提是** 你给它喂足上下文。多数人没有。

GDD 替你处理:

| 文件 | 作用 |
|------|------|
| `.design/BRIEF.md` | 本周期的设计问题、受众、成功指标 |
| `.design/DESIGN.md` | 当前设计系统快照(token、组件、层级) |
| `.design/DESIGN-CONTEXT.md` | D-XX 决策、采访答案、上下游约束 |
| `.design/DESIGN-PLAN.md` | 原子任务、wave 编排、依赖 |
| `.design/DESIGN-VERIFICATION.md` | 验证结果、gap 列表、Handoff Faithfulness 评分 |
| `.design/intel/` | 可查询知识层:token 扇出、组件 call-graph、决策溯源 |
| `.design/archive/cycle-N/EXPERIENCE.md` | 周期回顾,跨周期记忆 |
| `.design/telemetry/events.jsonl` | 跨阶段的类型化事件流 |
| `.design/telemetry/posterior.json` | Bandit 后验(`adaptive_mode != static` 时) |

尺寸限制以 Claude 质量下降的边界为准。守住,得到稳定的高质量。

### 37 个专用智能体

每个阶段都是「薄编排器 + 专用智能体」。重活在新鲜的 200k 上下文里跑,不占用你会话的主上下文。

| 阶段 | 编排器做什么 | 智能体做什么 |
|------|-------------|------------|
| Brief | 一次一问的访谈 | (无子智能体 —— 叶子 skill) |
| Explore | 派出 5 个 mapper + discussant | 5 个并行 mapper、design-discussant、research-synthesizer |
| Plan | 派出研究员 + planner + checker | design-phase-researcher(可选)、design-planner(opus)、design-plan-checker(haiku) |
| Design | wave 协调 + worktree 隔离 | 每个任务一个 design-executor,solidify 失败时 design-fixer |
| Verify | 派出 auditor + verifier + checker | design-auditor(6 维评分)、design-verifier(目标向回)、design-integration-checker(D-XX → 代码) |
| Reflect | 读遥测 + 学习 | design-reflector(opus)、design-authority-watcher、design-update-checker |

### 12 个工具接入

全部可选 —— 任何接入缺席时流水线会优雅降级:

- **Figma**(读 + 写 + Code Connect) —— 注释、token 绑定、实现状态回写
- **Refero** —— 设计参考检索
- **Pinterest** —— 视觉参考扎根
- **Claude Design** —— 导出包导入(`/gdd:handoff`)
- **Storybook** —— 组件规范查询
- **Chromatic** —— 视觉回归基线 diff
- **Preview** —— Playwright + Claude Preview MCP 运行时截图
- **paper.design** —— MCP 画布读写,canvas → code → verify → canvas 往返
- **pencil.dev** —— git 追踪的 `.pen` 规格(无须 MCP)
- **Graphify** —— 知识图谱导出
- **21st.dev Magic** —— greenfield 构建前的先例搜索
- **Magic Patterns** —— DS-aware 组件生成,带 `preview_url`

### 内置设计参考

插件随附 **18+ 份参考文件**,覆盖每个主要的设计知识领域。智能体不必上网搜索就能拿到权威答案:

- **启发法** —— NN/g 10、Don Norman 情感设计、Dieter Rams 10 原则、Disney 12(动效)、Sonner / Emil Kowalski 组件作者视角、Peak-End、Loss Aversion、Cognitive Load、Aesthetic-Usability、Doherty、Flow。
- **组件** —— 35 个组件规范(Material 3、Apple HIG、Radix、shadcn、Polaris、Carbon、Fluent、Atlassian、Ant、Mantine、Chakra、Base Web、Spectrum、Lightning、Evergreen、Gestalt),统一模板(用途 · 解剖 · 变体 · 状态 · 尺寸 · 排版 · 键盘 · 动效 · Do/Don't · 反模式 · 引用 · grep 签名)。
- **视觉 + 品牌** —— gestalt、视觉层级、品牌语调、调色板目录(161 个行业)、风格词汇(67 种 UI 美学)、图标(Lucide / Phosphor / Heroicons / Radix Icons / Tabler / SF Symbols)。
- **动效** —— 12 个权威 easing(RN MIT)+ 8 个过渡族(hyperframes Apache-2.0)+ spring 预设 + 插值分类 + 高阶手艺(手势、clip-path、模糊交叉淡入、View Transitions API、WAAPI)。
- **平台 + a11y** —— WCAG 2.1 AA 阈值、平台(iOS / Android / web / visionOS / watchOS)、RTL + CJK + 文化色彩、表单模式(Wroblewski 标签研究、autocomplete 分类、CAPTCHA 伦理)。
- **反模式** —— 正则签名目录,由 `design-pattern-mapper` 匹配。

### 原子化 git commit

每个设计任务在完成后立即获得自己的 commit:

```
abc123f docs(08-02): complete user-card token plan
def456g feat(08-02): unify card surface tokens with --color-bg-elevated
hij789k feat(08-02): replace inline padding with --space-* scale
lmn012o test(08-02): assert card.spec passes WCAG contrast 4.5:1
```

Git bisect 精确定位失败任务。每个任务可独立回退。Solidify-with-rollback 增加任务级验证闸门,所以坏掉的任务 3 不会在 verify 跑之前先污染任务 4–10。

### 自我改进循环

每个周期结束后,`design-reflector`(opus)读取 `events.jsonl`、`agent-metrics.json`、`learnings/`,然后提出 diff:

- **Tier override** —— 「design-verifier 在 < 300 行的 plan 上:降到 haiku,质量未见回归」
- **并行规则** —— 「token-mapper 与 component-taxonomy-mapper 在 `Touches: src/styles/` 上冲突;串行化」
- **参考新增** —— 「L-12 在第 3–5 周期被引用 9 次;晋升到 `reference/heuristics.md`」
- **Frontmatter 更新** —— 「design-executor 的 `typical-duration-seconds: 60` 实测 142 秒;提议改 120」

`/gdd:apply-reflections` 显示 diff 并询问后再应用。任何东西都不会自动应用。**No-Regret 自适应层**(v1.23.5)在其上叠加 Thompson 采样 bandit + AdaNormalHedge 集成 + MMR 重排,通过 informed-prior 引导,单用户即可使用。

### 成本治理

- **`gdd-router` skill** —— 决定性的 intent → fast / quick / full 路由,无模型调用。
- **`gdd-cache-manager`** —— Layer-B 显式缓存,SHA-256 输入哈希,5 分钟 TTL 感知。
- **`budget-enforcer` PreToolUse 钩子** —— 按 `.design/budget.json` 强制 tier override、硬上限、延迟 spawn 闸门。
- **每个 spawn 的成本遥测** —— `.design/telemetry/costs.jsonl` 行喂给 `/gdd:optimize` 的规则推荐。

目标:质量不退步的前提下让每任务 token 成本下降 50–70%。

---

## 命令

### 核心流水线

| 命令 | 作用 |
|------|------|
| `/gdd:brief` | 阶段 1 —— 捕获设计简报 |
| `/gdd:explore` | 阶段 2 —— 代码库清点 + 采访 |
| `/gdd:plan` | 阶段 3 —— 生成 DESIGN-PLAN.md |
| `/gdd:design` | 阶段 4 —— 按 wave 执行 |
| `/gdd:verify` | 阶段 5 —— 回到简报做验证 |
| `/gdd:ship` | 生成干净的 PR 分支(过滤 .design/ 提交) |
| `/gdd:next` | 根据 STATE.md 自动路由到下一阶段 |
| `/gdd:do <text>` | 自然语言路由 —— 选合适的命令 |
| `/gdd:fast <text>` | 一次性琐碎修复,不走流水线 |
| `/gdd:quick` | 临时任务,带 GDD 保证但跳过可选闸门 |

### 首跑 + 上手

| 命令 | 作用 |
|------|------|
| `/gdd:start` | 首跑证明路径 —— 仓库内最重要的 3 个设计问题(在你 opt in 前不留 .design/ 痕迹) |
| `/gdd:new-project` | 初始化 GDD 项目(PROJECT.md + STATE.md + 第一个周期) |
| `/gdd:connections` | 12 个外部接入的引导向导 |

### 周期生命周期

| 命令 | 作用 |
|------|------|
| `/gdd:new-cycle` | 开启新周期 |
| `/gdd:complete-cycle` | 归档周期产物 + 写每周期 EXPERIENCE.md |
| `/gdd:pause` / `/gdd:resume` | 编号 checkpoint —— 阶段中暂停,从任意 checkpoint 恢复 |
| `/gdd:continue` | `/gdd:resume` 的别名(最近的 checkpoint) |
| `/gdd:timeline` | 跨周期 + git log 的叙事性回顾 |

### 迭代与决策

| 命令 | 作用 |
|------|------|
| `/gdd:discuss [topic]` | 自适应设计采访 —— `--all` 批量灰区,`--spec` 模糊度评分 |
| `/gdd:list-assumptions` | 在计划前曝光隐藏的设计假设 |
| `/gdd:sketch [idea]` | 多变体 HTML mockup 探索 —— 浏览器直开 |
| `/gdd:spike [idea]` | 限时可行性实验,带假设 + 结论 |
| `/gdd:sketch-wrap-up` / `/gdd:spike-wrap-up` | 把发现打包成项目本地 skill |
| `/gdd:audit` | 包装 `design-verifier` + `design-auditor` + `design-reflector`。`--retroactive` 审计完整周期 |
| `/gdd:reflect` | 按需运行 `design-reflector` —— 产出 `.design/reflections/<cycle-slug>.md` |
| `/gdd:apply-reflections` | 审核并选择性应用 reflector 提案 —— 应用前先 diff |

### 记忆 + 知识层

| 命令 | 作用 |
|------|------|
| `/gdd:recall <query>` | 跨周期归档、学习、决策、EXPERIENCE.md 的 FTS5 检索 |
| `/gdd:extract-learnings` | 从周期产物挖掘模式、决策、教训 |
| `/gdd:note <text>` | 零摩擦想法记录 —— 追加、列出、提升为 todo |
| `/gdd:plant-seed <idea>` | 带触发条件的前瞻想法 —— 在合适周期浮现 |
| `/gdd:analyze-dependencies` | Token 扇出、组件 call-graph、决策溯源、循环依赖检测 |
| `/gdd:skill-manifest` | 列出 intel store 里的所有 GDD skill 与智能体 |
| `/gdd:graphify` | 构建、查询、检视、diff 项目知识图谱 |
| `/gdd:watch-authorities` | diff 设计权威 feed 白名单 + 5 桶分类 |

### 接入

| 命令 | 作用 |
|------|------|
| `/gdd:figma-write` | 把设计决策写回 Figma(annotate / tokenize / roundtrip) |
| `/gdd:handoff <bundle>` | 导入 Claude Design 导出包,跳过阶段 1–3 |
| `/gdd:darkmode` | 审计暗色模式实现(CSS 自定义属性 / Tailwind dark: / JS class toggle) |
| `/gdd:compare` | 计算 DESIGN.md baseline 与 DESIGN-VERIFICATION.md 结果的差异 |
| `/gdd:style <Component>` | 生成组件交付文档(DESIGN-STYLE-[Component].md) |

### 诊断 + 取证

| 命令 | 作用 |
|------|------|
| `/gdd:scan` | 代码库设计系统清点(不写 STATE.md) |
| `/gdd:map` | 5 个并行代码库 mapper |
| `/gdd:debug [desc]` | 症状驱动的设计调查,持久化状态 |
| `/gdd:health` | 报告 `.design/` 产物健康度 —— 陈旧、缺失、token 漂移 |
| `/gdd:progress` | 显示流水线位置;`--forensic` 跑 6 项完整性审计 |
| `/gdd:stats` | 周期统计 —— 决策、任务、commit、时间线、git 指标 |
| `/gdd:optimize` | 规则化成本分析 + tier-override 推荐 |
| `/gdd:warm-cache` | 预热所有引入 shared-preamble 的智能体的 Anthropic 缓存 |

### 分发 + 更新

| 命令 | 作用 |
|------|------|
| `/gdd:update` | 更新 GDD,带 changelog 预览 |
| `/gdd:reapply-patches` | 结构性更新后重新拼接 `reference/` 本地修改 |
| `/gdd:check-update` | 手动检查更新 —— `--refresh` 绕过 24h TTL,`--dismiss` 隐藏提示 |
| `/gdd:settings` | 配置 `.design/config.json` —— profile / parallelism / cleanup |
| `/gdd:set-profile <profile>` | 切换模型档位(quality / balanced / budget / inherit) |
| `/gdd:undo` | 安全的设计回退 —— 用 git log + 依赖检查 |
| `/gdd:pr-branch` | 过滤 `.design/` 与 `.planning/` 提交后的干净 PR 分支 |

### 待办 + 注释

| 命令 | 作用 |
|------|------|
| `/gdd:todo` | 添加 / 列出 / 选取设计任务 |
| `/gdd:add-backlog <idea>` | 将想法停泊到未来周期 |
| `/gdd:review-backlog` | 审视停泊项并提升到当前周期 |

### 帮助

| 命令 | 作用 |
|------|------|
| `/gdd:help` | 完整命令列表与用法 |
| `/gdd:bandit-reset` | 在 Anthropic 模型发布时重置自适应层后验 |

---

## 接入

GDD 随附 12 个工具接入。全部可选;任何接入缺席时流水线会优雅降级。用 `/gdd:connections` 配置。

| 接入 | 用途 | 探针 |
|------|------|------|
| **Figma** | 读 token、组件、截图;写注释、Code Connect、实现状态 | `mcp__figma__get_metadata` + `use_figma` |
| **Refero** | 跨编录的设计参考检索 | `mcp__refero__search` |
| **Pinterest** | 品牌语调 + 风格的视觉参考 | OAuth + MCP |
| **Claude Design** | 导出包导入(`/gdd:handoff`) | URL 或本地文件 |
| **Storybook** | 6006 端口的组件规范查询 | HTTP 探测 |
| **Chromatic** | 视觉回归基线 diff | API key |
| **Preview** | Playwright + Claude Preview MCP 运行时截图 | `mcp__Claude_Preview__preview_*` |
| **paper.design** | MCP 画布读写,canvas → code → verify → canvas | `mcp__paper__use_paper` |
| **pencil.dev** | git 追踪的 `.pen` 规格 | 仓库内 `.pen` 文件 |
| **Graphify** | 知识图谱导出 | `mcp__graphify__*` |
| **21st.dev Magic** | greenfield 前的先例搜索 | `mcp__magic__search` |
| **Magic Patterns** | DS-aware 组件生成 | `mcp__magic-patterns__generate` |

完整接入细节见 [`connections/connections.md`](connections/connections.md)。

---

## 配置

GDD 把项目设置存在 `.design/config.json`。在 `/gdd:new-project` 期间配置,或之后用 `/gdd:settings` 更新。

### 模型档位

控制每个智能体使用的 Claude 模型。在质量与 token 之间取舍。

| 档位 | 计划 | 执行 | 验证 |
|------|------|------|------|
| `quality` | Opus | Opus | Sonnet |
| `balanced`(默认) | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |
| `inherit` | Inherit | Inherit | Inherit |

切换:

```
/gdd:set-profile budget
```

使用非 Anthropic 提供商或希望跟随运行时当前模型选择时,用 `inherit`。

### 自适应模式

`.design/budget.json#adaptive_mode` 阶梯(v1.23.5):

| 模式 | 作用 |
|------|------|
| `static`(默认) | Phase 10.1 行为 —— 静态 D-13 tier 表 |
| `hedge` | 启用 AdaNormalHedge 集成 + MMR 重排,Bandit 路由仍读静态表。最稳妥的入门。 |
| `full` | Bandit 路由 + Hedge + MMR 全部活跃,读写 `.design/telemetry/posterior.json` |

### 并行性

| 设置 | 默认 | 控制什么 |
|------|------|---------|
| `parallelism.enabled` | `true` | 在 worktree 中跑独立任务 |
| `parallelism.min_estimated_savings_seconds` | `30` | 低于此阈值不并行 |
| `parallelism.max_concurrent_workers` | `4` | 并行 worker 硬上限 |

### 质量闸门

| 设置 | 默认 | 控制什么 |
|------|------|---------|
| `solidify.rollback_mode` | `"stash"` | `stash` / `hard` / `none` —— 验证失败时如何回退 |
| `solidify.commands` | 自动检测 | 覆盖 typecheck / build / test 命令 |
| `verify.iterations_max` | `3` | verify→fix 循环上限 |
| `connection.figma_writeback` | `proposal` | `proposal` / `auto` —— 写入前是否确认 |

---

## 安全

### 内建加固

GDD 自 Phase 14.5 起内置纵深防御:

- **`hooks/gdd-bash-guard.js`** —— PreToolUse:Bash 阻止约 50 种危险模式(`rm -rf /`、`chmod 777`、`curl | sh`、`git reset --hard`、fork bomb),先做 Unicode NFKC + ANSI 归一化。
- **`hooks/gdd-protected-paths.js`** —— PreToolUse:Edit/Write/Bash 强制 `protected_paths` glob 列表(默认:`reference/**`、`.design/archive/**`、`skills/**`、`commands/**`、`hooks/**`、`.design/config.json`、`.design/telemetry/**`)。
- **`hooks/gdd-read-injection-scanner.ts`** —— 扫描 Read 内容里的不可见 Unicode(零宽、word-joiner、BOM、bidi 反转)、HTML 注释、密钥外泄模式。
- **`scripts/lib/blast-radius.cjs`** —— `design-executor` 预检拒绝超过 `max_files_per_task: 10` / `max_lines_per_task: 400` 的任务。
- **`hooks/gdd-mcp-circuit-breaker.js`** —— 在 `use_figma` / `use_paper` / `use_pencil` 上打断连续超时循环。

### 保护敏感文件

把敏感路径加到运行时的 deny 列表:

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
> 因为 GDD 会生成成为 LLM 系统提示词的 markdown,任何流入 `.design/` 的用户控制文本都是潜在的间接提示注入向量。注入扫描器在多层捕获 —— 但纵深防御仍是最佳实践。

---

## 故障排查

**安装后命令找不到?**
- 重启运行时以重载命令/skill
- 全局 Claude Code:验证 `~/.claude/skills/get-design-done/`
- 本地安装:验证 `./.claude/skills/get-design-done/`
- `/gdd:help` 验证注册

**流水线在某阶段卡住?**
- `/gdd:resume` —— 从最近的编号 checkpoint 恢复
- `/gdd:health` —— 诊断 `.design/` 产物问题
- `/gdd:progress --forensic` —— 6 项完整性审计

**成本超支?**
- `/gdd:optimize` —— 规则化推荐
- `/gdd:set-profile budget` —— 切到预算档
- 在 `.design/budget.json` 设置 `adaptive_mode: "full"` —— bandit 会在 5–10 个周期内学到每个智能体的「便宜且正确」档位

**升级到最新版?**
```bash
npx @hegemonart/get-design-done@latest
```

**Docker / 容器?**

```bash
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

### 卸载

```bash
# 全局卸载(每个运行时)
npx @hegemonart/get-design-done --claude --global --uninstall
npx @hegemonart/get-design-done --opencode --global --uninstall
# ... 14 个运行时同样的 --<runtime> --global --uninstall 模式

# 多选交互式卸载(不带运行时 flag)
npx @hegemonart/get-design-done --uninstall

# 当前项目卸载
npx @hegemonart/get-design-done --claude --local --uninstall
# ... 同样的 flag 加 --local
```

会移除所有 GDD 命令、智能体、钩子、设置,同时保留你其他配置。

---

## 许可证

MIT 协议。详见 [LICENSE](LICENSE)。

---

<div align="center">

**Claude Code 把代码交付出来。Get Design Done 让它也能把设计交付出来。**

</div>

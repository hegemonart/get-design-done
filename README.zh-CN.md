<div align="center">

# GET DESIGN DONE

[English](README.md) · **简体中文**

**面向 Claude Code 的 Agent 编排设计工作流。五个阶段，三十三个专用 Agent，十二个工具接入 —— 从设计简报直达可发布的验证结果。**

**专治 "Claude 看起来做得还行，但整套东西对不上" 的老毛病：没有抽取设计系统、没有参考对齐、没有回到简报做验证。**

[![npm version](https://img.shields.io/npm/v/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![npm downloads](https://img.shields.io/npm/dm/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![GitHub stars](https://img.shields.io/github/stars/hegemonart/get-design-done?style=for-the-badge&logo=github&color=181717)](https://github.com/hegemonart/get-design-done)
[![CI](https://img.shields.io/github/actions/workflow/status/hegemonart/get-design-done/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/hegemonart/get-design-done/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

<br>

```bash
npx @hegemonart/get-design-done@latest
```

**一条命令即可安装。支持 macOS、Linux、Windows。依赖 Claude Code + Node 22/24。**

<br>

*"Claude 写代码很快。Get Design Done 让它也能把设计交付出来。"*

<br>

[为什么做这个](#为什么做这个) · [工作流程](#工作流程) · [画布工具](#ai-native-画布工具) · [组件生成器](#组件生成器) · [命令列表](#命令列表) · [接入的工具](#接入的工具)

</div>

---

> [!IMPORTANT]
> ### 已有 Claude Design 导出包？
>
> 如果你从 [claude.ai/design](https://claude.ai/design) 导出了设计，可以直接跳过前三个阶段：
>
> ```
> /gdd:handoff ./my-design.html
> ```
>
> 此命令会把导出包里的 CSS 自定义属性解析成 D-XX 设计决策，运行带 Handoff Faithfulness 评分的验证流程，并可选地把实现状态写回 Figma。格式说明见 [`connections/claude-design.md`](connections/claude-design.md)。

---

## 为什么做这个

我是一个用 Claude Code 发布产品的设计师。代码侧的工作流（GSD、Speckit、BMAD）已经很成熟，设计侧还没有。

反复遇到的问题是：Claude 生成 UI 很乐意，但输出是**脱节的**。Token 对不上既有设计系统、对比度悄悄跌破 WCAG、层级每个页面都重新发明一遍、旧项目里的反模式渗进新项目。所有这些问题要到 PR review 才被发现，因为没人把结果回到最初的设计简报上做校验。

所以我做了 Get Design Done。哲学与 GSD 一致 —— **复杂度在系统里，不在你的工作流里**。幕后：三十三个专用 Agent、一个可查询的 intel 存储、按模型分层的路由、十二个工具接入、基于遥测的自我改进循环。台前：几个直接能用的命令。

流水线既完成工作，也对工作做验证。我信任这个流程。它把设计交付出来。

— **Hegemon**

---

设计侧的 "vibecoding" 和代码侧一样会失败：你描述想要什么，AI 生成看起来像回事的东西，一上规模就垮 —— 因为没有任何东西把产出回拴到最初的简报。

Get Design Done 修的就是这个。它是 Claude Code 里设计工作的上下文工程层。捕获简报、清点系统、在真实参考里扎根、拆解成原子化的设计任务、回到简报上做验证 —— 然后发布。

---

## 适合谁

任何用 Claude Code 发布 UI、且希望结果确实站得住的人 —— 工程师、设计师、design engineer、solo 创始人都合适。如果你在意 token 对齐、对比度过 WCAG、结果能回到最初需求，这就是给你的。

你不必是专业设计师。流水线自己承担设计专业部分 —— 它抽取系统、在参考里扎根、回到简报做校验，并捕获那些普通人常漏掉的问题。

内建的质量闸门会抓真实问题：Claude Design 导出包的 Handoff Faithfulness 评分、调色板 × 表面矩阵的完整对比度审计、NNG 反模式目录检测、暗色模式架构校验、以及动效系统一致性检查。

### v1.14.0 亮点

- **AI-native 画布工具** —— paper.design（MCP 画布读写、截图验证）和 pencil.dev（git 追踪的 `.pen` 规格文件，不需要 MCP）补齐了一条完整的 canvas→code→verify→canvas 往返链路。
- **组件生成器** —— 21st.dev Magic MCP 在任何 greenfield 构建前加入先例匹配闸门；Magic Patterns 生成带 `preview_url` 的 DS-aware 组件用于视觉校验。两者都接入同一个 `design-component-generator` Agent。
- **十二个工具接入** —— 新增四个（paper.design、pencil.dev、21st.dev、Magic Patterns），加上原有的八个。全部可选；任何接入缺席时流水线会优雅地降级到回退方案。

---

## 快速开始

```bash
npx @hegemonart/get-design-done@latest
```

就这一条。安装器会**原子地**把 `get-design-done` 市场条目写入 `~/.claude/settings.json`，并启用插件。重启 Claude Code（或运行 `/reload-plugins`）之后，流水线就上线了。

**安装器做了什么**

- 在 `extraKnownMarketplaces` 里注册 `github:hegemonart/get-design-done` 市场
- 将 `enabledPlugins["get-design-done@get-design-done"]` 置为 `true`
- 保留 settings 里的其他所有键 —— 主题、权限、其他市场 —— 完全不动
- 幂等：可以重复运行；不会产生重复条目

首次启动 Claude Code 时，`SessionStart` bootstrap 钩子会自动准备参考库 `~/.claude/libs/awesome-design-md`（幂等，后续会话只执行 `git pull --ff-only`）。

### 非交互安装（CI、Docker、脚本）

```bash
# 预演：只打印 diff，不实际写入
npx @hegemonart/get-design-done@latest --dry-run

# 自定义配置目录（Docker，或非默认 Claude 根目录）
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done@latest
```

### 另一种方式：Claude Code CLI

不想经过 npm 包？直接用原生插件 CLI：

```bash
claude plugin marketplace add hegemonart/get-design-done
claude plugin install get-design-done@get-design-done
```

这就是安装器帮你做的事情 —— `npx` 只是把两条命令合成了一条。

任何安装方式都可以通过下面这条命令验证：

```
/gdd:help
```

> [!TIP]
> 建议以 `--dangerously-skip-permissions` 方式运行 Claude Code，以获得流畅的自动化体验。GDD 设计用于自主的多阶段执行；每次读文件和 `git commit` 都要人工批准会抵消全部意义。

### 保持最新

Get Design Done 发版频繁。要拿到最新的插件契约，只需要**再跑一次安装器** —— 它是幂等的，会就地更新已注册的市场条目：

```bash
npx @hegemonart/get-design-done@latest
```

也可以在 Claude Code 里直接运行：

```
/gdd:update
```

`/gdd:update` 会在应用前预览 changelog。`reference/` 目录下的本地修改会被保留 —— 如果结构性更新后需要重新 stitch，用 `/gdd:reapply-patches`。当有新版本时，`SessionStart` 钩子会显示一行横幅通知，并被门控逻辑保护，绝不会打断正在运行的流水线阶段。

---

## 工作流程

> **新接入既有代码库？** 先运行 `/gdd:map`。它会并行派出 5 个专业 mapper（tokens、components、visual hierarchy、a11y、motion）并写入 `.design/map/` —— 这些结构化数据是 Explore 阶段的高质量输入，比基于 grep 的回退方案好得多。

### 1. Brief（简报）

```
/gdd:brief
```

一条命令在任何扫描或探索之前先捕获设计问题。此 skill 通过 `AskUserQuestion` 一次一问 —— 只针对未回答的部分：问题、受众、约束、成功指标、范围。

### 2. Explore（勘察）

```
/gdd:explore
```

清点当前代码库的设计系统：颜色、排版、间距、组件、动效、可访问性、暗色模式。产出 `.design/DESIGN.md`、`.design/DESIGN-DEBT.md`、`.design/DESIGN-CONTEXT.md`。也会以 `AskUserQuestion` 采访方式补充未在代码里暴露的决策。

### 3. Plan（计划）

```
/gdd:plan
```

将 Explore 产出分解为原子化、带 wave 编排和依赖分析的设计任务，写入 `DESIGN-PLAN.md`。每个任务有明确的 Touches 字段、可并行性标签和验收准则。

### 4. Design（执行）

```
/gdd:design
```

按 wave 顺序执行计划中的任务。每个任务派出专用 executor Agent，带原子 git commit，并根据代码内上下文偏差规则自动处理偏差。

### 5. Verify（验证）

```
/gdd:verify
```

回到简报做验证 —— 必须达成项、NNG 启发式、审计评分、token 集成检查。失败时产出结构化 gap 列表；可通过 `/gdd:audit` 进入 verify→fix 循环。

### 6. Ship → Reflect → 下一轮

验证通过之后，`/gdd:ship` 生成干净的 PR 分支，`/gdd:reflect` 输出改进建议，`/gdd:apply-reflections` 审核并应用；`/gdd:new-cycle` 开启新的设计周期。

---

## 为什么能行

### 上下文工程

Claude Code 功能强大，**前提是**你给它喂足了上下文。多数人没有。

GDD 替你处理：

| 文件 | 作用 |
|------|------|
| `.design/BRIEF.md` | 本次周期的设计问题、受众、成功指标 |
| `.design/DESIGN.md` | 当前设计系统快照（tokens、组件、层级） |
| `.design/DESIGN-CONTEXT.md` | D-XX 决策、采访答案、上下游约束 |
| `.design/DESIGN-PLAN.md` | 原子化任务、wave 编排、依赖 |
| `.design/DESIGN-VERIFICATION.md` | 验证结果、gap 列表、Handoff Faithfulness 评分 |
| `.design/intel/` | 可查询的知识层：token 扇出、组件 call-graph、决策溯源 |

### 33 个专用 Agent

每个阶段都是 "薄编排器 + 专用 Agent" 的模式。编排器本身很轻，重活由 Agent 在全新的 200k 上下文窗口里做，不占用你会话的主上下文。

### 12 个工具接入

Figma、Refero、Pinterest、Storybook、Chromatic、Claude Design、Playwright 预览、Graphify 知识图谱、paper.design、pencil.dev、21st.dev、Magic Patterns。全部可选；任何一个缺席时流水线都会优雅降级到回退方案。

### 原子化 git commit

每个设计任务独立提交。Git bisect 能精确定位失败任务；每个任务都可以独立 revert；在 AI 自动化流程里带来更好的可观测性。

### 自我改进

每次周期结束后，reflector Agent 读取遥测、learnings 和 Agent 指标，生成 `reflections/<slug>.md` 具体改进提案。用 `/gdd:apply-reflections` 审核并选择性应用。

---

## 命令列表

### 核心流水线

| 命令 | 作用 |
|------|------|
| `/gdd:brief` | 阶段 1 — 捕获设计简报 |
| `/gdd:explore` | 阶段 2 — 清点代码库 + 采访补齐上下文 |
| `/gdd:plan` | 阶段 3 — 生成 DESIGN-PLAN.md |
| `/gdd:design` | 阶段 4 — 按 wave 执行计划 |
| `/gdd:verify` | 阶段 5 — 回到简报做验证 |
| `/gdd:ship` | 生成干净的 PR 分支 |
| `/gdd:next` | 根据 STATE.md 自动路由到下一阶段 |

### 生命周期

| 命令 | 作用 |
|------|------|
| `/gdd:new-project` | 初始化新的 GDD 项目 |
| `/gdd:new-cycle` | 开启新的设计周期 |
| `/gdd:complete-cycle` | 归档当前周期 |
| `/gdd:pause` / `/gdd:resume` | 会话暂停/恢复 |

### 独立命令（无需流水线初始化）

| 命令 | 作用 |
|------|------|
| `/gdd:handoff` | 直接摄取 Claude Design 导出包 |
| `/gdd:style` | 为单个组件生成交付文档 |
| `/gdd:darkmode` | 暗色模式审计 |
| `/gdd:figma-write` | 把决策写回 Figma |
| `/gdd:sketch` / `/gdd:spike` | 丢弃式原型 / 技术验证 |
| `/gdd:fast` / `/gdd:quick` | 轻量任务的快速路径 |

完整命令列表运行 `/gdd:help` 查看。

---

## 配置

核心配置在 `.design/config.json`。通过 `/gdd:settings` 管理。

### 模型档位

| 档位 | 规划 | 执行 | 验证 |
|------|------|------|------|
| `quality` | Opus | Opus | Sonnet |
| `balanced`（默认） | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |
| `inherit` | 跟随当前运行时 | 跟随 | 跟随 |

切换档位：

```
/gdd:settings profile budget
```

### 预算与优化

- `.design/budget.json` 里的 `per_task_cap_usd` / `per_phase_cap_usd` 由 PreToolUse `budget-enforcer` 钩子强制执行
- 成本遥测写到 `.design/telemetry/costs.jsonl`
- `/gdd:warm-cache` 跨所有 Agent 预热 Anthropic 的 5 分钟 prompt 缓存
- `/gdd:optimize` 基于遥测与 Agent 指标给出规则化建议

---

## 故障排查

**安装后找不到命令？**
- 重启 Claude Code 以重新加载 skills
- 用 `/gdd:help` 确认插件已注册
- 确认 `~/.claude/settings.json` 里有 `enabledPlugins["get-design-done@get-design-done"]: true`

**流水线卡住或产物缺失？**

```
/gdd:health
/gdd:progress --forensic
```

Forensic 模式运行一个 6 项检查的完整性审计 —— 陈旧产物、悬空决策、未完成的 handoff、孤立 cycle、schema 漂移、injection scanner 告警。

**想看 router 和 budget-enforcer 在做什么？**

在 `.design/budget.json` 里把 `enforcement_mode` 设为 `"log"` —— 钩子会把每个决策记录到 `.design/telemetry/costs.jsonl` 但不做阻断。

**升级到最新版？**

见 [保持最新](#保持最新)。短版本：`npx @hegemonart/get-design-done@latest` 或 `/gdd:update`。

### 卸载

```bash
claude plugin uninstall get-design-done@get-design-done
```

若要回滚 `npx` 安装器写入的两个键，手动删除或用下面这条命令：

```bash
node -e "const f=require('os').homedir()+'/.claude/settings.json';const j=require(f);delete j.extraKnownMarketplaces?.['get-design-done'];delete j.enabledPlugins?.['get-design-done@get-design-done'];require('fs').writeFileSync(f,JSON.stringify(j,null,2))"
```

这会移除所有 GDD 的 skill、agent、hook 和注册信息，同时保留你的其他配置和项目 `.design/` 产物。

---

## License

MIT License。详见 [LICENSE](LICENSE)。

---

<div align="center">

**Claude Code 很强。Get Design Done 让它能把设计交付出来。**

</div>

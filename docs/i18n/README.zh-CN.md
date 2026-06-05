<div align="center">

# GET DESIGN DONE

[English](../../README.md) · **简体中文** · [日本語](README.ja.md) · [한국어](README.ko.md) · [Français](README.fr.md) · [Italiano](README.it.md) · [Deutsch](README.de.md)

> 说明:此翻译可能落后于英文版本。规范版本以 [README.md](../../README.md) 为准 (translation may lag behind English; see README.md for the canonical version)。

**面向 AI 编码智能体的设计质量流水线:简报 -> 探索 -> 规划 -> 设计 -> 验证。**

**Get Design Done 让 AI 生成的 UI 始终贴住你的简报、设计系统、本地设计知识与质量闸门。为 Claude Code 打造,并可安装到 Codex、Cursor、Gemini、OpenCode、Copilot、Windsurf 等更多运行时。**

[![npm version](https://img.shields.io/npm/v/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![npm downloads](https://img.shields.io/npm/dm/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![CI](https://img.shields.io/github/actions/workflow/status/hegemonart/get-design-done/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/hegemonart/get-design-done/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/hegemonart/get-design-done?style=for-the-badge&logo=github&color=181717)](https://github.com/hegemonart/get-design-done)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

```bash
npx @hegemonart/get-design-done@latest
```

**支持 macOS、Linux 与 Windows。**

[安装](#安装) · [快速开始](#快速开始) · [使用场景](#使用场景) · [工作原理](#工作原理) · [命令](#命令) · [接入](#接入) · [安全与隐私](#安全与隐私)

</div>

---

## 这是什么

Get Design Done 帮助 AI 编码智能体交付真正属于你产品的 UI。

它把「把这个页面做好一点」这类宽泛请求,变成可追踪的设计工作流:简报、探索、规划、设计、验证。

与其让智能体仅凭品味即兴发挥,GDD 给它一套结构化流程、本地设计知识、项目专属记忆、可选的设计工具接入,以及发布前的验证。

## 为什么存在

AI 智能体产出 UI 很快。难的是让这些 UI 保持连贯。

没有设计工作流,生成的界面会漂移:

- 颜色和间距不再匹配设计系统
- 组件被重复发明
- 对比度和可访问性回退
- 层级在不同页面之间变化
- 实现不再与最初的简报一致

GDD 为 AI 编码工作流补上缺失的设计纪律。它捕获问题、映射当前设计系统、规划受控的改动、以原子步骤执行,并对照简报、token、可访问性和设计质量评分标准验证结果。

幕后:64 个专用智能体、可查询的 intel 存储、按模型分层的路由,以及 39 个可选工具接入。你日常用到的,只是少数几个 `/gdd:*` 命令。

## 安装

### npm

```bash
npx @hegemonart/get-design-done@latest
```

### Claude Code

```bash
/plugin marketplace add hegemonart/get-design-done
/plugin install get-design-done@get-design-done
/reload-plugins
```

### Codex

```bash
codex plugin marketplace add hegemonart/get-design-done
```

### agentskills.io

从 [agentskills.io](https://agentskills.io) 技能注册表浏览并安装 Get Design Done。

### 直接运行时安装器

```bash
# Claude Code
npx @hegemonart/get-design-done --claude --global
npx @hegemonart/get-design-done --claude --local

# 其他运行时
npx @hegemonart/get-design-done --codex --global
npx @hegemonart/get-design-done --cursor --global
npx @hegemonart/get-design-done --gemini --global

# 多运行时安装
npx @hegemonart/get-design-done --all --global

# 预演(不实际写入)
npx @hegemonart/get-design-done --dry-run
```

## 快速开始

跑一遍轻量的首次尝试:

```bash
/gdd:start
```

或运行完整的设计周期:

```bash
/gdd:brief
/gdd:explore
/gdd:plan
/gdd:design
/gdd:verify
```

使用自然语言路由:

```bash
/gdd:do improve the checkout page hierarchy, spacing, and empty states
```

## 使用场景

### 改进一个既有页面

当一个页面技术上可用,但视觉上不一致、不清晰或设计不到位时,使用 GDD。

```bash
/gdd:do improve the settings page layout and component hierarchy
```

### 把 AI 产出拉回设计系统

当智能体生成的 UI 看似合理,却不匹配你的 token、间距、状态或组件时,使用它。

```bash
/gdd:verify
```

### 发布前审计

在 PR、发版或设计交付前运行验证。

```bash
/gdd:audit
```

### 修复暗色模式

```bash
/gdd:darkmode
```

### 导入一份设计交付

```bash
/gdd:handoff ./my-design.html
```

这会解析一个 Claude Design 导出包,把 CSS 自定义属性抽取为设计决策,并运行交付忠实度检查。

### 做一个聚焦的小修复

```bash
/gdd:fast "fix contrast in pricing cards"
```

## 它的不同之处

### 本地设计知识

GDD 自带一套面向设计工作的丰富本地参考库。智能体无需依赖实时网络搜索,就能做出基本的设计判断。

它涵盖可访问性、WCAG、排版、间距、栅格、色彩、对比度、表面、动效、UX 文案、表单、空状态、视觉层级、暗色模式、响应式行为、i18n、研究方法、审计评分,以及设计反模式。

智能体并非从空白提示词起步。它拥有一套共享的设计词汇,以及可在规划、实现和验证阶段应用的具体标准。

完整地图:[docs/KNOWLEDGE-BASE.md](docs/KNOWLEDGE-BASE.md)

### 项目专属记忆

GDD 创建一个 `.design/` 工作区,让每个周期都有据可依:

| 产物 | 用途 |
| --- | --- |
| `.design/BRIEF.md` | 问题、受众、范围、成功指标 |
| `.design/DESIGN.md` | 当前设计系统快照 |
| `.design/DESIGN-CONTEXT.md` | 决策、约束、参考 |
| `.design/DESIGN-PLAN.md` | 原子化实现计划 |
| `.design/DESIGN-VERIFICATION.md` | 最终审计与差距报告 |
| `.design/intel/` | 可查询的项目知识:token、组件、关系、决策 |
| `.design/archive/` | 已完成周期的历史与学习 |

你用得越久,智能体需要重新发现的东西就越少。

### 发布前验证

UI「看起来做完了」并不会让 GDD 停下来。

验证阶段会检查结果是否仍然匹配:

- 最初的简报
- 设计系统 token
- 可访问性阈值
- 组件约定
- 视觉层级
- 动效与交互规则
- 已记录的设计决策

当出现差距时,GDD 会产出一份结构化的修复清单,而不是把审查交给感觉。

### 技能行为测试

GDD 自身的技能会在对抗性压力场景(时间压力、沉没成本、权威施压、范围最小化)下接受检验,以确认它们能守住纪律而不是退让。关于如何添加压力场景,见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 工作原理

```text
Brief -> Explore -> Plan -> Design -> Verify -> Ship
```

| 阶段 | 命令 | 产出 |
| --- | --- | --- |
| Brief | `/gdd:brief` | 捕获设计问题 |
| Explore | `/gdd:explore` | 映射 UI 系统、设计债、token、组件 |
| Plan | `/gdd:plan` | 创建原子化设计任务 |
| Design | `/gdd:design` | 带验证地执行任务 |
| Verify | `/gdd:verify` | 审计最终结果 |

### 核心产出

| 文件 | 作用 |
| --- | --- |
| `.design/BRIEF.md` | 本周期的问题、受众、成功指标 |
| `.design/DESIGN.md` | 当前设计系统快照 |
| `.design/DESIGN-CONTEXT.md` | 设计决策与约束 |
| `.design/DESIGN-PLAN.md` | 原子任务、wave、依赖 |
| `.design/DESIGN-VERIFICATION.md` | 验证结果与差距清单 |
| `.design/intel/` | 本项目的可查询知识层 |

## 命令

GDD 随附 96 个技能。这里是多数用户日常最需要的几个。完整参考见 [SKILL.md](SKILL.md)。

### 核心流水线

| 命令 | 用途 |
| --- | --- |
| `/gdd:brief` | 捕获设计简报 |
| `/gdd:explore` | 清点当前 UI 系统 |
| `/gdd:plan` | 产出设计计划 |
| `/gdd:design` | 执行计划 |
| `/gdd:verify` | 验证结果 |
| `/gdd:ship` | 准备干净的 PR 分支 |
| `/gdd:next` | 自动路由到下一阶段 |

### 日常使用

| 命令 | 用途 |
| --- | --- |
| `/gdd:do <task>` | 自然语言路由器 |
| `/gdd:fast <task>` | 聚焦的小修复 |
| `/gdd:quick` | 轻量任务流程 |
| `/gdd:audit` | 设计质量审计 |
| `/gdd:darkmode` | 暗色模式审计 |
| `/gdd:style <component>` | 组件样式交付 |
| `/gdd:health` | 诊断流水线状态 |
| `/gdd:progress` | 显示当前周期进度 |
| `/gdd:resume` | 从 checkpoint 恢复 |

### 设计工具与交付

| 命令 | 用途 |
| --- | --- |
| `/gdd:connections` | 配置可选集成 |
| `/gdd:figma-extract` | 抽取 Figma 设计系统上下文 |
| `/gdd:figma-write` | 把决策与状态写回 Figma |
| `/gdd:handoff <bundle>` | 导入 Claude Design 导出包 |
| `/gdd:sketch <idea>` | 生成多变体 HTML mockup |
| `/gdd:spike <idea>` | 限时可行性尝试 |

完整命令参考:[SKILL.md](SKILL.md)

## 接入

GDD 无需外部工具即可工作,但可以接入 39 个可选集成。全部可选;任何接入不可用时,流水线会优雅降级到回退方案。

接入层覆盖以下类别:

- **设计平面** - Figma(读 + 写 + Code Connect)、paper.design、pencil.dev、Penpot、Framer、Webflow、Plasmic
- **参考与研究** - Refero、Pinterest、Lazyweb、Mobbin、Claude Design 交付
- **组件生成** - 21st.dev Magic、Magic Patterns、v0.dev、Builder.io
- **组件规范与视觉 QA** - Storybook、Chromatic、Preview(Playwright + Claude Preview MCP)
- **知识图谱** - Graphify
- **原生与非 Web 产出** - Xcode Simulator、Android Emulator、Litmus / Email-on-Acid、打印渲染器
- **动效验证** - Lottie、Rive
- **团队平面** - Slack、Discord、Linear、Jira、Notion、GitHub PR

配置集成:

```bash
/gdd:connections
```

完整接入清单及探针模式,见 [connections/connections.md](connections/connections.md)。

## 环境要求

- Node.js 22 或 24
- Git
- 一个受支持的 AI 编码运行时

## 多运行时支持

GDD 可安装到 14 个 AI 编码运行时:Claude Code、Codex、Cursor、Gemini CLI、OpenCode、Kilo、Copilot、Windsurf、Antigravity、Augment、Trae、Qwen Code、CodeBuddy 与 Cline。同一套源技能与智能体,由各运行时专属的转换器编译为每个运行时的原生布局(`skills/`、`command/`、`agents/` 或 `.clinerules`),因此流水线会随你在各编辑器之间迁移。

Claude Code 是旗舰。完整体验在那里端到端运行:每个智能体、纵深防御钩子,以及 MCP 支撑的接入。在其他运行时上,你会以其原生形态获得同样的技能与智能体,MCP 支撑的接入会在具备 MCP 能力的宿主上启用,而钩子层是 Claude Code 专属的。

## 安全与隐私

GDD 默认本地优先。它把项目产物写在 `.design/` 下,仅在配置后才使用可选集成,并对问题上报保持明确同意门控。

插件包含纵深防御钩子,用于保护路径、阻断危险命令、注入扫描、MCP 断路,以及预算强制。GDD 还暴露 13 个只读 MCP 工具,用于安全的项目内省。

把敏感路径加到运行时的 deny 列表:

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

阅读:[SECURITY.md](SECURITY.md) · [PRIVACY.md](PRIVACY.md)

## 更新

```bash
npx @hegemonart/get-design-done@latest
```

或在 Claude Code 里:

```bash
/gdd:update
```

完整发布历史见 [CHANGELOG.md](CHANGELOG.md)。

## 故障排查

### 命令没有出现

重启你的运行时并运行:

```bash
/gdd:help
```

### 流水线卡住了

```bash
/gdd:health
/gdd:resume
```

### 成本太高

```bash
/gdd:optimize
```

## 贡献

```bash
npm install
npm test
npm run typecheck
```

阅读:[CONTRIBUTING.md](CONTRIBUTING.md)

## 许可证

MIT 协议。详见 [LICENSE](LICENSE)。第三方署名列于 [NOTICE](NOTICE)。

---

<div align="center">

**Claude Code 把代码交付出来。Get Design Done 确保它也把设计交付出来。**

</div>

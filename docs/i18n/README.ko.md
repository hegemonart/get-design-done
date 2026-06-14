<div align="center">

# GET DESIGN DONE

[English](../../README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · **한국어** · [Français](README.fr.md) · [Italiano](README.it.md) · [Deutsch](README.de.md)

> 참고: 이 번역은 영어 버전보다 늦을 수 있습니다. 기준이 되는 버전은 [README.md](../../README.md) 입니다 (translation may lag behind English; see README.md for the canonical version).

**AI 코딩 에이전트를 위한 디자인 품질 파이프라인: 브리프 -> 탐색 -> 계획 -> 디자인 -> 검증.**

**Get Design Done은 AI가 생성한 UI가 브리프, 디자인 시스템, 로컬 디자인 지식, 품질 게이트에 계속 묶여 있도록 합니다. Claude Code를 위해 만들어졌으며, Codex, Cursor, Gemini, OpenCode, Copilot, Windsurf 등에 설치됩니다.**

[![npm version](https://img.shields.io/npm/v/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![npm downloads](https://img.shields.io/npm/dm/@hegemonart/get-design-done?style=for-the-badge&logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/@hegemonart/get-design-done)
[![CI](https://img.shields.io/github/actions/workflow/status/hegemonart/get-design-done/ci.yml?branch=main&style=for-the-badge&logo=github&label=CI)](https://github.com/hegemonart/get-design-done/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/hegemonart/get-design-done?style=for-the-badge&logo=github&color=181717)](https://github.com/hegemonart/get-design-done)
[![Node](https://img.shields.io/badge/node-22%20%7C%2024-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

```bash
npx @hegemonart/get-design-done@latest
```

**macOS, Linux, Windows에서 동작합니다.**

[설치](#설치) · [빠른 시작](#빠른-시작) · [활용 사례](#활용-사례) · [작동 방식](#작동-방식) · [명령](#명령) · [연결](#연결) · [안전성](#보안과-프라이버시)

</div>

---

## 무엇인가

Get Design Done은 AI 코딩 에이전트가 제품에 어울리는 UI를 출시하도록 돕습니다.

"이 화면을 더 좋게 만들어 줘" 같은 막연한 요청을 추적 가능한 디자인 워크플로로 바꿉니다: 브리프, 탐색, 계획, 디자인, 검증.

에이전트에게 감각만으로 즉흥적으로 만들라고 요청하는 대신, GDD는 구조화된 프로세스, 로컬 디자인 지식, 프로젝트별 메모리, 선택적 디자인 도구 연결, 그리고 작업이 출시되기 전의 검증을 제공합니다.

## 왜 존재하는가

AI 에이전트는 UI를 빠르게 만들어 냅니다. 어려운 부분은 그 UI를 일관되게 만드는 것입니다.

디자인 워크플로가 없으면 생성된 인터페이스는 표류합니다:

- 색상과 간격이 시스템과 맞지 않게 됩니다
- 컴포넌트가 다시 발명됩니다
- 대비와 접근성이 후퇴합니다
- 위계가 화면마다 달라집니다
- 구현이 더 이상 원래 브리프와 맞지 않습니다

GDD는 AI 코딩 워크플로에 빠져 있던 디자인 규율을 더합니다. 문제를 캡처하고, 현재 디자인 시스템을 매핑하고, 범위가 정해진 변경을 계획하고, 원자적 단계로 실행한 뒤, 결과를 브리프, 토큰, 접근성, 디자인 품질 루브릭에 대해 검증합니다.

무대 뒤에는 64개의 전문 에이전트, 쿼리 가능한 인텔 저장소, 티어 인식 모델 라우팅, 39개의 선택적 도구 연결이 있습니다. 일상적으로 사용하는 것은 몇 개의 `/gdd:*` 명령입니다.

## 설치

### npm

```bash
npx @hegemonart/get-design-done@latest
```

### Claude Code

```bash
/plugin marketplace add hegemonart/hone
/plugin install get-design-done@get-design-done
/reload-plugins
```

### Codex

```bash
codex plugin marketplace add hegemonart/hone
```

### agentskills.io

[agentskills.io](https://agentskills.io) 스킬 레지스트리에서 Get Design Done을 둘러보고 설치하세요.

### 런타임 직접 인스톨러

```bash
# Claude Code
npx @hegemonart/get-design-done --claude --global
npx @hegemonart/get-design-done --claude --local

# Other runtimes
npx @hegemonart/get-design-done --codex --global
npx @hegemonart/get-design-done --cursor --global
npx @hegemonart/get-design-done --gemini --global

# Multi-runtime install
npx @hegemonart/get-design-done --all --global

# Preview without writing
npx @hegemonart/get-design-done --dry-run
```

## 빠른 시작

가벼운 첫 패스를 실행하세요:

```bash
/gdd:start
```

또는 전체 디자인 사이클을 실행하세요:

```bash
/gdd:brief
/gdd:explore
/gdd:plan
/gdd:design
/gdd:verify
```

자연어 라우팅:

```bash
/gdd:do improve the checkout page hierarchy, spacing, and empty states
```

## 활용 사례

### 기존 화면 개선

화면이 기술적으로는 동작하지만 시각적으로 일관되지 않거나, 불명확하거나, 디자인이 덜 된 느낌일 때 GDD를 사용하세요.

```bash
/gdd:do improve the settings page layout and component hierarchy
```

### AI 출력물을 디자인 시스템으로 되돌리기

에이전트가 그럴듯해 보이지만 토큰, 간격, 상태, 컴포넌트와 맞지 않는 UI를 생성했을 때 사용하세요.

```bash
/gdd:verify
```

### 출시 전 감사

PR, 릴리스, 디자인 핸드오프 전에 검증을 실행하세요.

```bash
/gdd:audit
```

### 다크 모드 수정

```bash
/gdd:darkmode
```

### 디자인 핸드오프 임포트

```bash
/gdd:handoff ./my-design.html
```

이것은 Claude Design 번들을 파싱하여 CSS 사용자 정의 속성을 디자인 결정으로 추출하고, 핸드오프 충실도 검사를 실행합니다.

### 작고 집중된 수정

```bash
/gdd:fast "fix contrast in pricing cards"
```

## 무엇이 다른가

### 로컬 디자인 지식

GDD는 디자인 작업을 위한 방대한 로컬 레퍼런스 라이브러리를 함께 제공합니다. 에이전트는 기본적인 디자인 판단을 위해 실시간 웹 검색에 의존하지 않고도 이를 사용할 수 있습니다.

접근성, WCAG, 타이포그래피, 간격, 그리드, 색상, 대비, 표면, 모션, UX 라이팅, 폼, 빈 상태, 시각 위계, 다크 모드, 반응형 동작, i18n, 리서치 방법, 감사 채점, 디자인 안티패턴을 다룹니다.

에이전트는 빈 프롬프트에서 시작하지 않습니다. 계획, 구현, 검증 동안 적용할 수 있는 공유된 디자인 어휘와 구체적인 표준을 가지고 있습니다.

전체 맵: [docs/KNOWLEDGE-BASE.md](docs/KNOWLEDGE-BASE.md)

### 프로젝트별 메모리

GDD는 각 사이클을 기반에 묶어 두는 `.design/` 워크스페이스를 만듭니다:

| 산출물 | 목적 |
| --- | --- |
| `.design/BRIEF.md` | 문제, 대상, 범위, 성공 지표 |
| `.design/DESIGN.md` | 현재 디자인 시스템 스냅샷 |
| `.design/DESIGN-CONTEXT.md` | 결정, 제약, 레퍼런스 |
| `.design/DESIGN-PLAN.md` | 원자적 구현 계획 |
| `.design/DESIGN-VERIFICATION.md` | 최종 감사 및 갭 보고 |
| `.design/intel/` | 쿼리 가능한 프로젝트 지식: 토큰, 컴포넌트, 관계, 결정 |
| `.design/archive/` | 완료된 사이클 이력과 학습 사항 |

오래 사용할수록 에이전트가 다시 발견해야 할 것이 줄어듭니다.

### 출시 전 검증

GDD는 UI가 "다 된 것처럼 보일" 때 멈추지 않습니다.

검증 단계는 결과가 여전히 다음과 맞는지 확인합니다:

- 원래 브리프
- 디자인 시스템 토큰
- 접근성 임계값
- 컴포넌트 규약
- 시각 위계
- 모션 및 인터랙션 규칙
- 기록된 디자인 결정

갭이 나타나면, GDD는 리뷰를 감각에 맡기는 대신 구조화된 수정 목록을 만들어 냅니다.

### 스킬 동작 테스트

GDD 자체 스킬은 적대적 압박 시나리오(시간 압박, 매몰 비용, 권위, 범위 최소화) 아래에서 시험되어, 무너지지 않고 규율을 유지하는지 확인합니다. 압박 시나리오를 추가하는 방법은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참조하세요.

## 작동 방식

```text
Brief -> Explore -> Plan -> Design -> Verify -> Ship
```

| 단계 | 명령 | 산출 |
| --- | --- | --- |
| Brief | `/gdd:brief` | 디자인 문제를 캡처 |
| Explore | `/gdd:explore` | UI 시스템, 부채, 토큰, 컴포넌트를 매핑 |
| Plan | `/gdd:plan` | 원자적 디자인 태스크를 생성 |
| Design | `/gdd:design` | 검증과 함께 태스크를 실행 |
| Verify | `/gdd:verify` | 최종 결과를 감사 |

### 핵심 산출물

| 파일 | 역할 |
| --- | --- |
| `.design/BRIEF.md` | 사이클의 문제, 대상, 성공 지표 |
| `.design/DESIGN.md` | 현재 디자인 시스템 스냅샷 |
| `.design/DESIGN-CONTEXT.md` | 디자인 결정과 제약 |
| `.design/DESIGN-PLAN.md` | 원자적 태스크, 웨이브, 의존성 |
| `.design/DESIGN-VERIFICATION.md` | 검증 결과와 갭 목록 |
| `.design/intel/` | 이 프로젝트를 위한 쿼리 가능한 지식 레이어 |

## 명령

GDD는 96개의 스킬을 제공합니다. 다음은 대부분의 사용자가 일상적으로 필요로 하는 것들입니다. 전체 레퍼런스는 [SKILL.md](SKILL.md)를 참조하세요.

### 핵심 파이프라인

| 명령 | 목적 |
| --- | --- |
| `/gdd:brief` | 디자인 브리프 캡처 |
| `/gdd:explore` | 현재 UI 시스템 인벤토리 |
| `/gdd:plan` | 디자인 계획 생성 |
| `/gdd:design` | 계획 실행 |
| `/gdd:verify` | 결과 검증 |
| `/gdd:ship` | 깨끗한 PR 브랜치 준비 |
| `/gdd:next` | 다음 단계로 자동 라우팅 |

### 일상 사용

| 명령 | 목적 |
| --- | --- |
| `/gdd:do <task>` | 자연어 라우터 |
| `/gdd:fast <task>` | 작고 집중된 수정 |
| `/gdd:quick` | 가벼운 태스크 흐름 |
| `/gdd:audit` | 디자인 품질 감사 |
| `/gdd:darkmode` | 다크 모드 감사 |
| `/gdd:style <component>` | 컴포넌트 스타일 핸드오프 |
| `/gdd:health` | 파이프라인 상태 진단 |
| `/gdd:progress` | 현재 사이클 진행 상황 표시 |
| `/gdd:resume` | 체크포인트에서 재개 |

### 디자인 도구 및 핸드오프

| 명령 | 목적 |
| --- | --- |
| `/gdd:connections` | 선택적 통합 구성 |
| `/gdd:figma-extract` | Figma 디자인 시스템 컨텍스트 추출 |
| `/gdd:figma-write` | 결정과 상태를 Figma에 다시 쓰기 |
| `/gdd:handoff <bundle>` | Claude Design 번들 임포트 |
| `/gdd:sketch <idea>` | 다중 변형 HTML 목업 생성 |
| `/gdd:spike <idea>` | 시간 제한 가능성 패스 |

전체 명령 레퍼런스: [SKILL.md](SKILL.md)

## 연결

GDD는 외부 도구 없이도 동작하지만, 39개의 선택적 통합에 연결할 수 있습니다. 모두 선택 사항이며, 어떤 연결이든 사용 불가일 때 파이프라인은 폴백으로 우아하게 degrade합니다.

연결 레이어는 다음 카테고리에 걸쳐 있습니다:

- **디자인 표면** - Figma (읽기 + 쓰기 + Code Connect), paper.design, pencil.dev, Penpot, Framer, Webflow, Plasmic
- **레퍼런스 및 리서치** - Refero, Pinterest, Lazyweb, Mobbin, Claude Design 핸드오프
- **컴포넌트 생성** - 21st.dev Magic, Magic Patterns, v0.dev, Builder.io
- **컴포넌트 사양 및 비주얼 QA** - Storybook, Chromatic, Preview (Playwright + Claude Preview MCP)
- **지식 그래프** - Graphify
- **네이티브 및 비웹 출력** - Xcode Simulator, Android Emulator, Litmus / Email-on-Acid, 인쇄 렌더러
- **모션 검증** - Lottie, Rive
- **팀 표면** - Slack, Discord, Linear, Jira, Notion, GitHub PR

통합 구성:

```bash
/gdd:connections
```

프로브 패턴이 포함된 전체 연결 목록은 [connections/connections.md](connections/connections.md)를 참조하세요.

## 요구사항

- Node.js 22 또는 24
- Git
- 지원되는 AI 코딩 런타임

## 다중 런타임 지원

GDD는 14개의 AI 코딩 런타임에 설치됩니다: Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Kilo, Copilot, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, Cline. 동일한 소스 스킬과 에이전트가 런타임별 변환기에 의해 각 런타임의 네이티브 레이아웃(`skills/`, `command/`, `agents/`, 또는 `.clinerules`)으로 컴파일되므로, 파이프라인이 에디터를 넘나들며 당신과 함께 이동합니다.

Claude Code가 대표 런타임입니다. 전체 경험은 그곳에서 처음부터 끝까지 실행됩니다: 모든 에이전트, 심층 방어 훅, MCP 기반 연결. 다른 런타임에서는 동일한 스킬과 에이전트를 네이티브 형태로 얻고, MCP 기반 연결은 MCP를 지원하는 호스트에서 활성화되며, 훅 레이어는 Claude Code 전용입니다.

## 보안과 프라이버시

GDD는 기본적으로 로컬 우선입니다. 프로젝트 산출물을 `.design/` 아래에 작성하고, 구성된 경우에만 선택적 통합을 사용하며, 이슈 리포팅은 동의 기반으로 유지합니다.

플러그인에는 보호된 경로, 위험 명령 차단, 인젝션 스캔, MCP 서킷 브레이킹, 예산 강제를 위한 심층 방어 훅이 포함됩니다. GDD는 또한 안전한 프로젝트 인트로스펙션을 위한 13개의 읽기 전용 MCP 도구를 제공합니다.

런타임의 deny 리스트에 민감 경로를 추가하세요:

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

읽기: [SECURITY.md](SECURITY.md) · [PRIVACY.md](PRIVACY.md)

## 업데이트

```bash
npx @hegemonart/get-design-done@latest
```

또는 Claude Code 안에서:

```bash
/gdd:update
```

전체 릴리스 이력은 [CHANGELOG.md](CHANGELOG.md)를 참조하세요.

## 문제 해결

### 명령이 나타나지 않음

런타임을 재시작하고 실행하세요:

```bash
/gdd:help
```

### 파이프라인이 멈춤

```bash
/gdd:health
/gdd:resume
```

### 비용이 너무 높음

```bash
/gdd:optimize
```

## 기여

```bash
npm install
npm test
npm run typecheck
```

읽기: [CONTRIBUTING.md](CONTRIBUTING.md)

## 라이선스

MIT 라이선스. 자세한 내용은 [LICENSE](LICENSE)를 참조하세요. 서드파티 표기는 [NOTICE](NOTICE)에 나열되어 있습니다.

---

<div align="center">

**Claude Code는 코드를 출시합니다. Get Design Done은 디자인까지 출시되도록 만듭니다.**

</div>

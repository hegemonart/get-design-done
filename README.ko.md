<div align="center">

# GET DESIGN DONE

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · **한국어** · [Français](README.fr.md) · [Italiano](README.it.md) · [Deutsch](README.de.md)

**AI 코딩 에이전트를 위한 디자인 품질 파이프라인: 브리프 → 탐색 → 계획 → 구현 → 검증.**

**Get Design Done은 AI가 생성한 UI가 브리프, 디자인 시스템, 레퍼런스, 품질 게이트에 계속 묶여 있도록 합니다. Claude Code, OpenCode, Gemini CLI, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, Cline에서 동작합니다.**

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

**macOS, Linux, Windows에서 동작합니다.**

<br>

*"AI 코딩 에이전트는 UI를 빠르게 출시합니다. Get Design Done은 그것이 디자인으로 출시되게 만듭니다."*

<br>

[왜 만들었나](#왜-만들었나) · [작동 방식](#작동-방식) · [명령](#명령) · [연결](#연결) · [왜 동작하는가](#왜-동작하는가)

</div>

---

> [!IMPORTANT]
> ### 이미 Claude Design 번들이 있나요?
>
> [claude.ai/design](https://claude.ai/design)에서 디자인을 내보냈다면 1–3단계를 건너뛸 수 있습니다:
>
> ```
> /gdd:handoff ./my-design.html
> ```
>
> 번들의 CSS 사용자 정의 속성을 D-XX 디자인 결정으로 파싱하고, Handoff Faithfulness 채점이 포함된 검증 단계를 실행하며, 선택적으로 Figma에 구현 상태를 다시 기록합니다.

---

## 왜 만들었나

저는 AI 코딩 에이전트로 출시하는 디자이너입니다. 코드 측 워크플로는 이미 성숙합니다. 스펙, 태스크, 테스트, 커밋, 리뷰 루프가 있습니다. 디자인 측은 그렇지 않았습니다.

반복적으로 마주친 문제는 이렇습니다. 에이전트는 단독으로 보면 괜찮아 보이는 화면을 만들 수 있지만, 작업 자체는 *연결되지 않습니다*. 토큰이 기존 시스템과 맞지 않습니다. 대비비가 WCAG 아래로 떨어집니다. 위계가 화면마다 새로 만들어집니다. 오래된 안티패턴이 새 컴포넌트에 들어옵니다. 그리고 출력물을 원래 브리프에 대해 검증하는 것이 없기 때문에 문제는 PR 리뷰나 핸드오프 이후에야 늦게 드러납니다.

그래서 Get Design Done을 만들었습니다. AI 코딩 에이전트에게 개발자가 엔지니어링 워크플로에서 이미 기대하는 구조를 제공하는 디자인 파이프라인입니다. 브리프를 캡처하고, 현재 디자인 시스템을 매핑하고, 결정을 레퍼런스에 정합시키고, 작업을 원자적 태스크로 분해하고, 그 태스크를 실행한 뒤 출시 전에 결과를 검증합니다.

무대 뒤에는 37개의 전문 에이전트, 쿼리 가능한 인텔 저장소, 티어 인식 모델 라우팅, 12개의 선택적 도구 연결, 원자적 커밋, solidify-with-rollback 결과에서 학습하는 no-regret 적응 레이어가 있습니다. 일상적으로 보게 되는 것은 디자인 작업의 일관성을 지켜 주는 몇 개의 `/gdd:*` 명령입니다.

— **Hegemon**

---

AI 생성 디자인은 AI 생성 코드와 같은 실패 양상을 가집니다. 원하는 것을 설명하고 그럴듯한 결과를 받지만, 출력물을 브리프에 다시 묶는 시스템이 없기 때문에 규모가 커지면 무너집니다.

Get Design Done은 디자인 작업을 위한 컨텍스트 엔지니어링 레이어입니다. "이 UI를 더 좋게 만들어 줘"를 추적 가능한 사이클로 바꿉니다: 브리프 → 인벤토리 → 레퍼런스 → 계획 → 구현 → 검증.

---

## 무엇을 얻을 수 있나

- **브리프에 기반한 디자인 작업** — 모든 사이클은 문제, 대상 사용자, 제약, 성공 지표, 필수 요구사항에서 시작합니다.
- **디자인 시스템 추출** — GDD는 변경을 계획하기 전에 토큰, 타이포그래피, 간격, 컴포넌트, 모션, 접근성, 다크 모드, 디자인 부채를 인벤토리합니다.
- **레퍼런스 기반 결정** — 에이전트는 내장 디자인 레퍼런스와 선택적 Figma, Refero, Pinterest, Storybook, Chromatic, Preview, Claude Design, paper.design, pencil.dev, Graphify, 21st.dev Magic, Magic Patterns 연결을 사용합니다.
- **원자적 실행** — 디자인 태스크는 의존성별로 분해되고, 안전한 wave로 실행되며, 독립적으로 커밋됩니다.
- **출시 전 검증** — 감사는 브리프 적합성, 토큰 통합, WCAG 대비, 컴포넌트 적합성, 모션 일관성, 다크 모드 아키텍처, 디자인 안티패턴을 확인합니다.
- **검증 실패 시 롤백** — solidify-with-rollback은 각 태스크가 남기 전에 검증합니다. 실패한 작업은 자동으로 되돌립니다.

---

## 누구를 위한 것인가

GDD는 AI 코딩 에이전트로 UI를 출시하고 첫 스크린샷을 넘어 결과가 견고하기를 원하는 엔지니어, 디자이너, 디자인 엔지니어, 창업자, 제품 빌더를 위한 것입니다.

토큰이 일치하고, 대비가 WCAG를 통과하고, 모션이 일관되고, 컴포넌트가 시스템을 따르며, 최종 구현이 여전히 요청한 내용과 맞아야 한다면 사용하세요.

디자이너일 필요는 없습니다. 파이프라인은 디자인 규율을 에이전트 워크플로에 가져옵니다. 컨텍스트를 추출하고, 빠진 결정만 질문하고, 작업을 레퍼런스에 정합시키며, 보통 너무 늦게 발견되는 문제를 먼저 잡습니다.

### v1.24.0 하이라이트 — 다중 런타임 인스톨러

- **`@clack/prompts` 인터랙티브 다중 선택** — `npx @hegemonart/get-design-done`을 플래그 없이 실행하면 14개의 지원 런타임(Claude Code, OpenCode, Gemini CLI, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, Cline)에 대한 체크박스 UI와 Global / Local 라디오가 표시됩니다.
- **멱등 + 외부 AGENTS.md 안전** — 인스톨러를 다시 실행해도 항목이 중복되지 않으며, 런타임에 작성한 지시 파일을 덮어쓰지 않습니다. 어떤 파일이든 작성 전에 확인 단계가 있습니다.
- **스크립트 CI 인터페이스 보존** — 기존의 모든 플래그(`--claude`, `--cursor`, `--all`, `--global`, `--local`, `--uninstall`, `--config-dir`)는 변경 없이 동작합니다. 인터랙티브 모드는 런타임 플래그가 전달되지 않을 때만 활성화됩니다.
- **다중 선택 제거** — 런타임 플래그 없이 `--uninstall`을 사용하면 인터랙티브 다중 선택으로 진입하여 어느 런타임에서 제거할지 고를 수 있습니다.

### 이전 릴리스

- **v1.23.5** — No-Regret 적응 레이어(Thompson 샘플링 밴딧 + AdaNormalHedge 앙상블 + MMR 재랭킹; informed-prior 부트스트랩으로 단일 사용자 가능, opt-in 텔레메트리 불필요).
- **v1.23.0** — SDK 도메인 프리미티브(solidify-with-rollback 게이트, JSON 출력 계약, `Touches:` 패턴 자동 결정화).
- **v1.22.0** — SDK 관측 가능성(약 24개 타입 이벤트, 툴 콜별 트래젝토리, 추가 전용 이벤트 체인, 시크릿 스크러버).
- **v1.21.0** — 헤드리스 SDK(Claude Code 없이 전체 파이프라인을 실행하는 `gdd-sdk` CLI, 병렬 리서처, 크로스 하니스 MCP).
- **v1.20.0** — SDK 기반(회복력 프리미티브, lockfile 안전한 `STATE.md`, 11개 타입 도구를 가진 `gdd-state` MCP 서버, TypeScript 기반).

전체 릴리스 노트는 [CHANGELOG.md](CHANGELOG.md) 참조.

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

## 시작하기

```bash
npx @hegemonart/get-design-done@latest
```

인스톨러가 다음을 묻습니다:
1. **런타임** — Claude Code, OpenCode, Gemini, Kilo, Codex, Copilot, Cursor, Windsurf, Antigravity, Augment, Trae, Qwen Code, CodeBuddy, Cline 또는 전체(인터랙티브 다중 선택)
2. **위치** — Global(모든 프로젝트) 또는 Local(현재 프로젝트만)

확인:

```
/gdd:help
```

> [!TIP]
> 마찰 없는 자동화 경험을 위해 Claude Code를 `--dangerously-skip-permissions`로 실행하는 것을 권장합니다. GDD는 자율적인 다단계 실행을 위해 설계되었습니다.

### 최신 상태 유지

GDD는 자주 출시됩니다. 인스톨러를 다시 실행하면 됩니다(멱등):

```bash
npx @hegemonart/get-design-done@latest
```

또는 Claude Code 안에서:

```
/gdd:update
```

`/gdd:update`는 적용 전에 changelog를 미리 보여 줍니다. `reference/` 아래의 로컬 수정은 보존됩니다 — 구조적 업데이트 후 다시 스티치가 필요하면 `/gdd:reapply-patches`를 실행합니다.

<details>
<summary><strong>비대화형 설치(Docker, CI, 스크립트)</strong></summary>

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

# 모든 런타임
npx @hegemonart/get-design-done --all --global

# 드라이 런(diff만 출력, 쓰지 않음)
npx @hegemonart/get-design-done --dry-run

# 사용자 정의 설정 디렉터리(Docker 등)
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

</details>

<details>
<summary><strong>대안: Claude Code CLI</strong></summary>

```bash
claude plugin marketplace add hegemonart/get-design-done
claude plugin install get-design-done@get-design-done
```

</details>


## 작동 방식

> **기존 코드베이스에서 시작하나요?** 먼저 `/gdd:map`을 실행하세요. 5개의 전문 매퍼(tokens, components, visual hierarchy, a11y, motion)가 병렬로 디스패치되어 `.design/map/`에 구조화된 JSON을 작성합니다.

### 1. Brief(브리프)

```
/gdd:brief
```

스캔이나 탐색 전에 디자인 문제를 캡처합니다. `AskUserQuestion`을 통해 한 번에 한 질문씩 — 미답변 섹션에 대해서만: 문제, 대상, 제약, 성공 지표, 범위.

**산출:** `.design/BRIEF.md`

---

### 2. Explore(탐색)

```
/gdd:explore
```

현재 코드베이스의 디자인 시스템을 인벤토리합니다 — 색상, 타이포그래피, 간격, 컴포넌트, 모션, 접근성, 다크 모드. 5개 병렬 매퍼와 `design-discussant` 인터뷰가 세 개의 산출물을 만듭니다. 연결 프로브가 12개의 외부 도구 가용성을 감지합니다.

**산출:** `.design/DESIGN.md`, `.design/DESIGN-DEBT.md`, `.design/DESIGN-CONTEXT.md`, `.design/map/{tokens,components,a11y,motion,visual-hierarchy}.{md,json}`

---

### 3. Plan(계획)

```
/gdd:plan
```

Explore 산출물을 원자적이고 웨이브로 조정되며 의존성이 분석된 디자인 태스크로 분해합니다. 각 태스크는 명시적 `Touches:` 경로, 병렬 안전 태그, 수용 기준을 가집니다. `design-planner`(opus)가 작성하고 `design-plan-checker`(haiku)가 실행 전에 게이트 체크합니다.

**산출:** `.design/DESIGN-PLAN.md`

---

### 4. Design(실행)

```
/gdd:design
```

태스크를 웨이브 순서로 실행합니다. 각 태스크는 전용 `design-executor` 에이전트를 받아 신선한 200k 컨텍스트, 원자 git 커밋, 그리고 컨텍스트 내부 규칙에 따른 자동 편차 처리를 가집니다. 병렬 안전 태스크는 worktree에서 실행됩니다.

**Solidify-with-rollback**(v1.23.0) — 모든 태스크는 잠그기 전에 검증(typecheck + build + 타깃 테스트). 검증 실패 → `git stash` 되돌리기.

**산출:** 태스크당 `.design/tasks/task-NN.md`, 태스크당 원자 git 커밋

```
┌────────────────────────────────────────────────────────────────────┐
│  WAVE 실행                                                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  WAVE 1(병렬)              WAVE 2(병렬)             WAVE 3        │
│  ┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐    ┌─────────┐ │
│  │ Task 01 │ │ Task 02 │ →  │ Task 03 │ │ Task 04 │ →  │ Task 05 │ │
│  └─────────┘ └─────────┘    └─────────┘ └─────────┘    └─────────┘ │
│       │           │              ↑           ↑              ↑      │
│       └───────────┴──────────────┴───────────┴──────────────┘      │
│              Touches: 경로가 의존성 분석을 주도                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

### 5. Verify(검증)

```
/gdd:verify
```

브리프에 대해 검증합니다 — 필수 항목, NN/g 휴리스틱, 감사 채점, 토큰 통합. 세 에이전트가 순차적으로 실행: `design-auditor`(6 기둥 1–4 채점), `design-verifier`(목표 역방향), `design-integration-checker`(D-XX 결정을 코드에 grep). 실패 시 구조화된 갭 리스트와 `design-fixer`를 통한 verify→fix 루프.

**산출:** `.design/DESIGN-VERIFICATION.md`, 문제 발견 시 갭 수정 커밋

---

### 6. Ship → Reflect → 다음 사이클

```
/gdd:ship                    # 깨끗한 PR 브랜치 생성(.design/ 커밋 필터링)
/gdd:reflect                 # design-reflector가 텔레메트리 + 학습 사항 읽음
/gdd:apply-reflections       # reflector 제안 검토 및 선택적 적용
/gdd:complete-cycle          # 사이클 산출물 아카이브 + 사이클별 EXPERIENCE.md 작성
/gdd:new-cycle               # 새 디자인 사이클 시작
```

또는 자동 라우팅:

```
/gdd:next                    # 상태 자동 감지 후 다음 단계 실행
```

각 사이클은 브리프, 스캔, 계획, 실행, 검증, 100–200줄의 사이클별 `EXPERIENCE.md`(목표 / 결정 / 학습 / 폐기 / 다음 사이클로의 핸드오프)를 가지며, 이는 decision-injector 훅의 최우선 소스가 됩니다.

---

### Fast 모드

```
/gdd:fast "<task>"
```

전체 파이프라인이 필요 없는 단일 파일의 사소한 수정. 라우터, 캐시 매니저, 텔레메트리를 건너뜁니다. 동일한 원자 커밋 보장.

```
/gdd:quick
```

GDD 보장이 필요하지만 선택적 게이트(phase-researcher, assumptions analyzer, integration-checker)는 건너뛰는 임시 태스크.

---

## 왜 동작하는가

### 컨텍스트 엔지니어링

AI 코딩 CLI는 컨텍스트를 충분히 주면 강력합니다. 대부분의 사람들은 그렇게 하지 않습니다.

GDD가 대신 처리합니다:

| 파일 | 역할 |
|------|------|
| `.design/BRIEF.md` | 사이클의 문제, 대상, 성공 지표 |
| `.design/DESIGN.md` | 현재 디자인 시스템 스냅샷(토큰, 컴포넌트, 위계) |
| `.design/DESIGN-CONTEXT.md` | D-XX 결정, 인터뷰 답변, 상하류 제약 |
| `.design/DESIGN-PLAN.md` | 원자 태스크, 웨이브 안무, 의존성 |
| `.design/DESIGN-VERIFICATION.md` | 검증 결과, 갭 리스트, Handoff Faithfulness 점수 |
| `.design/intel/` | 쿼리 가능한 지식 레이어 |
| `.design/archive/cycle-N/EXPERIENCE.md` | 사이클별 회고, 사이클 간 메모리 |
| `.design/telemetry/events.jsonl` | 단계 간 타입 이벤트 스트림 |
| `.design/telemetry/posterior.json` | 밴딧 사후분포(`adaptive_mode != static`일 때) |

Claude의 품질 저하 경계에 맞춘 사이즈 한도. 그 아래에 머무르면 일관된 우수성을 얻습니다.

### 37개의 전문 에이전트

각 단계는 얇은 오케스트레이터가 전문 에이전트를 스폰하는 패턴입니다.

| 단계 | 오케스트레이터 | 에이전트 |
|------|--------------|---------|
| Brief | 한 질문 인터뷰 | (서브에이전트 없음) |
| Explore | 5 매퍼 + discussant 스폰 | 5 병렬 매퍼, design-discussant, research-synthesizer |
| Plan | 리서처 + planner + checker 스폰 | design-phase-researcher(선택), design-planner(opus), design-plan-checker(haiku) |
| Design | 웨이브 조정 + worktree 격리 | 태스크별 design-executor, solidify 실패 시 design-fixer |
| Verify | auditor + verifier + checker 스폰 | design-auditor, design-verifier, design-integration-checker |
| Reflect | 텔레메트리 + 학습 읽기 | design-reflector(opus), design-authority-watcher, design-update-checker |

### 12개의 도구 연결

전부 선택적 — 어떤 연결이든 사용 불가일 때 파이프라인은 우아하게 폴백:

- **Figma**(읽기 + 쓰기 + Code Connect)
- **Refero** — 디자인 레퍼런스 검색
- **Pinterest** — 시각 레퍼런스
- **Claude Design** — 핸드오프 번들 임포트
- **Storybook** — 컴포넌트 사양 조회
- **Chromatic** — 비주얼 회귀 베이스라인 diff
- **Preview** — Playwright + Claude Preview MCP 런타임 스크린샷
- **paper.design** — MCP 캔버스 읽기/쓰기
- **pencil.dev** — git 추적 `.pen` 사양 파일
- **Graphify** — 지식 그래프 익스포트
- **21st.dev Magic** — greenfield 빌드 전 선례 검색
- **Magic Patterns** — DS-aware 컴포넌트 생성

### 내장 디자인 레퍼런스

플러그인은 **18개 이상의 레퍼런스 파일**을 제공합니다 — NN/g 10가지, Don Norman 감성 디자인, Dieter Rams 10원칙, Disney 12원칙(모션), Sonner / Emil Kowalski 컴포넌트 작성 렌즈, Peak-End, Loss Aversion, Cognitive Load, Aesthetic-Usability, Doherty, Flow, 35개 컴포넌트 사양, gestalt, 시각 위계, 브랜드 보이스, 161개 산업별 팔레트, 67개 UI 미학, 12개 모션 이징, 8개 트랜지션 패밀리, WCAG 2.1 AA, 플랫폼(iOS/Android/web/visionOS/watchOS), RTL/CJK, 폼 패턴, 안티패턴 카탈로그.

### 원자적 git 커밋

```
abc123f docs(08-02): complete user-card token plan
def456g feat(08-02): unify card surface tokens with --color-bg-elevated
hij789k feat(08-02): replace inline padding with --space-* scale
lmn012o test(08-02): assert card.spec passes WCAG contrast 4.5:1
```

git bisect가 정확히 실패한 태스크를 찾습니다. 각 태스크는 독립적으로 되돌릴 수 있습니다. Solidify-with-rollback이 태스크 수준 검증 게이트를 추가하여, 깨진 태스크 3이 verify 실행 전에 태스크 4–10을 오염시키지 못하도록 합니다.

### 자가 개선 루프

각 사이클 후, `design-reflector`(opus)가 `events.jsonl`, `agent-metrics.json`, `learnings/`를 읽고 diff를 제안합니다 — 티어 오버라이드, 병렬화 규칙, 레퍼런스 추가, frontmatter 업데이트. `/gdd:apply-reflections`가 적용 전에 diff를 보여 주고 묻습니다.

**No-Regret 적응 레이어**(v1.23.5)는 그 위에 Thompson 샘플링 밴딧 + AdaNormalHedge 앙상블 + MMR 재랭킹을 얹어, informed-prior 부트스트랩으로 단일 사용자에서도 동작합니다.

### 비용 거버넌스

- **`gdd-router` 스킬** — 결정론적 인텐트 → fast / quick / full 라우팅, 모델 호출 없음.
- **`gdd-cache-manager`** — Layer-B 명시적 캐시, SHA-256 입력 해시, 5분 TTL 인식.
- **`budget-enforcer` PreToolUse 훅** — `.design/budget.json`에서 티어 오버라이드, 하드 캡, 지연 스폰 게이트 강제.
- **스폰별 비용 텔레메트리** — `.design/telemetry/costs.jsonl`이 `/gdd:optimize` 권장에 공급.

목표: 품질 저하 없이 태스크당 토큰 비용 50–70% 감소.

---

## 명령

### 핵심 파이프라인

| 명령 | 작용 |
|------|------|
| `/gdd:brief` | 단계 1 — 디자인 브리프 캡처 |
| `/gdd:explore` | 단계 2 — 코드베이스 인벤토리 + 인터뷰 |
| `/gdd:plan` | 단계 3 — DESIGN-PLAN.md 생성 |
| `/gdd:design` | 단계 4 — 웨이브 단위로 실행 |
| `/gdd:verify` | 단계 5 — 브리프에 대해 검증 |
| `/gdd:ship` | 깨끗한 PR 브랜치 생성 |
| `/gdd:next` | STATE.md 기반 다음 단계 자동 라우팅 |
| `/gdd:do <text>` | 자연어 라우터 |
| `/gdd:fast <text>` | 일회성 사소한 수정, 파이프라인 없음 |
| `/gdd:quick` | GDD 보장이 있는 임시 태스크, 선택적 게이트 건너뛰기 |

### 첫 실행 + 온보딩

| 명령 | 작용 |
|------|------|
| `/gdd:start` | 첫 실행 증명 경로 — 저장소 내 디자인 이슈 상위 3개 |
| `/gdd:new-project` | GDD 프로젝트 초기화 |
| `/gdd:connections` | 12개의 외부 통합을 위한 온보딩 위저드 |

### 사이클 라이프사이클

| 명령 | 작용 |
|------|------|
| `/gdd:new-cycle` | 새 디자인 사이클 |
| `/gdd:complete-cycle` | 사이클 산출물 아카이브 + EXPERIENCE.md |
| `/gdd:pause` / `/gdd:resume` | 번호가 매겨진 체크포인트 |
| `/gdd:continue` | `/gdd:resume`의 별칭 |
| `/gdd:timeline` | 사이클 + git log 회고 |

### 반복 + 결정

| 명령 | 작용 |
|------|------|
| `/gdd:discuss [topic]` | 적응형 디자인 인터뷰 |
| `/gdd:list-assumptions` | 계획 전에 숨은 디자인 가정 노출 |
| `/gdd:sketch [idea]` | 다중 변형 HTML 목업 |
| `/gdd:spike [idea]` | 시간 제한 가능성 실험 |
| `/gdd:sketch-wrap-up` / `/gdd:spike-wrap-up` | 발견사항을 프로젝트 로컬 스킬로 패키징 |
| `/gdd:audit` | 검증 + 감사 + 리플렉터 묶음 |
| `/gdd:reflect` | 온디맨드 리플렉터 실행 |
| `/gdd:apply-reflections` | 리플렉터 제안 검토 및 선택적 적용 |

### 메모리 + 지식 레이어

| 명령 | 작용 |
|------|------|
| `/gdd:recall <query>` | FTS5 검색 |
| `/gdd:extract-learnings` | 사이클 산출물에서 패턴/결정/교훈 추출 |
| `/gdd:note <text>` | 마찰 없는 아이디어 캡처 |
| `/gdd:plant-seed <idea>` | 트리거 조건이 있는 미래 지향 아이디어 |
| `/gdd:analyze-dependencies` | 토큰 팬아웃, 컴포넌트 콜그래프, 결정 추적성 |
| `/gdd:skill-manifest` | 모든 GDD 스킬과 에이전트 나열 |
| `/gdd:graphify` | 프로젝트 지식 그래프 빌드/쿼리/diff |
| `/gdd:watch-authorities` | 디자인 권위 피드 diff |

### 연결

| 명령 | 작용 |
|------|------|
| `/gdd:figma-write` | Figma에 디자인 결정 다시 쓰기 |
| `/gdd:handoff <bundle>` | Claude Design 번들 임포트 |
| `/gdd:darkmode` | 다크 모드 구현 감사 |
| `/gdd:compare` | DESIGN.md와 DESIGN-VERIFICATION.md 차이 계산 |
| `/gdd:style <Component>` | 컴포넌트 핸드오프 문서 생성 |

### 진단 + 포렌식

| 명령 | 작용 |
|------|------|
| `/gdd:scan` | 코드베이스 디자인 시스템 인벤토리 |
| `/gdd:map` | 5 병렬 코드베이스 매퍼 |
| `/gdd:debug [desc]` | 증상 주도 디자인 조사 |
| `/gdd:health` | `.design/` 산출물 건강 보고 |
| `/gdd:progress` | 파이프라인 위치 표시 |
| `/gdd:stats` | 사이클 통계 |
| `/gdd:optimize` | 규칙 기반 비용 분석 |
| `/gdd:warm-cache` | Anthropic 캐시 사전 워밍 |

### 배포 + 업데이트

| 명령 | 작용 |
|------|------|
| `/gdd:update` | GDD 업데이트, changelog 미리 보기 |
| `/gdd:reapply-patches` | 구조 업데이트 후 로컬 수정 다시 스티치 |
| `/gdd:check-update` | 수동 업데이트 확인 |
| `/gdd:settings` | `.design/config.json` 구성 |
| `/gdd:set-profile <profile>` | 모델 프로필 전환 |
| `/gdd:undo` | 안전한 디자인 변경 되돌리기 |
| `/gdd:pr-branch` | 깨끗한 PR 브랜치 |

### 백로그 + 노트

| 명령 | 작용 |
|------|------|
| `/gdd:todo` | 디자인 태스크 추가/나열/선택 |
| `/gdd:add-backlog <idea>` | 미래 사이클을 위한 디자인 아이디어 보관 |
| `/gdd:review-backlog` | 보관 항목 검토 |

### 도움

| 명령 | 작용 |
|------|------|
| `/gdd:help` | 전체 명령 목록과 사용법 |
| `/gdd:bandit-reset` | Anthropic 모델 출시 시 적응 레이어 사후분포 리셋 |

---

## 연결

GDD는 12개의 도구 연결을 제공합니다. 모두 선택 사항. `/gdd:connections`로 구성합니다.

| 연결 | 목적 | 프로브 |
|------|------|--------|
| **Figma** | 토큰/컴포넌트/스크린샷 읽기, 주석/Code Connect/구현 상태 쓰기 | `mcp__figma__get_metadata` + `use_figma` |
| **Refero** | 디자인 레퍼런스 검색 | `mcp__refero__search` |
| **Pinterest** | 브랜드 + 스타일 비주얼 레퍼런스 | OAuth + MCP |
| **Claude Design** | 핸드오프 번들 임포트 | URL 또는 로컬 파일 |
| **Storybook** | 6006 포트 컴포넌트 사양 조회 | HTTP 프로브 |
| **Chromatic** | 비주얼 회귀 베이스라인 diff | API 키 |
| **Preview** | Playwright + Claude Preview MCP | `mcp__Claude_Preview__preview_*` |
| **paper.design** | MCP 캔버스 읽기/쓰기 | `mcp__paper__use_paper` |
| **pencil.dev** | git 추적 `.pen` 사양 | 저장소 내 `.pen` 파일 |
| **Graphify** | 지식 그래프 익스포트 | `mcp__graphify__*` |
| **21st.dev Magic** | greenfield 전 선례 검색 | `mcp__magic__search` |
| **Magic Patterns** | DS-aware 컴포넌트 생성 | `mcp__magic-patterns__generate` |

전체 연결 세부 정보는 [`connections/connections.md`](connections/connections.md) 참조.

---

## 구성

GDD는 프로젝트 설정을 `.design/config.json`에 저장합니다. `/gdd:new-project` 동안 구성하거나 `/gdd:settings`로 업데이트.

### 모델 프로필

| 프로필 | 계획 | 실행 | 검증 |
|--------|------|------|------|
| `quality` | Opus | Opus | Sonnet |
| `balanced`(기본) | Opus | Sonnet | Sonnet |
| `budget` | Sonnet | Sonnet | Haiku |
| `inherit` | Inherit | Inherit | Inherit |

```
/gdd:set-profile budget
```

### 적응 모드

`.design/budget.json#adaptive_mode` 사다리(v1.23.5):

| 모드 | 작용 |
|------|------|
| `static`(기본) | Phase 10.1 동작 |
| `hedge` | AdaNormalHedge 앙상블 + MMR 재랭킹 활성화. 가장 안전한 입문. |
| `full` | 밴딧 라우터 + Hedge + MMR 모두 활성 |

### 병렬 처리

| 설정 | 기본 | 제어 |
|------|------|------|
| `parallelism.enabled` | `true` | worktree에서 독립적 태스크 실행 |
| `parallelism.min_estimated_savings_seconds` | `30` | 이 임계 아래에서는 병렬화 건너뛰기 |
| `parallelism.max_concurrent_workers` | `4` | 동시 worker 하드 캡 |

### 품질 게이트

| 설정 | 기본 | 제어 |
|------|------|------|
| `solidify.rollback_mode` | `"stash"` | `stash` / `hard` / `none` |
| `solidify.commands` | 자동 감지 | typecheck / build / test 명령 재정의 |
| `verify.iterations_max` | `3` | verify→fix 루프 상한 |
| `connection.figma_writeback` | `proposal` | `proposal` / `auto` |

---

## 보안

### 내장 강화

GDD는 Phase 14.5부터 심층 방어를 제공합니다:

- **`hooks/gdd-bash-guard.js`** — PreToolUse:Bash가 약 50개의 위험 패턴 차단(`rm -rf /`, `chmod 777`, `curl | sh`, `git reset --hard`, fork 폭탄), Unicode NFKC + ANSI 정규화 후.
- **`hooks/gdd-protected-paths.js`** — PreToolUse:Edit/Write/Bash가 `protected_paths` glob 리스트 강제.
- **`hooks/gdd-read-injection-scanner.ts`** — 인바운드 Read 콘텐츠에서 보이지 않는 Unicode, HTML 코멘트, 시크릿 유출 패턴 스캔.
- **`scripts/lib/blast-radius.cjs`** — `design-executor` 사전 점검이 `max_files_per_task: 10` / `max_lines_per_task: 400`을 초과하는 태스크 거부.
- **`hooks/gdd-mcp-circuit-breaker.js`** — `use_figma` / `use_paper` / `use_pencil`에서 연속 타임아웃 루프 차단.

### 민감 파일 보호

런타임의 deny 리스트에 민감 경로 추가:

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
> GDD가 LLM 시스템 프롬프트가 되는 마크다운 파일을 생성하기 때문에, `.design/` 산출물로 흘러들어가는 사용자 제어 텍스트는 잠재적인 간접 프롬프트 인젝션 벡터입니다. 인젝션 스캐너가 여러 레이어에서 잡지만, 심층 방어가 모범 사례입니다.

---

## 문제 해결

**설치 후 명령을 찾을 수 없나요?**
- 런타임 재시작
- `~/.claude/skills/get-design-done/`(전역) 또는 `./.claude/skills/get-design-done/`(로컬) 확인
- `/gdd:help`로 등록 확인

**파이프라인이 단계 중간에 멈추나요?**
- `/gdd:resume` — 가장 최근 번호 체크포인트에서 복원
- `/gdd:health` — `.design/` 산출물 문제 진단
- `/gdd:progress --forensic` — 6 점검 무결성 감사

**비용 초과?**
- `/gdd:optimize` — 규칙 기반 권장
- `/gdd:set-profile budget` — 예산 티어로 전환
- `.design/budget.json`에서 `adaptive_mode: "full"` 설정 — 밴딧이 5–10 사이클 안에 학습

**최신 버전으로 업데이트?**
```bash
npx @hegemonart/get-design-done@latest
```

**Docker / 컨테이너?**

```bash
CLAUDE_CONFIG_DIR=/workspace/.claude npx @hegemonart/get-design-done
```

### 제거

```bash
# 전역 제거(런타임별)
npx @hegemonart/get-design-done --claude --global --uninstall
npx @hegemonart/get-design-done --opencode --global --uninstall
# ... 14개 런타임에 대해 동일한 --<runtime> --global --uninstall 패턴

# 다중 선택 인터랙티브 제거(런타임 플래그 없이)
npx @hegemonart/get-design-done --uninstall

# 로컬 제거
npx @hegemonart/get-design-done --claude --local --uninstall
# ... --local 플래그
```

다른 구성을 보존하면서 모든 GDD 명령, 에이전트, 훅, 설정을 제거합니다.

---

## 라이선스

MIT 라이선스. 자세한 내용은 [LICENSE](LICENSE) 참조.

---

<div align="center">

**Claude Code는 코드를 출시합니다. Get Design Done은 디자인까지 출시되도록 만듭니다.**

</div>

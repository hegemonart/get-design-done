// AUTO-GENERATED from reference/schemas/*.schema.json — DO NOT EDIT.
// Regenerate: npm run codegen:schemas
/* eslint-disable */
// ---- authority-snapshot.schema.json ----
/**
 * Structure of .design/authority-snapshot.json produced by agents/design-authority-watcher.md. See .planning/phases/13.2-external-authority-watcher/13.2-CONTEXT.md §D-12.
 */
export interface AuthoritySnapshot {
  version: 1;
  generated_at: string;
  feeds: {
    [k: string]: FeedState;
  };
}
export interface FeedState {
  last_fetched_at: string;
  etag?: string;
  /**
   * @maxItems 200
   */
  entries: Entry[];
}
export interface Entry {
  id: string;
  hash: string;
}

export type AuthoritySnapshotSchema = AuthoritySnapshot;

// ---- budget.schema.json ----
/**
 * Shape of .design/budget.json — the Phase 10.1 optimization-layer budget governance file. Consumed by hooks/budget-enforcer.ts on every PreToolUse:Agent spawn. Bootstrap writes the Default Config from reference/config-schema.md if the file is missing.
 */
export interface DesignBudgetJson {
  /**
   * Hard ceiling per agent spawn (USD). Breach under enforcement_mode=enforce triggers D-02 block.
   */
  per_task_cap_usd?: number;
  /**
   * Cumulative ceiling across all spawns within the current phase (USD). Read from .design/STATE.md frontmatter `phase:` field.
   */
  per_phase_cap_usd?: number;
  /**
   * Per-agent tier override map (agent-name -> tier). Wins over agent frontmatter default-tier per D-04.
   */
  tier_overrides?: {
    [k: string]: 'haiku' | 'sonnet' | 'opus';
  };
  /**
   * When true, hook silently rewrites tier -> haiku at 80% of per_task_cap_usd per D-03; logged as tier_downgraded: true in telemetry.
   */
  auto_downgrade_on_cap?: boolean;
  /**
   * TTL (seconds) driving .design/cache-manifest.json entry expiry per D-08 Layer B. Default 3600.
   */
  cache_ttl_seconds?: number;
  /**
   * D-11 enforcement policy. enforce = block + auto-downgrade; warn = print warnings but allow spawn; log = advisory-only telemetry without gating.
   */
  enforcement_mode?: 'enforce' | 'warn' | 'log';
  /**
   * Phase 39.2 D-04 — project-level hard cap (USD) across the whole project's costs.jsonl. 0 or absent = DISABLED (no project-level enforcement; zero behavior change for existing users). When > 0, hooks/budget-enforcer.ts warns at 50% + 80% of this cap and (under project_cap_enforcement_mode=enforce) hard-halts the next PreToolUse:Agent spawn at 100%. Distinct from per_task_cap_usd / per_phase_cap_usd.
   */
  project_cap_usd?: number;
  /**
   * Phase 39.2 D-04 — enforcement policy for project_cap_usd specifically. enforce = hard-halt at 100%; warn = print at 100% but allow; log = advisory telemetry only. Falls back to enforcement_mode when absent.
   */
  project_cap_enforcement_mode?: 'enforce' | 'warn' | 'log';
  [k: string]: unknown;
}

export type BudgetSchema = DesignBudgetJson;

// ---- config.schema.json ----
/**
 * Shape of .design/config.json — model profile and parallelism settings per reference/config-schema.md.
 */
export interface DesignConfigJson {
  model_profile?: 'quality' | 'balanced' | 'budget';
  parallelism?: {
    enabled?: boolean;
    max_parallel_agents?: number;
    min_tasks_to_parallelize?: number;
    min_estimated_savings_seconds?: number;
    require_disjoint_touches?: boolean;
    worktree_isolation?: boolean;
    per_stage_override?: {
      [k: string]: {
        enabled?: boolean;
        max_parallel_agents?: number;
        min_tasks_to_parallelize?: number;
        min_estimated_savings_seconds?: number;
        require_disjoint_touches?: boolean;
        worktree_isolation?: boolean;
        [k: string]: unknown;
      };
    };
    [k: string]: unknown;
  };
  /**
   * Latest plugin tag (e.g. "v1.0.7.3") whose update nudge the user has dismissed. Set by /gdd:check-update --dismiss and by hooks/update-check.sh on the --dismiss code path. When a newer tag ships, the nudge reappears.
   */
  update_dismissed?: string;
  /**
   * Phase 40.5 CLI locale override for GDD's own --help, error messages, and skill prompt headers. Set via /gdd:locale <code>. Precedence: this key > env LANG/LC_ALL > en. Missing message keys fall back to English per scripts/lib/i18n/index.cjs (locale -> base -> en). en + ru are complete; uk/de/fr/zh/ja are placeholders that fall back to English.
   */
  locale?: 'en' | 'ru' | 'uk' | 'de' | 'fr' | 'zh' | 'ja';
  /**
   * Phase 40 sectional handoff. designer = Brief + Explore only; dev = Plan + Design + Verify; full = all stages (default). scripts/lib/collab/cycle-mode.cjs gates STATE writes by stage so a designer and a dev can hand a cycle back and forth without overwriting each other's sections.
   */
  gdd_cycle_mode?: 'designer' | 'dev' | 'full';
  /**
   * Phase 40 per-section write permissions (scripts/lib/collab/permissions.cjs). Permissive by default (absent = everyone is owner). A team narrows it, e.g. only @lead-designer may lock decisions. A CI gate enforces on PRs.
   */
  permissions?: {
    /**
     * Role for any actor not listed in `actors`. Default owner.
     */
    default?: 'owner' | 'contributor' | 'reviewer' | 'viewer';
    /**
     * Per-actor role map (git user/handle -> role).
     */
    actors?: {
      [k: string]: 'owner' | 'contributor' | 'reviewer' | 'viewer';
    };
    /**
     * Restrictive rules: a (section, action) is limited to the listed roles. No matching rule = allowed (permissive).
     */
    rules?: {
      /**
       * STATE.md section (decisions/prototyping/rollout_status/status/progress/blockers) or '*'.
       */
      section?: string;
      action?: 'write' | 'lock' | 'unlock' | 'approve' | '*';
      roles?: ('owner' | 'contributor' | 'reviewer' | 'viewer')[];
      [k: string]: unknown;
    }[];
    [k: string]: unknown;
  };
  /**
   * Phase 40 team-collaboration settings.
   */
  collab?: {
    /**
     * When true, the gdd-state advisory lock uses the team-mode policy (longer wait + backoff) via scripts/lib/collab/lock-policy.cjs. Default false (single-process).
     */
    multi_writer_enabled?: boolean;
    /**
     * Override the team-mode lock acquire maxWaitMs (default 30000).
     */
    lock_timeout_ms?: number;
    /**
     * Cross-machine .design/ sync backend (scripts/lib/collab/sync-backend.cjs). Default git (existing push/pull). s3 / git-lfs are opt-in declarations; a live client is not bundled this phase.
     */
    sync_backend?: 'git' | 's3' | 'git-lfs';
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export type ConfigSchema = DesignConfigJson;

// ---- design-context.schema.json ----
/**
 * The canonical typed knowledge graph of a design system, persisted at .design/context-graph.json. Nodes are design entities (tokens, components, screens, patterns); edges are typed relationships between them (uses-token, composes, transitions-to). Built by a two-phase mapper: a deterministic extract pass emits node/edge skeletons, then an LLM summary pass fills each node summary. Validated structurally by scripts/validate-design-context.cjs and queried by scripts/lib/design-context-query.cjs.
 */
export interface DesignContextGraph {
  /**
   * Schema version of this graph document (e.g. "52.0").
   */
  schema_version: string;
  /**
   * ISO-8601 timestamp the graph was last assembled (optional).
   */
  generated_at?: string;
  /**
   * All design entities in the graph. Node ids must be unique.
   */
  nodes: Node[];
  /**
   * All typed relationships. Every source/target must resolve to a node id.
   */
  edges: Edge[];
  [k: string]: unknown;
}
export interface Node {
  /**
   * Stable unique identifier for the node (referenced by edge source/target).
   */
  id: string;
  /**
   * The kind of design entity this node represents.
   */
  type:
    | 'token'
    | 'component'
    | 'variant'
    | 'state'
    | 'motion-fragment'
    | 'a11y-pattern'
    | 'screen'
    | 'layer'
    | 'pattern'
    | 'anti-pattern';
  /**
   * Human-readable name of the entity.
   */
  name: string;
  /**
   * One-line LLM-authored description of what the entity is and does. A stub summary (empty or identical to name) is flagged by the validator as a soft warning.
   */
  summary: string;
  /**
   * Controlled-vocabulary tags grouping the node by concern (see reference/design-context-tag-vocab.md). Unknown tags are a soft warning, not a hard error.
   */
  tags?: string[];
  /**
   * Coarse complexity bucket for the entity.
   */
  complexity: 'simple' | 'moderate' | 'complex';
  /**
   * Optional finer classification. For token nodes one of color/spacing/typography/radius/shadow; for layer nodes one of Atomic/Molecular/Organism/Template. Free-form for other node types.
   */
  subtype?: string;
  [k: string]: unknown;
}
export interface Edge {
  /**
   * Node id the edge originates from.
   */
  source: string;
  /**
   * Node id the edge points to.
   */
  target: string;
  /**
   * The kind of relationship between source and target.
   */
  type:
    | 'uses-token'
    | 'composes'
    | 'extends'
    | 'transitions-to'
    | 'depends-on'
    | 'mirrors'
    | 'conflicts-with'
    | 'referenced-by'
    | 'tested-by'
    | 'documented-by'
    | 'consumes-context'
    | 'provides-context';
  /**
   * Whether the relationship reads source-to-target (forward), target-to-source (backward), or both ways (bidirectional).
   */
  direction: 'forward' | 'backward' | 'bidirectional';
  /**
   * Relationship strength in the inclusive range 0..1.
   */
  weight: number;
  [k: string]: unknown;
}

export type DesignContextSchema = DesignContextGraph;

// ---- events.schema.json ----
/**
 * One line of .design/telemetry/events.jsonl — the append-only telemetry stream produced by Plan 20-06. Each event is a single JSON object followed by a newline. See .planning/phases/20-gdd-sdk-foundation/20-06-PLAN.md.
 */
export type Event = {
  [k: string]: unknown;
} & {
  /**
   * Free-form event type identifier. Pre-registered seeds: state.mutation, state.transition, stage.entered, stage.exited, hook.fired, error, capability_gap, kfm-candidate, router_pick, verify_outcome, rollout_started, rollout_advanced, rollout_stuck, budget_forecast, project_cap_warning, project_cap_halt, live_session_start, live_pick, live_generate, live_accept, live_discard, live_session_end, instinct_emitted, instinct_promoted, instinct_decayed, risk_assessment.
   */
  type: string;
  /**
   * ISO-8601 timestamp of event emission.
   */
  timestamp: string;
  /**
   * Stable identifier per GDD pipeline run; correlates events across stages.
   */
  sessionId: string;
  /**
   * Optional — present when the event is scoped to a pipeline stage.
   */
  stage?: 'brief' | 'explore' | 'plan' | 'design' | 'verify';
  /**
   * Optional — present when the event is scoped to a cycle identifier.
   */
  cycle?: string;
  /**
   * Event-type-specific payload. Opaque at the envelope level. When type === 'capability_gap', the payload is narrowed by the conditional schema in allOf[0] to the 7-field CapabilityGapPayload (Phase 29 D-02).
   */
  payload: {};
  /**
   * Writer-injected provenance. Never set by callers.
   */
  _meta?: {
    pid: number;
    host: string;
    source: string;
  };
  /**
   * Writer-set flag indicating the payload exceeded maxLineBytes and has been replaced by a placeholder.
   */
  _truncated?: boolean;
};

export type EventsSchema = Event;

// ---- hooks.schema.json ----
/**
 * Shape of hooks/hooks.json — event-triggered commands registered by the plugin.
 */
export interface ClaudeHooksJson {
  hooks: {
    SessionStart?: HookGroup[];
    SessionEnd?: HookGroup[];
    PreToolUse?: HookGroup[];
    PostToolUse?: HookGroup[];
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
export interface HookGroup {
  matcher?: string;
  hooks: {
    type: 'command';
    command: string;
    [k: string]: unknown;
  }[];
  [k: string]: unknown;
}

export type HooksSchema = ClaudeHooksJson;

// ---- insight-line.schema.json ----
/**
 * One JSONL line appended by an agent to .design/intel/insights.jsonl at run-end.
 */
export interface AgentInsightLine {
  /**
   * ISO 8601 timestamp of the agent run completion.
   */
  ts: string;
  /**
   * Agent name matching the frontmatter 'name' field (e.g. 'design-planner').
   */
  agent: string;
  /**
   * Active cycle ID from STATE.md (e.g. 'cycle-1'). Empty string if not in a cycle.
   */
  cycle: string;
  /**
   * Pipeline stage from STATE.md (e.g. 'plan', 'design', 'verify').
   */
  stage: string;
  /**
   * One declarative sentence: what this agent produced or learned this run.
   */
  one_line_insight: string;
  /**
   * Relative paths of files written during this run. Empty array for read-only agents.
   */
  artifacts_written: string[];
}

export type InsightLineSchema = AgentInsightLine;

// ---- instinct.schema.json ----
/**
 * An atomic, confidence-weighted design instinct learned across cycles. Validates the YAML frontmatter object of an instinct unit (see reference/instinct-format.md). Project-scoped units live at <root>/instincts/instincts.json; promoted global units live at ~/.claude/gdd/global-instincts.json. Persisted + queried by scripts/lib/instinct-store.cjs.
 */
export type InstinctUnit = {
  [k: string]: unknown;
} & {
  /**
   * Kebab-case stable identifier, e.g. "prefer-token-over-hex". Lowercase letters, digits, single hyphens.
   */
  id: string;
  /**
   * One sentence naming the situation that fires the instinct, e.g. "When a color literal appears in a component, reach for a design token first."
   */
  trigger: string;
  /**
   * Posterior trust in the instinct. Floor 0.3 (a fresh instinct is advisory, never directive); ceiling 0.9 (no instinct is ever certain). TTL decay multiplies this by 0.9 when the instinct goes unsurfaced.
   */
  confidence: number;
  /**
   * Lifecycle stage the instinct applies to, aligned to the Phase 50 lifecycle stages.
   */
  domain: 'intake' | 'explore' | 'decide' | 'build' | 'verify' | 'operate' | 'utility';
  /**
   * project = learned from one repository; global = promoted after the K/M gate across distinct projects.
   */
  scope: 'project' | 'global';
  /**
   * 8-char hex sha of the normalized git origin the instinct was first learned from. Required for project scope; optional for global (a promoted instinct is no longer tied to one origin).
   */
  project_id?: string;
  /**
   * Which producer minted the instinct: a reflection pass, the extract-learnings step, or a direct user assertion.
   */
  source: 'reflection' | 'extract-learnings' | 'user';
  /**
   * How many distinct design cycles have surfaced this instinct. Feeds the K=2 half of the promotion gate.
   */
  cycles_seen?: number;
  /**
   * Set of distinct project ids that have surfaced this instinct. Its length feeds the M=2 half of the promotion gate.
   */
  project_ids?: string[];
  /**
   * ISO date (YYYY-MM-DD) the instinct was first recorded.
   */
  first_seen?: string;
  /**
   * ISO date (YYYY-MM-DD) the instinct was last surfaced. Resets the TTL decay window.
   */
  last_seen?: string;
  /**
   * Beta posterior success weight. Seeded from the Beta(2,8) prior on promotion.
   */
  alpha?: number;
  /**
   * Beta posterior failure weight. Seeded from the Beta(2,8) prior on promotion.
   */
  beta?: number;
  /**
   * Tag recording which prior class seeded the posterior, e.g. "instinct".
   */
  prior_class?: string;
};

export type InstinctSchema = InstinctUnit;

// ---- intel.schema.json ----
/**
 * Shape of intel-store slice files per reference/intel-schema.md. Each slice has a generated timestamp and one array-valued payload key matching the slice name.
 */
export interface DesignIntelJson {
  generated: string;
  git_hash?: string;
  files?: {
    path: string;
    type: 'skill' | 'agent' | 'reference' | 'connection' | 'script' | 'hook' | 'config' | 'test' | 'other';
    mtime?: string;
    size_bytes?: number;
    git_hash?: string;
    [k: string]: unknown;
  }[];
  exports?: {
    file: string;
    kind: 'skill' | 'agent' | 'reference' | 'other';
    name: string;
    command?: string;
    [k: string]: unknown;
  }[];
  symbols?: {
    file: string;
    heading: string;
    level?: number;
    anchor?: string;
    line?: number;
    [k: string]: unknown;
  }[];
  tokens?: {
    file: string;
    token: string;
    category?: 'color' | 'spacing' | 'typography' | 'radius' | 'shadow' | 'motion' | 'other';
    line?: number;
    context?: string;
    [k: string]: unknown;
  }[];
  components?: {
    file: string;
    component: string;
    role?: 'definition' | 'reference' | 'example';
    line?: number;
    [k: string]: unknown;
  }[];
  patterns?: {
    name: string;
    category?:
      | 'color-system'
      | 'spacing-system'
      | 'typography-system'
      | 'component-styling'
      | 'layout'
      | 'interaction'
      | 'other';
    source_file?: string;
    description?: string;
    [k: string]: unknown;
  }[];
  dependencies?: {
    from: string;
    to: string;
    kind?: 'at-reference' | 'reads-from' | 'skill-calls-agent' | 'agent-calls-agent';
    line?: number;
    [k: string]: unknown;
  }[];
  decisions?: {
    id: string;
    summary: string;
    source_file?: string;
    line?: number;
    date?: string;
    [k: string]: unknown;
  }[];
  debt?: {
    id: string;
    summary: string;
    severity?: 'high' | 'medium' | 'low';
    source_file?: string;
    line?: number;
    [k: string]: unknown;
  }[];
  nodes?: {
    id: string;
    type?: string;
    name?: string;
    [k: string]: unknown;
  }[];
  edges?: {
    from: string;
    to: string;
    kind?: string;
    [k: string]: unknown;
  }[];
  [k: string]: unknown;
}

export type IntelSchema = DesignIntelJson;

// ---- iteration-budget.schema.json ----
/**
 * Shape of .design/iteration-budget.json produced by scripts/lib/iteration-budget.cjs. Caps the number of fix-loop iterations that can consume context before the pipeline halts for user input. All mutations are coordinated by scripts/lib/lockfile.cjs and written via temp+rename. See .planning/phases/20-gdd-sdk-foundation/20-14-PLAN.md §Task 4.
 */
export interface IterationBudget {
  /**
   * The configured ceiling. Initialized by reset(). `remaining` never exceeds this value after refund().
   */
  budget: number;
  /**
   * Iterations still available for consume() calls. Starts at `budget`, drops on consume, climbs (capped at `budget`) on refund.
   */
  remaining: number;
  /**
   * Running total of successful consume() calls since last reset().
   */
  consumed: number;
  /**
   * Running total of refund amount since last reset() (useful for auditing the cache-hit refund path from budget-enforcer.ts).
   */
  refunded: number;
  /**
   * ISO-8601 timestamp of the last mutation.
   */
  updatedAt: string;
}

export type IterationBudgetSchema = IterationBudget;

// ---- live-session.schema.json ----
/**
 * A single `/gdd:live` session record persisted at .design/live-sessions/<session-id>.json. Captures the pick -> generate -> accept/discard loop as an append-only event log so a session survives a crash or --resume. Written atomically by scripts/lib/live/session-store.cjs.
 */
export interface LiveSession {
  /**
   * Schema version of this session record (e.g. "47.0").
   */
  schema_version: string;
  /**
   * Stable id; also the basename of the on-disk file (no path separators).
   */
  session_id: string;
  /**
   * Lifecycle status. Only in_progress sessions are resumable.
   */
  status: 'in_progress' | 'completed' | 'abandoned';
  /**
   * ISO-8601 timestamp the session was created.
   */
  started_at: string;
  /**
   * ISO-8601 timestamp the session was closed; null while in_progress.
   */
  ended_at: string | null;
  /**
   * The page the element was picked from (optional).
   */
  url?: string;
  /**
   * Dev-server descriptor (url/port/command, or a plain string). Free-form by design.
   */
  dev_server?: string | {} | null;
  /**
   * Append-only log of session events, oldest first.
   */
  events: {
    /**
     * Event kind.
     */
    kind: 'pick' | 'generate' | 'accept' | 'discard';
    /**
     * ISO-8601 timestamp the event was recorded.
     */
    at: string;
    [k: string]: unknown;
  }[];
}

export type LiveSessionSchema = LiveSession;

// ---- marketplace.schema.json ----
/**
 * Shape of .claude-plugin/marketplace.json — the plugin marketplace descriptor.
 */
export interface ClaudeMarketplaceJson {
  name: string;
  owner: {
    name: string;
    [k: string]: unknown;
  };
  metadata: {
    description: string;
    version: string;
    [k: string]: unknown;
  };
  plugins: {
    name: string;
    source: string;
    description: string;
    version: string;
    author: {
      name: string;
      [k: string]: unknown;
    };
    homepage?: string;
    repository: string;
    license: string;
    category: string;
    keywords: string[];
    [k: string]: unknown;
  }[];
  [k: string]: unknown;
}

export type MarketplaceSchema = ClaudeMarketplaceJson;

// ---- mcp-budget.schema.json ----
/**
 * Thresholds for the MCP circuit-breaker hook. Applies to use_figma / use_paper / use_pencil and any tracked_tools entry the user extends.
 */
export interface MCPBudget {
  $schema?: string;
  version: 1;
  description?: string;
  max_calls_per_task: number;
  max_consecutive_timeouts: number;
  reset_on_success?: boolean;
  tracked_tools?: string[];
}

export type McpBudgetSchema = MCPBudget;

// ---- mcp-gdd-state-tools.schema.json ----
/**
 * Combined manifest of all 11 gdd-state MCP tool input+output schemas (Plan 20-05). Individual tool schemas live under sdk/mcp/gdd-state/schemas/ and the tool handlers reference them; this combined schema exists so downstream validators and codegen can compile a single surface.
 */
export interface McpGddStateTools {
  tools: {
    gdd_state__get: ToolSchemaEntry;
    gdd_state__update_progress: ToolSchemaEntry;
    gdd_state__transition_stage: ToolSchemaEntry;
    gdd_state__add_blocker: ToolSchemaEntry;
    gdd_state__resolve_blocker: ToolSchemaEntry;
    gdd_state__add_decision: ToolSchemaEntry;
    gdd_state__add_must_have: ToolSchemaEntry;
    gdd_state__set_status: ToolSchemaEntry;
    gdd_state__checkpoint: ToolSchemaEntry;
    gdd_state__probe_connections: ToolSchemaEntry;
    gdd_state__frontmatter_update: ToolSchemaEntry;
  };
}
export interface ToolSchemaEntry {
  /**
   * JSON Schema fragment describing the tool's input parameters.
   */
  input: {};
  /**
   * JSON Schema fragment describing the tool's response envelope.
   */
  output: {
    type: 'object';
  };
}

export type McpGddStateToolsSchema = McpGddStateTools;

// ---- mcp-gdd-tools.schema.json ----
/**
 * Combined manifest of all gdd-mcp tool input+output schemas (Plan 27.7-02). Individual tool schemas live under sdk/mcp/gdd-mcp/schemas/ and the tool handlers reference them; this combined schema exists so downstream validators and codegen can compile a single surface (D-11).
 */
export interface McpGddTools {
  /**
   * Per-tool input/output schemas keyed by tool name. Exactly 13 entries (D-03 cap, raised 12 -> 13 in Phase 52 for gdd_context_query).
   */
  tools?: {
    gdd_status?: {
      input: {};
      output: {
        phase: string | null;
        branch: string | null;
        last_decisions: {}[];
        last_completed_plans: {}[];
        blocker_count: number;
      };
    };
    gdd_context_query?: {
      input: {
        op: 'nodes' | 'edges' | 'path' | 'consumers-of' | 'unreachable' | 'cycles' | 'coverage';
        type?: string;
        tag?: string;
        from?: string;
        to?: string;
        id?: string;
      };
      output: {
        op: string;
        graph_present: boolean;
        path?: string;
        result: unknown[] | {} | null;
      };
    };
    gdd_phase_current?: {
      input: {};
      output: {
        phase: string | null;
        stage: string | null;
        task_progress: string | null;
        status: string | null;
      };
    };
    gdd_phases_list?: {
      input: {};
      output: {
        phases: {
          number: string;
          name: string;
          version: string;
          checkbox_status: 'shipped' | 'planned' | 'unknown';
        }[];
      };
    };
    gdd_plans_list?: {
      input: {
        phase?: string;
      };
      output: {
        phase: string | null;
        plans: {
          id: string;
          name: string;
          status: string;
        }[];
      };
    };
    gdd_decisions_list?: {
      input: {
        status?: 'locked' | 'tentative';
      };
      output: {
        decisions: {
          id: string;
          text: string;
          status: string;
        }[];
      };
    };
    gdd_intel_get?: {
      input: {
        slice_id: string;
        shape?: string[];
      };
      output: {
        slice_id: string;
        data: {};
      };
    };
    gdd_telemetry_query?: {
      input: {
        type?: string;
        since?: string;
        limit?: number;
      };
      output: {
        events: {}[];
      };
    };
    gdd_cycle_recap?: {
      input: {
        since_snapshot?: string;
      };
      output: {
        since: string | null;
        diff: {
          state_sections: string[];
          decisions_delta: number;
          completed_plans_delta: number;
        };
      };
    };
    gdd_reflections_latest?: {
      input: {};
      output: {
        cycle: string | null;
        path: string | null;
        content_excerpt: string;
      };
    };
    gdd_learnings_digest?: {
      input: {
        cycles?: number;
      };
      output: {
        digest: string;
        cycles_included: number;
      };
    };
    gdd_events_tail?: {
      input: {
        type?: string;
        limit?: number;
      };
      output: {
        events: {}[];
      };
    };
    gdd_health?: {
      input: {};
      output: {
        checks: {
          name: string;
          status: 'ok' | 'warn' | 'fail';
          detail: string;
        }[];
      };
    };
  };
}

export type McpGddToolsSchema = McpGddTools;

// ---- plugin.schema.json ----
/**
 * Shape of .claude-plugin/plugin.json — the plugin manifest consumed by Claude Code.
 */
export interface ClaudePluginJson {
  name: string;
  short_name: string;
  version: string;
  description: string;
  author: {
    name: string;
    url?: string;
    [k: string]: unknown;
  };
  homepage?: string;
  repository: string;
  license: string;
  keywords: string[];
  skills: string[];
  hooks?: string;
  [k: string]: unknown;
}

export type PluginSchema = ClaudePluginJson;

// ---- pressure-scenario.schema.json ----
/**
 * Contract for a Phase-33 skill-behavior pressure-scenario manifest. The runner (scripts/lib/skill-behavior/runner.cjs) loads manifests conforming to this schema, spawns a subagent against `setup_prompt` under the named `pressures`, and validates the response against the `expected_compliance` / `expected_violations` regex sources (compiled with new RegExp(source)). The 5-value `pressures` enum and the required-field set come verbatim from ROADMAP Phase-33 SC#2.
 */
export interface PressureScenarioManifest {
  /**
   * Unique scenario identifier, e.g. "brief-time-pressure".
   */
  name: string;
  /**
   * The skill under test, e.g. "brief", "explore", "plan", "using-gdd".
   */
  target_skill: string;
  /**
   * One or more pressure vectors applied in the setup_prompt.
   *
   * @minItems 1
   */
  pressures: [
    'time' | 'sunk-cost' | 'authority' | 'exhaustion' | 'scope-minimization',
    ...('time' | 'sunk-cost' | 'authority' | 'exhaustion' | 'scope-minimization')[],
  ];
  /**
   * The prompt handed to the subagent — embeds the pressure(s) and asks it to act.
   */
  setup_prompt: string;
  /**
   * Regex SOURCE strings the response MUST match to count as compliant (the runner compiles each with new RegExp(source)).
   *
   * @minItems 1
   */
  expected_compliance: [string, ...string[]];
  /**
   * Regex SOURCE strings that, if matched, count as a violation (the runner compiles each with new RegExp(source)). May be empty.
   */
  expected_violations: string[];
  /**
   * Optional free-text scenario note (33-03 baselines reference it).
   */
  description?: string;
  /**
   * Optional A/B variant label, e.g. "trigger-only" | "what-clause" (33-04 description-format A/B).
   */
  variant?: string;
  /**
   * Optional array of A/B variant descriptors for a single-manifest A/B pair (33-04). Each item is an object, e.g. { label, description }.
   */
  variants?: {}[];
  /**
   * Optional body-only probe prompt the A/B scenario asks (33-04 description-format A/B).
   */
  body_probe?: string;
}

export type PressureScenarioSchema = PressureScenarioManifest;

// ---- protected-paths.schema.json ----
/**
 * Glob list describing paths the plugin refuses to Edit/Write or mutate via destructive Bash. User additions MERGE with this default list; users cannot reduce the default set.
 */
export interface ProtectedPaths {
  $schema?: string;
  version: 1;
  description?: string;
  /**
   * @minItems 1
   */
  protected_paths: [string, ...string[]];
}

export type ProtectedPathsSchema = ProtectedPaths;

// ---- rate-limits.schema.json ----
/**
 * Shape of .design/rate-limits/<provider>.json produced by scripts/lib/rate-guard.cjs. One file per provider (anthropic, openai, figma, ...) — header ingestion overwrites atomically via tmp+rename under scripts/lib/lockfile.cjs protection. See .planning/phases/20-gdd-sdk-foundation/20-14-PLAN.md §Task 2.
 */
export interface RateLimits {
  /**
   * Provider identifier (e.g. 'anthropic', 'openai', 'figma'). Matches the state file basename.
   */
  provider: string;
  /**
   * Number of API calls the provider says are still allowed before the next reset. When ingestion sees both requests-remaining and tokens-remaining, the lower value wins (most-restrictive).
   */
  remaining: number;
  /**
   * ISO-8601 timestamp when the rate-limit window resets. Synthesized from whichever header is present: retry-after (seconds or HTTP date), x-ratelimit-reset-requests / -tokens (Unix seconds), anthropic-ratelimit-requests-reset (ISO string). When multiple candidates are present, the latest resetAt wins.
   */
  resetAt: string;
  /**
   * ISO-8601 timestamp when this state file was last written (ingestHeaders call time).
   */
  updatedAt: string;
}

export type RateLimitsSchema = RateLimits;

// ---- recipe.schema.json ----
/**
 * Shape of a declarative recipe loaded from recipes/<name>.json by scripts/lib/recipe-loader.cjs (Plan 31-5-03, RECIPE-01 / SC#14). The recipes/ directory ships EMPTY of recipes and is populated downstream by Phase 32 (skill-trigger recipes), Phase 33.6 (per-provider), Phase 26 (per-runtime/per-model), and Phase 23.5 (bandit-arm shape). This is a minimal, forward-compatible envelope: a recipe MUST carry name/version/steps; additionalProperties:true lets the populating phases extend the envelope without breaking the loader contract. Modelled on Storybloq's src/autonomous/recipes/ loader.ts pattern.
 */
export interface Recipe {
  /**
   * The recipe identifier. Matches the filename stem (recipes/<name>.json).
   */
  name: string;
  /**
   * Recipe/schema version string for forward-compatibility. Lets the loader and downstream phases reason about envelope evolution.
   */
  version: string;
  /**
   * The ordered recipe body. Item shape is kept permissive for now — each step is an object carrying at least a `kind` OR an `id` string. Downstream phases (32/33.6/26/23.5) tighten the step contract per their domain.
   */
  steps: (
    | {
        kind: string;
      }
    | {
        id: string;
      }
  )[];
  [k: string]: unknown;
}

export type RecipeSchema = Recipe;

// ---- runtime-models.schema.json ----
/**
 * Parsed shape of reference/runtime-models.md — the per-runtime tier→model adapter source-of-truth shipped in Phase 26 (D-01..D-03). Consumed by scripts/lib/install/parse-runtime-models.cjs at install time and scripts/lib/tier-resolver.cjs at runtime. Strict enums catch typos at install time, not at runtime. Schema versioned via $schema_version for forward-compat (D-03).
 */
export interface RuntimeModelsTierToModelMap {
  /**
   * Top-level schema version (D-03). Bump on breaking changes; downstream consumers must check before parsing.
   */
  $schema_version: 1;
  /**
   * @minItems 1
   */
  runtimes: [RuntimeEntry, ...RuntimeEntry[]];
}
export interface RuntimeEntry {
  /**
   * Runtime ID. MUST match one of the 14 runtime IDs exported from scripts/lib/install/runtimes.cjs (Phase 24 D-02 lock).
   */
  id:
    | 'claude'
    | 'codex'
    | 'gemini'
    | 'qwen'
    | 'kilo'
    | 'copilot'
    | 'cursor'
    | 'windsurf'
    | 'antigravity'
    | 'augment'
    | 'trae'
    | 'codebuddy'
    | 'cline'
    | 'opencode';
  /**
   * When true, the runtime exposes a single model that maps to all three tiers (D-02). Downstream consumers (router, budget-enforcer) may render a UI affordance noting tier-selection has no cost effect for this runtime.
   */
  single_tier?: boolean;
  /**
   * Provenance confidence of this runtime's tier map. 'verified' = confirmed against runtime-author docs (claude, codex, gemini, qwen). 'byok' = BYOK / multi-provider runtime whose user-configured model may diverge from the Anthropic-default fill. 'unverified' = placeholder fill pending researcher confirmation. Optional: rows omitting this field are treated as unverified-unless-stated by consumers, and verified rows MAY omit it. The budget-enforcer guard reads this (or its built-in verified allowlist) so a byok/unverified row never drives a HARD budget cap (degrades to advisory).
   */
  status?: 'verified' | 'byok' | 'unverified';
  /**
   * Map of canonical Anthropic tier names (D-03) to the runtime's concrete model identifier. All three keys are required even when single_tier=true (assign the same model three times).
   */
  tier_to_model: {
    opus: ModelRow;
    sonnet: ModelRow;
    haiku: ModelRow;
  };
  /**
   * Map of runtime-neutral reasoning-class names (D-10 alias) to the runtime's concrete model identifier. Equivalence with tier_to_model is enforced by Phase 26-08 frontmatter validator (high↔opus, medium↔sonnet, low↔haiku).
   */
  reasoning_class_to_model: {
    high: ModelRow;
    medium: ModelRow;
    low: ModelRow;
  };
  /**
   * Source citations for this runtime's tier map. At minimum one entry pointing at the runtime-author docs URL plus retrieval timestamp + last-validated cycle. Phase 13.2 authority-watcher uses this to flag drift.
   *
   * @minItems 1
   */
  provenance: [
    {
      /**
       * URL of the runtime-author documentation that authoritatively names the tier→model mapping. Placeholder URLs prefixed with `<TODO: confirm at ...>` are acceptable for v1.26 ship and flag the row as researcher-fill-needed.
       */
      source_url: string;
      /**
       * ISO 8601 timestamp when the source URL was retrieved.
       */
      retrieved_at: string;
      /**
       * GDD cycle ID that last validated this row (e.g. '2026-04-29-v1.26').
       */
      last_validated_cycle: string;
      /**
       * Optional inline note (e.g. 'TODO: confirm at runtime-author docs', 'single-tier runtime — same model x3').
       */
      note?: string;
    },
    ...{
      /**
       * URL of the runtime-author documentation that authoritatively names the tier→model mapping. Placeholder URLs prefixed with `<TODO: confirm at ...>` are acceptable for v1.26 ship and flag the row as researcher-fill-needed.
       */
      source_url: string;
      /**
       * ISO 8601 timestamp when the source URL was retrieved.
       */
      retrieved_at: string;
      /**
       * GDD cycle ID that last validated this row (e.g. '2026-04-29-v1.26').
       */
      last_validated_cycle: string;
      /**
       * Optional inline note (e.g. 'TODO: confirm at runtime-author docs', 'single-tier runtime — same model x3').
       */
      note?: string;
    }[],
  ];
}
export interface ModelRow {
  /**
   * Public model name as documented by the runtime author.
   */
  model: string;
  /**
   * Optional internal/provider model ID for runtimes whose API identifiers differ from the public name (D-03).
   */
  provider_model_id?: string;
  /**
   * Optional context-window size (max tokens) for this model, recorded as machine-readable metadata. The Anthropic opus tier ships the 1M-context [1m] variant (1000000). Recorded as fact this cycle; not yet a budgeting driver (deferred — no consumer is wired).
   */
  context_window?: number;
}

export type RuntimeModelsSchema = RuntimeModelsTierToModelMap;


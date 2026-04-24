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
  [k: string]: unknown;
}

export type ConfigSchema = DesignConfigJson;

// ---- events.schema.json ----
/**
 * One line of .design/telemetry/events.jsonl — the append-only telemetry stream produced by Plan 20-06. Each event is a single JSON object followed by a newline. See .planning/phases/20-gdd-sdk-foundation/20-06-PLAN.md.
 */
export interface Event {
  /**
   * Free-form event type identifier. Pre-registered seeds: state.mutation, state.transition, stage.entered, stage.exited, hook.fired, error.
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
   * Event-type-specific payload. Opaque at the envelope level.
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
}

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

// ---- mcp-gdd-state-tools.schema.json ----
/**
 * Combined manifest of all 11 gdd-state MCP tool input+output schemas (Plan 20-05). Individual tool schemas live under scripts/mcp-servers/gdd-state/schemas/ and the tool handlers reference them; this combined schema exists so downstream validators and codegen can compile a single surface.
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


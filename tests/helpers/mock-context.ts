// tests/helpers/mock-context.ts
//
// Shared test helper providing typed mock objects that match the @opencode-ai/plugin
// PluginInput interface. Centralizes mock creation across E2E and integration tests,
// following the inline mock pattern from constraint-reviewer.test.ts but extended for
// broader reuse.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Options for customizing the mock plugin context.
 * All fields are optional -- sensible defaults are provided.
 */
export interface MockPluginCtxOptions {
  /** Project root directory (typically a temp dir created with mkdtempSync). */
  directory: string;
  /** Git worktree directory (defaults to same as directory). */
  worktree: string;
  /** Override the mock session API stubs. */
  session: Partial<MockSessionApi>;
  /** Override the mock tui API stubs. */
  tui: Record<string, unknown>;
}

/**
 * Stubbed session API methods returned by the mock context.
 * Each method returns a Promise so callers can await them as they
 * would with the real SDK client.
 */
export interface MockSessionApi {
  create: (opts?: unknown) => Promise<{ data?: { id?: string } }>;
  prompt: (opts?: unknown) => Promise<{ data?: { parts?: Array<{ type: string; text?: string }> } }>;
  delete: (opts?: unknown) => Promise<void>;
  list: (opts?: unknown) => Promise<{ data?: unknown[] }>;
  get: (opts?: unknown) => Promise<{ data?: unknown }>;
  abort: (opts?: unknown) => Promise<void>;
}

/**
 * Shape of the mock tool output object passed through hook pipelines.
 */
export interface MockToolOutput {
  output: string;
  title: string;
  metadata: Record<string, unknown>;
}

/**
 * Shape of the mock tool.execute.after input object.
 */
export interface MockToolInput {
  tool: string;
  sessionID: string;
  callID: string;
  args: Record<string, unknown>;
}

/**
 * Shape of a mock chat.params input.
 */
export interface MockChatParamsInput {
  sessionID: string;
  agent: string;
  model: { providerID: string; modelID: string };
  provider: { source: string; info: Record<string, unknown>; options: Record<string, unknown> };
  message: { parts: Array<{ type: string; text?: string }> };
}

/**
 * Shape of a mock chat.params output that hooks mutate in-place.
 */
export interface MockChatParamsOutput {
  system: string;
  temperature: number;
  topP: number;
  topK: number;
  options: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mock Plugin Context Factory
// ---------------------------------------------------------------------------

/**
 * Creates a mock PluginInput context suitable for passing to hook factories
 * and tool factories in tests. The returned object matches the PluginInput
 * interface shape and can be used with `as PluginInput` or `as any`.
 *
 * @example
 * ```ts
 * const ctx = createMockPluginCtx({ directory: tmpDir });
 * const hook = createSomeHook(ctx as PluginInput);
 * ```
 */
export function createMockPluginCtx(overrides?: Partial<MockPluginCtxOptions>) {
  const directory = overrides?.directory ?? "/tmp/mock-project";
  const worktree = overrides?.worktree ?? directory;

  const defaultSession: MockSessionApi = {
    create: async () => ({ data: { id: crypto.randomUUID() } }),
    prompt: async () => ({
      data: {
        parts: [{ type: "text", text: '{"status": "PASS", "violations": [], "summary": "OK"}' }],
      },
    }),
    delete: async () => {},
    list: async () => ({ data: [] }),
    get: async () => ({ data: {} }),
    abort: async () => {},
  };

  const session = overrides?.session ? { ...defaultSession, ...overrides.session } : defaultSession;

  const tui = overrides?.tui ?? {};

  return {
    directory,
    worktree,
    project: { name: "mock-project", root: directory },
    serverUrl: new URL("http://localhost:0"),
    $: {} as unknown,
    client: {
      session,
      tui,
      global: {},
      project: {},
      pty: {},
      config: {},
      tool: {},
      instance: {},
      path: {},
      vcs: {},
      command: {},
      provider: {},
      find: {},
      file: {},
      app: {},
      mcp: {},
      lsp: {},
      formatter: {},
      auth: {},
      event: {},
    },
  };
}

// ---------------------------------------------------------------------------
// Mock Tool Output Factory
// ---------------------------------------------------------------------------

/**
 * Creates a realistic tool output object suitable for passing through
 * the tool.execute.after hook pipeline.
 *
 * @param tool - The tool name (e.g., "Write", "Edit", "Read", "Bash")
 * @param content - The output content string
 * @param overrides - Optional partial overrides for title and metadata
 *
 * @example
 * ```ts
 * const output = createMockToolOutput("Write", "file written successfully");
 * await hook["tool.execute.after"](input, output);
 * ```
 */
export function createMockToolOutput(
  tool: string,
  content: string,
  overrides?: Partial<{ title: string; metadata: Record<string, unknown> }>,
): MockToolOutput {
  return {
    output: content,
    title: overrides?.title ?? `${tool} result`,
    metadata: overrides?.metadata ?? {},
  };
}

/**
 * Creates a realistic tool.execute.after input object.
 *
 * @param tool - The tool name (e.g., "Write", "Edit", "Read")
 * @param args - Tool arguments (e.g., { file_path: "/path/to/file.ts" })
 * @param overrides - Optional overrides for sessionID and callID
 *
 * @example
 * ```ts
 * const input = createMockToolInput("Write", { file_path: "/tmp/test.ts" });
 * await hook["tool.execute.after"](input, output);
 * ```
 */
export function createMockToolInput(
  tool: string,
  args: Record<string, unknown> = {},
  overrides?: Partial<{ sessionID: string; callID: string }>,
): MockToolInput {
  return {
    tool,
    sessionID: overrides?.sessionID ?? "test-session",
    callID: overrides?.callID ?? `call-${crypto.randomUUID()}`,
    args,
  };
}

// ---------------------------------------------------------------------------
// Mock Agent Response Factory
// ---------------------------------------------------------------------------

/**
 * Creates a canned LLM-style agent response matching the shape returned
 * by `ctx.client.session.prompt()`. Use this to stub session.prompt in
 * the mock context when testing code that invokes subagents.
 *
 * @param parts - Array of response parts. Defaults to a single text part
 *                with a JSON "PASS" review response.
 *
 * @example
 * ```ts
 * const response = createMockAgentResponse([
 *   { type: "text", text: "Generated code here" }
 * ]);
 * ```
 */
export function createMockAgentResponse(parts?: Array<{ type: string; text?: string }>): {
  data: { parts: Array<{ type: string; text?: string }> };
} {
  const defaultParts = [
    {
      type: "text" as const,
      text: '{"status": "PASS", "violations": [], "summary": "All constraints satisfied"}',
    },
  ];

  return {
    data: {
      parts: parts ?? defaultParts,
    },
  };
}

// ---------------------------------------------------------------------------
// Mock Chat Params Factory
// ---------------------------------------------------------------------------

/**
 * Creates a mock chat.params input object for testing hooks that operate
 * on the chat.params lifecycle point.
 *
 * @param overrides - Optional partial overrides for any field
 */
export function createMockChatParamsInput(overrides?: Partial<MockChatParamsInput>): MockChatParamsInput {
  return {
    sessionID: overrides?.sessionID ?? "test-session",
    agent: overrides?.agent ?? "commander",
    model: overrides?.model ?? { providerID: "openai", modelID: "gpt-5.3-codex" },
    provider: overrides?.provider ?? {
      source: "config",
      info: { id: "openai" },
      options: {},
    },
    message: overrides?.message ?? {
      parts: [{ type: "text", text: "Implement the auth module" }],
    },
  };
}

/**
 * Creates a mock chat.params output object that hooks mutate in-place.
 *
 * @param overrides - Optional partial overrides for any field
 */
export function createMockChatParamsOutput(overrides?: Partial<MockChatParamsOutput>): MockChatParamsOutput {
  return {
    system: overrides?.system ?? "You are a helpful AI coding assistant.",
    temperature: overrides?.temperature ?? 0.7,
    topP: overrides?.topP ?? 1,
    topK: overrides?.topK ?? 0,
    options: overrides?.options ?? { agent: "commander" },
  };
}

// ---------------------------------------------------------------------------
// Fixture Setup Helpers
// ---------------------------------------------------------------------------

/**
 * Sets up a .mindmodel/ directory in the given project directory with
 * a manifest and sample constraint file. Useful for tests that need
 * a realistic mindmodel present on disk.
 *
 * @param projectDir - The project root directory (e.g., a temp dir)
 * @param options - Optional customizations for the fixture content
 */
export function setupMindmodelFixture(
  projectDir: string,
  options?: {
    projectName?: string;
    constraintFileName?: string;
    rules?: string[];
  },
): string {
  const mindmodelDir = join(projectDir, ".mindmodel");
  mkdirSync(mindmodelDir, { recursive: true });

  const projectName = options?.projectName ?? "test-project";
  const constraintFileName = options?.constraintFileName ?? "patterns.md";
  const rules = options?.rules ?? [
    "Always use internal apiClient for API calls",
    "Never swallow errors silently",
    "Use TypeScript strict mode",
  ];

  writeFileSync(
    join(mindmodelDir, "manifest.yaml"),
    `name: ${projectName}
version: 2
categories:
  - path: ${constraintFileName}
    description: Code patterns and constraints
`,
  );

  writeFileSync(
    join(mindmodelDir, constraintFileName),
    `# Code Patterns

## Rules
${rules.map((r) => `- ${r}`).join("\n")}

## Examples

### Correct API usage
\`\`\`typescript
const data = await apiClient.get("/users");
\`\`\`

## Anti-patterns

### Direct fetch usage
\`\`\`typescript
const data = await fetch("/api/users");
\`\`\`
`,
  );

  return mindmodelDir;
}

/**
 * Sets up a micode-beads.json config file in the given directory.
 * The directory should be an alternative config base dir, not the project root.
 *
 * @param configDir - The config directory (e.g., a temp dir acting as ~/.config/opencode/)
 * @param config - The config object to write
 */
export function setupMicodeConfig(
  configDir: string,
  config?: {
    agents?: Record<string, { model?: string; temperature?: number; maxTokens?: number }>;
    features?: { mindmodelInjection?: boolean };
    compactionThreshold?: number;
    fragments?: Record<string, string[]>;
    methodology?: string;
    researchDirs?: string[];
    afk?: boolean;
  },
): string {
  mkdirSync(configDir, { recursive: true });

  const defaultConfig = config ?? {
    agents: {
      commander: { model: "openai/gpt-5.3-codex", temperature: 0.5 },
      implementer: { model: "anthropic/claude-opus-4.6", maxTokens: 8192 },
    },
    features: { mindmodelInjection: false },
    compactionThreshold: 0.8,
    fragments: {
      commander: ["Always explain reasoning before acting"],
    },
  };

  const configPath = join(configDir, "micode-beads.json");
  writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  return configPath;
}

/**
 * Sets up an opencode.json config file in the given directory.
 *
 * @param configDir - The config directory (e.g., a temp dir acting as ~/.config/opencode/)
 * @param config - The config object to write
 */
export function setupOpencodeConfig(
  configDir: string,
  config?: {
    model?: string;
    provider?: Record<string, { models?: Record<string, { limit?: { context?: number } }> }>;
  },
): string {
  mkdirSync(configDir, { recursive: true });

  const defaultConfig = config ?? {
    model: "openai/gpt-5.3-codex",
    provider: {
      openai: {
        models: {
          "gpt-5.3-codex": { limit: { context: 200000 } },
          "gpt-4.1": { limit: { context: 128000 } },
        },
      },
      anthropic: {
        models: {
          "claude-opus-4.6": { limit: { context: 200000 } },
          "claude-sonnet-4.5": { limit: { context: 200000 } },
        },
      },
    },
  };

  const configPath = join(configDir, "opencode.json");
  writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
  return configPath;
}

/**
 * Sets up thoughts/ directory structure used by workflow, ledgers, and plans.
 *
 * @param projectDir - The project root directory
 */
export function setupThoughtsDir(projectDir: string): string {
  const thoughtsDir = join(projectDir, "thoughts");
  mkdirSync(join(thoughtsDir, "ledgers"), { recursive: true });
  mkdirSync(join(thoughtsDir, "shared", "plans"), { recursive: true });
  mkdirSync(join(thoughtsDir, "brainstorms"), { recursive: true });
  mkdirSync(join(thoughtsDir, "workflow"), { recursive: true });
  return thoughtsDir;
}

/**
 * Sets up a continuity ledger file for testing ledger-loader.
 *
 * @param projectDir - The project root directory
 * @param sessionName - The session name embedded in the filename
 * @param content - Optional custom ledger content
 */
export function setupLedgerFixture(projectDir: string, sessionName: string, content?: string): string {
  const ledgersDir = join(projectDir, "thoughts", "ledgers");
  mkdirSync(ledgersDir, { recursive: true });

  const ledgerContent =
    content ??
    `# Session: ${sessionName}

## Goal
Implement the authentication module with JWT validation.

## Progress
### Done
- [x] Created auth middleware skeleton
- [x] Added JWT validation logic

### In Progress
- [ ] Adding refresh token support

## Key Decisions
- **JWT over sessions**: Stateless auth scales better for our API-first architecture

## Next Steps
1. Implement refresh token endpoint
2. Add token rotation on use
`;

  const ledgerPath = join(ledgersDir, `CONTINUITY_${sessionName}.md`);
  writeFileSync(ledgerPath, ledgerContent);
  return ledgerPath;
}

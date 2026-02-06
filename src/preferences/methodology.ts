export interface MethodologyTaskOrdering {
  /** Whether test tasks are separate from implementation tasks */
  separateTestTasks: boolean;
  /** Whether tests must precede implementation in the dependency graph */
  testFirst: boolean;
  /** Additional task types to inject (e.g., "design-review" before implementation) */
  additionalSteps?: string[];
}

export interface MethodologyPromptModifiers {
  /** Additional planner instructions */
  plannerInstructions: string;
  /** Additional executor instructions */
  executorInstructions: string;
  /** Additional implementer instructions */
  implementerInstructions: string;
}

export interface MethodologyProfile {
  name: string;
  description: string;
  taskOrdering: MethodologyTaskOrdering;
  promptModifiers: MethodologyPromptModifiers;
}

export const BUILTIN_METHODOLOGIES: Record<string, MethodologyProfile> = {
  default: {
    name: "default",
    description: "Standard implementation workflow - test and implementation in same micro-task",
    taskOrdering: {
      separateTestTasks: false,
      testFirst: false,
    },
    promptModifiers: {
      plannerInstructions: "",
      executorInstructions: "",
      implementerInstructions: "",
    },
  },
  tdd: {
    name: "tdd",
    description: "Test-Driven Development - tests written and verified before implementation",
    taskOrdering: {
      separateTestTasks: true,
      testFirst: true,
    },
    promptModifiers: {
      plannerInstructions: `<methodology name="tdd">
CRITICAL TDD OVERRIDE - This project uses Test-Driven Development methodology.

Task structure changes:
- Each feature component becomes TWO micro-tasks: a TEST task and an IMPLEMENTATION task
- TEST tasks MUST be in an earlier batch than their corresponding IMPLEMENTATION task
- TEST tasks write the test file only. IMPLEMENTATION tasks write the production code only.
- The dependency graph MUST enforce: test-task -> implementation-task

Modified batch structure:
- Batch N (tests): Write test files for components. Each test task creates ONE test file.
- Batch N+1 (implementations): Write production code. Each implementation task depends on its test task.

Example:
  Batch 1: [1.1-test, 1.2-test, 1.3-test] (parallel - write tests)
  Batch 2: [1.1-impl, 1.2-impl, 1.3-impl] (parallel - depends on batch 1)

Each TEST task must:
1. Write the test file with failing tests (testing expected behavior)
2. Run tests to verify they FAIL (red phase)
3. Report which tests exist and their expected behaviors

Each IMPLEMENTATION task must:
1. Depend on its corresponding test task
2. Write the production code
3. Run tests to verify they PASS (green phase)
</methodology>`,
      executorInstructions: `<methodology name="tdd">
TDD Execution Rules:
- Execute ALL test-writing tasks in a batch FIRST
- Verify all tests FAIL (red phase) before proceeding
- Then execute ALL implementation tasks in the next batch
- Verify all tests PASS (green phase)
- Do NOT skip the red-phase verification
</methodology>`,
      implementerInstructions: `<methodology name="tdd">
TDD Task Rules:
- If this is a TEST task: write the test file ONLY. Verify tests FAIL. Do NOT write implementation.
- If this is an IMPLEMENTATION task: write the production code ONLY. Verify tests PASS.
- Respect the separation - never combine test and implementation in one task.
</methodology>`,
    },
  },
};

/** Look up a methodology profile by name. Returns null for unknown names. */
export function getMethodology(name: string): MethodologyProfile | null {
  return BUILTIN_METHODOLOGIES[name] ?? null;
}

/**
 * Resolves the active methodology for a project.
 * Checks the user config for a methodology field, falling back to "default".
 */
export function getActiveMethodology(
  _projectDir: string,
  userConfig: { methodology?: string } | null,
): MethodologyProfile {
  const name = userConfig?.methodology ?? "default";
  return BUILTIN_METHODOLOGIES[name] ?? BUILTIN_METHODOLOGIES.default;
}

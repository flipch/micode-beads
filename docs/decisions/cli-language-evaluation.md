# Decision Record: CLI Language and Framework Evaluation

**Decision ID**: DR-001
**Feature**: cli-overhaul (FR-04)
**Status**: Accepted
**Date**: 2026-02-06
**Authors**: micode-beads maintainers

## Context

The micode-beads CLI is the primary entry point for new users. Today it is written in TypeScript and runs on the Bun runtime. Users must have Bun installed before they can use the CLI, which creates an adoption barrier. GitHub issue #19 highlighted installation difficulties stemming from this dependency chain.

The `bun build --compile` feature (available since Bun 1.0) can produce standalone executables that embed the Bun runtime, eliminating the need for users to install Bun separately. Alternatively, the CLI could be rewritten in a compiled language (Go, Rust) that produces native binaries without embedding a runtime.

This evaluation assesses four options and recommends a path forward.

## Options Evaluated

### Option A: Bun `--compile` Standalone Binary (Current Approach, Enhanced)

Keep the CLI in TypeScript, use `bun build --compile` to produce self-contained executables for each platform/architecture combination.

**How it works**: The entire CLI TypeScript source is bundled and compiled into a single executable that embeds the Bun runtime. The user downloads this binary and runs it directly with no prerequisites.

**Measured metrics** (from this project, Bun 1.3.8, macOS arm64):

| Metric | Value |
|--------|-------|
| Binary size | ~58 MB |
| Startup time | ~20 ms |
| Build time (single target) | ~470 ms |
| Bundle step | ~25 ms (9 modules) |

**Cross-platform build targets**: `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-arm64`, `bun-linux-x64`. Cross-compilation is built in; all four targets can be produced from a single CI runner.

**Advantages**:
- Single-language codebase: CLI and plugin share TypeScript, types, and tooling (biome, bun:test, lefthook)
- Zero migration cost: the CLI already exists and works
- Cross-compilation is trivial: a single `bun build --compile --target=<target>` flag per platform
- Fast builds: under 500ms per target
- Fast startup: ~20ms, well under the 200ms requirement
- No new dependencies or build toolchain
- Shared type definitions between CLI and plugin (e.g., `AgentOverride`, config schemas)
- Bun's built-in APIs (`which`, `Bun.version`, `bun:sqlite`) are already in use throughout the codebase

**Disadvantages**:
- Binary size is ~58 MB because the full Bun runtime is embedded. This is large compared to Go (~10-15 MB) or Rust (~5-10 MB) equivalents
- Users who already have Bun installed effectively download the runtime twice (once in the binary, once standalone)
- Bun's `--compile` is relatively new; edge cases in cross-compilation may surface over time
- The embedded Bun version is fixed at compile time; security patches to the runtime require recompilation and a new release

### Option B: Go CLI

Rewrite the CLI in Go. Produce native binaries via `go build` with `GOOS`/`GOARCH` cross-compilation.

**Estimated metrics** (based on comparable Go CLIs like `gh`, `golangci-lint`, `lazygit`):

| Metric | Estimated Value |
|--------|-----------------|
| Binary size | 10-15 MB |
| Startup time | 5-15 ms |
| Build time (single target) | 2-5 s |
| Cross-compilation | Built-in (`GOOS=linux GOARCH=arm64 go build`) |

**Advantages**:
- Significantly smaller binaries (~10-15 MB vs 58 MB)
- No runtime dependency; true native binary
- Go's cross-compilation is mature and battle-tested
- Strong standard library for CLI concerns (flag parsing, file I/O, HTTP)
- Static linking by default; no shared library dependencies
- Large ecosystem of CLI frameworks (cobra, kong, urfave/cli)
- Fast compilation

**Disadvantages**:
- Dual-language codebase: CLI in Go, plugin in TypeScript. Contributors need both toolchains
- No shared types between CLI and plugin. Config schemas, check definitions, and error types would be duplicated
- Migration cost: ~1,770 lines of CLI TypeScript to rewrite, plus tests
- Go's error handling style differs significantly from TypeScript's try/catch; code patterns would diverge
- Testing would use `go test` instead of `bun:test`, adding a second test runner to CI
- Ongoing maintenance burden: changes to CLI checks (e.g., new doctor checks for new config fields) must be implemented in Go even though the config is defined in TypeScript

### Option C: Rust CLI

Rewrite the CLI in Rust. Produce native binaries via `cargo build --release` with cross-compilation via `cross` or `cargo-zigbuild`.

**Estimated metrics** (based on comparable Rust CLIs like `ripgrep`, `starship`, `bat`):

| Metric | Estimated Value |
|--------|-----------------|
| Binary size | 5-10 MB |
| Startup time | 1-5 ms |
| Build time (single target) | 30-120 s |
| Cross-compilation | Requires `cross` or `cargo-zigbuild` tooling |

**Advantages**:
- Smallest binaries of all options (~5-10 MB)
- Fastest startup times (~1-5 ms)
- No runtime dependency; true native binary
- Memory safety guarantees
- Strong CLI ecosystem (clap, structopt)
- Excellent error handling with `Result<T, E>` and the `?` operator

**Disadvantages**:
- Highest migration cost: Rust has the steepest learning curve among the options. The current contributor base works in TypeScript
- Dual-language codebase with the widest language gap. Rust and TypeScript share few idioms
- Longest build times (30-120s per target), slowing CI feedback loops
- Cross-compilation requires additional tooling (`cross`, Docker, or `cargo-zigbuild`) rather than being built in
- Ongoing maintenance burden is the highest: every change to config schemas, check logic, or output formatting must be maintained in a fundamentally different language
- No shared types between CLI and plugin
- Over-engineered for the CLI's actual complexity (~1,770 lines of straightforward file I/O, process spawning, and string formatting)

### Option D: Current Approach (Bun Runtime, No Compile)

Keep the CLI in TypeScript with no standalone binary. Users install via `npm install -g micode-beads` or `bun add -g micode-beads` and must have a JavaScript runtime (Bun or Node.js) pre-installed.

**Current metrics**:

| Metric | Value |
|--------|-------|
| Package size (npm) | ~150 KB (JS only, no runtime) |
| Startup time (with Bun) | ~30 ms |
| Build time | ~100 ms (bun build to JS) |
| Prerequisites | Bun or Node.js runtime |

**Advantages**:
- Smallest distribution artifact (~150 KB)
- No build complexity for standalone binaries; no cross-compilation step
- Single-language codebase, single toolchain
- Familiar to all contributors
- Runtime updates happen independently of micode-beads releases (users update Bun/Node separately)

**Disadvantages**:
- Requires users to have Bun (or Node.js) pre-installed; this is the primary adoption barrier identified in issue #19
- The install script must bootstrap Bun if it is missing, adding complexity and fragility to the install path
- Users in environments without npm/Bun (e.g., minimal Docker images, fresh workstations) cannot install without first setting up a JS runtime
- Does not achieve the "zero-prerequisite" requirement (FR-03)

## Comparison Matrix

| Criterion | A: Bun --compile | B: Go | C: Rust | D: Current (no compile) |
|-----------|:-:|:-:|:-:|:-:|
| **Binary size** | 58 MB | 10-15 MB | 5-10 MB | N/A (150 KB + runtime) |
| **Startup time** | ~20 ms | 5-15 ms | 1-5 ms | ~30 ms |
| **Cross-platform build complexity** | Low (built-in flag) | Low (built-in env vars) | Medium (extra tooling) | None |
| **Maintenance burden** | Low (single language) | High (dual language) | Very High (dual + learning curve) | Low (single language) |
| **Dependency elimination** | Full (standalone) | Full (native) | Full (native) | None (runtime required) |
| **User experience** | Good (single binary, fast) | Good (smaller binary, fast) | Good (smallest, fastest) | Poor (prerequisite install) |
| **Migration cost** | None | High (~1,770 LOC rewrite) | Very High (~1,770 LOC + Rust expertise) | None |
| **Type sharing with plugin** | Full | None | None | Full |
| **CI build time impact** | Minimal (+2s for 4 targets) | Moderate (+10-20s) | High (+2-8 min) | None |
| **Contributor accessibility** | High (same language) | Medium (Go is approachable) | Low (Rust learning curve) | High (same language) |

## Analysis

### Eliminating Options C and D

**Option D** (current approach) fails to meet FR-03 (zero-prerequisite installation). It is the status quo that prompted this evaluation. While it has the lowest distribution size, the runtime prerequisite is the exact problem users reported in issue #19.

**Option C** (Rust) offers the best raw metrics (smallest binary, fastest startup) but imposes disproportionate costs. The CLI is ~1,770 lines of straightforward code: file existence checks, JSON parsing, process spawning, and string formatting. This does not benefit from Rust's memory safety guarantees or performance characteristics. The dual-language maintenance burden would be the highest of all options, and the Rust learning curve would reduce the pool of contributors who can modify the CLI. Build times of 30-120 seconds per target would noticeably slow CI. The marginal improvement in binary size (5-10 MB vs 58 MB) and startup time (1-5 ms vs 20 ms) does not justify these costs.

### Option A vs Option B

The substantive comparison is between Bun `--compile` (A) and Go (B).

**In favor of Go (B)**:
- Binary size: ~10-15 MB vs 58 MB. Users on slow connections or metered bandwidth would benefit from a 4-6x smaller download. However, the install script could compress binaries (gzip reduces Bun --compile binaries by ~50%), narrowing the gap to ~30 MB vs ~8 MB
- No embedded runtime: security patches to the Go standard library are pulled in via `go get`; Bun --compile fixes require rebuilding against a new Bun version. In practice, both require a new release

**In favor of Bun --compile (A)**:
- Zero migration cost. The CLI already exists, is tested (632 tests passing), and works. A Go rewrite would take days to weeks and introduce new bugs
- Single-language codebase. Config schemas, check definitions, error types, and output formatting are shared between CLI and plugin. With Go, every new doctor check or config field change would require parallel implementation in both languages
- Contributor accessibility. All current contributors work in TypeScript. Adding Go introduces a second language, second test framework, and second set of idioms
- The 58 MB binary size, while larger, is comparable to other developer tools (e.g., `deno` is ~100 MB, `node` is ~80 MB). For a CLI downloaded once and updated infrequently, the difference between 58 MB and 12 MB is not material for most users on modern connections
- The 20 ms startup time already exceeds the 200 ms requirement by 10x. Going from 20 ms to 10 ms is imperceptible to users

### Binary Size Mitigation

The 58 MB binary size is the primary drawback of Option A. Mitigation strategies:

1. **Compression**: Distribute as `.tar.gz` or `.zip`. Bun-compiled binaries compress well (~50% reduction, yielding ~29 MB)
2. **UPX packing**: UPX can further reduce standalone binaries (~60-70% reduction). Trade-off: slightly slower startup due to decompression. Not yet tested with Bun --compile
3. **Future Bun improvements**: The Bun team has stated that reducing `--compile` binary size is on their roadmap. As Bun matures, sizes will likely decrease
4. **Acceptability**: Developer tools are large. Users accept downloading 100 MB+ for VS Code, 80 MB for Node.js, or 200 MB+ for Docker. A 58 MB CLI binary is within normal bounds

## Recommendation

**Option A: Bun `--compile` standalone binary.**

The recommendation is to continue with the current TypeScript implementation and distribute standalone binaries via `bun build --compile`. This approach is already implemented (T9 completed the build pipeline) and delivers the zero-prerequisite installation experience required by FR-03.

### Rationale

1. **The CLI is already built and working.** Rewriting in Go or Rust would delay delivery of the doctor command, install script improvements, and other user-facing features with no functional benefit to the end user
2. **Maintenance cost dominates.** Over the lifecycle of this project, the cost of maintaining parallel implementations in two languages far exceeds the one-time cost of distributing a larger binary. Every new doctor check, config field, or CLI feature would require dual implementation
3. **Binary size is acceptable.** At ~58 MB (or ~29 MB compressed), the binary is within the range of comparable developer tools. Users download it once and update infrequently
4. **Performance meets requirements.** 20 ms startup time exceeds the 200 ms requirement by a wide margin. Further optimization is unnecessary
5. **Contributor accessibility matters.** A single-language project is easier to contribute to, review, and maintain

### When to Reconsider

This decision should be revisited if:
- The CLI surface area grows significantly beyond diagnostics and initialization (e.g., if it becomes a full workflow orchestrator with complex state management that would benefit from Go's concurrency model)
- Bun `--compile` stability or cross-compilation proves unreliable in production (no evidence of this as of Bun 1.3.8)
- Binary size becomes a documented user complaint (none reported to date)
- The micode-beads project adopts Go or Rust elsewhere, reducing the dual-language overhead

## References

- [FR-04: CLI Language/Framework Evaluation](../../.rp1/work/features/cli-overhaul/requirements.md)
- [Design: Implementation Plan T10](../../.rp1/work/features/cli-overhaul/design.md)
- [GitHub Issue #19](https://github.com/flipch/micode-beads/issues/19)
- [Bun --compile documentation](https://bun.sh/docs/bundler/executables)
- [scripts/build-standalone.sh](../../scripts/build-standalone.sh)

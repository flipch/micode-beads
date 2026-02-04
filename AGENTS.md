# AGENTS

This repository is a fork of https://github.com/vtemian/micode.

## Commit Style

- Use Conventional Commits (feat, fix, docs, chore, refactor, test, perf, build, ci, revert, style).
- Breaking changes: add ! in the type or a BREAKING CHANGE: footer.

## Release Flow (Automated)

- Release-please runs on push to main and opens/updates a Release PR.
- Merge the Release PR to bump version + changelog and tag the release.
- Release-please creates a GitHub Release (published) for the tag.
- release.yml publishes to npm on GitHub Release (OIDC) when NPM_PUBLISH_OIDC=true.
- If no GitHub Release is created, publish one manually for the tag.

## npm Trusted Publishing (OIDC)

- Use OIDC, no tokens.
- Ensure npm Trusted Publishing is configured for flipch/micode-beads and workflow .github/workflows/release.yml.
- GitHub repo variable NPM_PUBLISH_OIDC must be set to true.

## Tests and Build

- Run: bin/bun test
- Build: bin/bun run build

## Local Tooling

- Use hermit binaries from ./bin: bin/bun, bin/bd, bin/hermit.

## Manual Version Bumps (Optional)

- Prefer release-please. Manual bumps are allowed:
  - bin/bun run version:patch
  - bin/bun run version:minor
  - bin/bun run version:major
  - bin/bun run version:prerelease

## Publishing Notes

- Local npm publish should not use --provenance (CI-only).
- Prefer publishing via GitHub Release to trigger OIDC provenance.

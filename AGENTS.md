# AGENTS

Fork of https://github.com/vtemian/micode.

Commit style: Conventional Commits; breaking changes use ! or BREAKING CHANGE footer.

Release flow:
- Release-please runs on push to main and opens/updates a Release PR.
- Merge Release PR to bump version + changelog + tag; it creates a GitHub Release.
- release.yml publishes to npm on GitHub Release when NPM_PUBLISH_OIDC=true.

OIDC setup:
- npm Trusted Publishing configured for flipch/micode-beads + .github/workflows/release.yml.
- GitHub repo variable NPM_PUBLISH_OIDC=true.

Tests/build: bin/bun test; bin/bun run build.
Tooling: use hermit binaries in ./bin (bin/bun, bin/bd, bin/hermit).
Manual bumps (optional): bin/bun run version:patch|minor|major|prerelease.
Publishing: local npm publish should not use --provenance; prefer GitHub Release (OIDC).

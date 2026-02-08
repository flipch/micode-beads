# Naming Conventions

## Rules
- Files use kebab-case (e.g., config-loader.ts)
- Functions use camelCase with verb prefixes (create*, load*, parse*)
- Types and interfaces use PascalCase
- Constants use UPPER_SNAKE_CASE

## Examples

### Correct file naming
```typescript
// config-loader.ts, artifact-auto-index.ts
import { loadMicodeConfig } from "./config-loader";
```

### Correct function naming
```typescript
function createConstraintReviewerHook(ctx: PluginInput) { ... }
function loadMindmodel(dir: string) { ... }
function parseManifest(yaml: string) { ... }
```

## Anti-patterns

### Incorrect file naming
```typescript
// ConfigLoader.ts, artifactAutoIndex.ts
import { loadMicodeConfig } from "./ConfigLoader";
```

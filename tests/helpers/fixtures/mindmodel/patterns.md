# Code Patterns

## Rules
- Always use internal apiClient for API calls
- Never swallow errors silently
- Use TypeScript strict mode
- Prefer async/await over raw Promises
- All public functions must have JSDoc comments

## Examples

### Correct API usage
```typescript
const data = await apiClient.get("/users");
```

### Correct error handling
```typescript
try {
  const result = await processData(input);
  return result;
} catch (error) {
  log.error("module", "Failed to process data", error);
  throw error;
}
```

## Anti-patterns

### Direct fetch usage
```typescript
const data = await fetch("/api/users");
```

### Silent error swallowing
```typescript
try {
  await riskyOperation();
} catch {
  // silently ignored
}
```

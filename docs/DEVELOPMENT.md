# Development

To develop locally, install the required Node.js version and pnpm, then run `pnpm install`. Create `.env` using the [setup instructions](./SETUP.md#configuration).

```text
pnpm run dev           # Start the development watcher
pnpm run typecheck     # Check TypeScript without emitting files
pnpm run build         # Build the production bundle
pnpm start             # Start the production bundle
pnpm run format        # Format TypeScript files
pnpm run format:check  # Check TypeScript formatting
```

There is no automated test script yet. Validate changes with `pnpm run typecheck`, `pnpm run build`, and focused manual checks.

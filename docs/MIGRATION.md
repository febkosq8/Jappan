# Migration

The v1-to-v2 migration is a one-time, environment-dependent operation:

```text
pnpm run migrate:v1tov2 -- <v1-db-url> <v2-db-url>
```

The migration clears the v2 destination database after a 10-second cancellation window. Create a backup of the destination database before running it. Press `Ctrl+C` during the cancellation window to stop the migration.

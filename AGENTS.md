# Jappan Agent Guide

Jappan is a TypeScript/ESM Discord bot.

## Stack / Framework

- Runtime: Node.js
- Language: TypeScript with strict mode and NodeNext modules
- Discord framework: discord.js
- Music framework: Discord Player
- Database: MongoDB with Mongoose
- Package manager: pnpm

## Development Commands

Run commands from the repository root:

```text
pnpm run typecheck
pnpm run build
pnpm run dev
pnpm start
pnpm run format
pnpm run format:check
```

`pnpm run migrate:v1tov2` is the intentional, environment-dependent one-time migration from v1 to v2, not a routine development command. The project currently has no automated test script; use typecheck, build, and focused manual verification.

The required validation command for code changes is:

```text
pnpm run typecheck
```

Discord.js references:

- API documentation: https://discord.js.org/docs/packages/discord.js/main
- Guide: https://discordjs.guide/
- Discord Player documentation: https://discord-player.js.org/

Required environment values are `DISCORD_TOKEN` and `DB_URL`. All other values, defaults, validation, and optional player health-check settings are defined in `.env.example` and `src/services/config.ts`; update both when adding an environment-backed setting. Boolean values are enabled only when their environment value is exactly `"true"`.

## System Design

### Startup

`src/index.ts` loads environment configuration, connects to MongoDB, and starts the Discord bot. `src/bot.ts` creates the Discord client, loads commands and buttons, registers Discord handlers, and logs in.

The intended startup order is database readiness first, Discord connection second, and subsystem initialization after both prerequisites are available.

### Layers

- `src/index.ts` and `src/bot.ts`: bootstrap and lifecycle
- `src/handlers/`: Discord event and interaction adapters
- `src/commands/`: slash command definitions and thin command entry points
- `src/buttons/`: button interaction implementations
- `src/services/`: feature behavior, persistence coordination, loaders, and configuration
- `src/models/`: Mongoose documents and schemas
- `src/helpers/`: shared logging, command, button, and Discord utility code

Handlers should receive Discord events and forward feature behavior to services. Services own business rules and persistence operations. Keep command and handler code thin.

### Commands

Files directly under `src/commands/` are global commands; `src/commands/guildCommands/` contains guild-scoped commands deployed separately. Commands that require the database must set `commandData.isDBDependant: true`; dispatch uses this flag to reject them when the database is unavailable.

### Discord Events

`src/handlers/discord.ts` registers core events and extended feature events. Multiple listeners for the same Discord.js event are intentional and supported. Keep event adapters thin; feature behavior belongs in services.

`ENABLE_EVENTS_DEBUG` registers parallel debug listeners for matching entries in the `debugEvents` map in `src/handlers/discord.ts`. Patterns support exact names, `*`, and prefix/suffix/contains wildcards. Update that map when adding a debug-eligible event. Debug output uses `logger.debug`, not direct console calls.

### TypeScript Strictness

In addition to `strict`, the project enables `verbatimModuleSyntax`, `isolatedModules`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noUncheckedSideEffectImports`. Use type-only imports where required, handle possibly missing indexed values, and do not assign `undefined` to optional properties.

### Button Custom IDs

Buttons with payloads use the canonical custom ID format:

```text
Action|KEY#value:KEY#value
```

Example:

```text
DeleteDoppelganger|MID#messageId:CID#channelId:UID#userId
```

Use named fields, not positional payloads. Static buttons without payloads may use a plain action ID.

### Discord Mentions

Anything that represents a Discord entity must use its clickable mention format in user-facing messages:

- Users: `formatUserMention(...)` from `src/helpers/discord.ts`
- Guilds: `formatGuildMention(...)` from `src/helpers/discord.ts`
- Channels: `formatChannelMention(...)` from `src/helpers/discord.ts`
- Roles: `formatRoleMention(...)` from `src/helpers/discord.ts`
- Slash commands: use the command display helpers in `src/helpers/command.ts`, which generate application command mentions

For logs and non-mention labels, use the corresponding `formatUser(...)`, `formatGuild(...)`, `formatChannel(...)`, or `formatRole(...)` helpers from `src/helpers/discord.ts` instead of displaying raw entity IDs.

Do not display raw user, channel, role, or command IDs or names when a Discord mention can be generated. Use plain text only when the entity cannot be mentioned or when the surrounding wording explicitly requires a non-clickable label.

### Discord Permission Formatting

Permission names in ordinary Discord message content must use Discord underlining via `underline(...)`. Permission names inside embed descriptions, fields, or other embed text must use Markdown backticks instead.

### Discord Embeds

Every `EmbedBuilder` embed must set both an author and a timestamp. Use the configured bot identity for the author when configuration is available.

### Logging

Use `src/services/logger.ts` for logging. The logger delegates to `src/helpers/logger.ts` and supports `debug`, `info`, `success`, `warn`, and `error` levels. Include useful context in the details object, especially guild, user, command, role, and channel identifiers.

Do not use `console.log`, `console.info`, or `console.debug` directly in feature code. `LogCategory` is a closed union in `src/helpers/logger.ts`; add a category there before using a new one.

### Configuration

Configuration is loaded once by `loadConfig()` and accessed through `getConfig()`. Add new environment-backed values to all of these places:

1. `Config` interface
2. `configTemplate` defaults
3. `loadConfig()` parsing
4. the returned configuration object

Boolean values are enabled only when their environment value is exactly `"true"`.

## Working Rules

- Prefer existing local patterns and services over new abstractions.
- Handle supported cases with positive checks, then use an explicit failure fallback for unsupported input.
- Use a destructured options object for functions with three or more parameters.
- Keep changes focused and avoid unrelated refactors.
- Preserve public behavior unless an explicitly requested change allows an improvement.
- Use structured logging with context instead of direct console output.
- Do not commit changes automatically.
- After edits, run the narrowest relevant test or typecheck, then run the full typecheck before handoff.

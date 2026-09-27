# Jappan Rework Agent Guide

## Project Status

Jappan Rework is the TypeScript/ESM rewrite of the Jappan Discord bot. It uses Node.js, discord.js 14, Mongoose, strict TypeScript with NodeNext modules, and pnpm.

This project is the active rewrite boundary. Keep new implementation under `Jappan_Rework`; do not modify the legacy `Jappan_Discord_Bot` implementation as part of this work.

## Development Commands

Run commands from `Jappan_Rework`:

```text
pnpm run typecheck
pnpm run build
pnpm run dev
pnpm start
```

The required validation command for code changes is:

```text
pnpm run typecheck
```

Discord.js references:

- API documentation: https://discord.js.org/docs/packages/discord.js/main
- Guide: https://discordjs.guide/

Required environment values are `DISCORD_TOKEN` and `DB_URL`. Optional configuration includes:

- `ENVIRONMENT`, default `PRODUCTION`
- `BOT_NAME`, default `Jappan`
- `BOT_PFP`, default bot profile image
- `BOT_WEBSITE`, default project website
- `LOG_TIMESTAMP`, default `false`
- `ENABLE_EVENTS_DEBUG`, default `false`; semicolon-separated event names such as `MessageCreate;MessageUpdate`

Set `ENABLE_EVENTS_DEBUG=MessageCreate;MessageUpdate` to log only those extended Discord events through the shared logger.

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

### Discord Events

`src/handlers/discord.ts` registers core events and extended feature events. Multiple listeners for the same Discord.js event are intentional and supported.

Core handlers cover client readiness, command deployment, Discord errors, and interaction dispatch. Extended handlers cover member join, member leave, message leveling, interaction leveling, and voice leveling.

When an event is listed in `ENABLE_EVENTS_DEBUG`, a separate debug listener is registered for it. Supported event names are:

- `Events.GuildMemberAdd`
- `Events.GuildMemberRemove`
- `Events.MessageCreate`
- `Events.InteractionCreate`
- `Events.VoiceStateUpdate`
- `Events.GuildMemberUpdate`
- `Events.GuildBanAdd`
- `Events.GuildBanRemove`

Debug output uses `logger.debug`, not direct console calls.

### Button Custom IDs

Buttons with payloads use the canonical doppelganger format:

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

- Users: `userMention(userId)`
- Channels: `channelMention(channelId)`
- Roles: `roleMention(roleId)`
- Slash commands: `chatInputApplicationCommandMention(commandName, subcommandGroupName, subcommandName, commandId)`

Do not display raw user, channel, role, or command IDs or names when a Discord mention can be generated. Use plain text only when the entity cannot be mentioned or when the surrounding wording explicitly requires a non-clickable label.

### Logging

Use `src/services/logger.ts` for logging. The logger delegates to `src/helpers/logger.ts` and supports `debug`, `info`, `success`, `warn`, and `error` levels. Include useful context in the details object, especially guild, user, command, role, and channel identifiers.

Do not use `console.log`, `console.info`, or `console.debug` directly in feature code.

### Configuration

Configuration is loaded once by `loadConfig()` and accessed through `getConfig()`. Add new environment-backed values to all of these places:

1. `Config` interface
2. `configTemplate` defaults
3. `loadConfig()` parsing
4. the returned configuration object

Boolean values are enabled only when their environment value is exactly `"true"`.

## Completed Work

The rewrite currently has:

- TypeScript/ESM architecture with strict NodeNext resolution, command/button loaders, service boundaries, database lifecycle handling, and startup command registration.
- Leveling from messages, interactions, and voice activity, including reward-role validation, recovery, hierarchy checks, and leaderboard retrieval.
- Join/leave announcements with unavailable-channel recovery and administrator notification through fallback channels.
- Audit coverage for members, roles, channels, threads, messages, invites, bans, users, voice state, permission overwrites, and raw audit-log entries, including recent executor and reason attribution.
- Slash-command, button, and autocomplete dispatch with database availability rejection for database-dependent commands.
- Structured logging with contextual details and configurable extended-event debugging.
- Passing `pnpm run typecheck` and `pnpm run build` validation.

## Remaining Work

### Priority 1: Feature Parity

The following legacy capabilities are not implemented in the rewrite:

- Music commands, player lifecycle, queue controls, extractors, and playlist persistence.
- The guild-scoped `admin` command and administrative deployment/management operations.
- The `freespeech` region-watch workflow and its persistence fields.
- The `soundboard` command.
- Legacy operational fallback commands for deployment, undeployment, player diagnostics, and prefix ping.
- Legacy event/debug/error log persistence models and user playlist persistence.

Fallback capability must remain available when slash commands are unavailable. Any feature removal requires owner approval and an equivalent supported mechanism.

### Priority 1: Runtime Correctness

- Replace leveling read-modify-save point updates with atomic MongoDB increments to avoid concurrent update loss.
- Reduce repeated guild settings reads on high-volume message events with a controlled cache or event-scoped cache.
- Prevent duplicate threshold role work when multiple events arrive concurrently for the same member.
- Complete guild-create initialization and new-guild confirmation.
- Add presence updates and Discord reconnect/disconnect handling.
- Add process-level `uncaughtException` and `unhandledRejection` handling.
- Make MongoDB index synchronization part of the startup readiness gate.
- Validate warning threshold ordering and separate warning, timeout, and ban permission checks.
- Persist warning reasons if warning history requires them.

### Priority 2: Reliability and Verification

- Add practical Vitest coverage for guild initialization, leveling concurrency, warning actions, command recovery, and database outage behavior.
- Persist critical logs to the database in addition to console output.
- Add correlation or request IDs for command and event traces.
- Add controlled reconnect and database recovery behavior with observable logging.
- Harden shutdown and failure handling for production operation.

- Lock down all Mongoose schemas with validation and ownership rules.
- Document the legacy-to-rewrite data migration and verify it against a backup.
- Add deployment and rollback instructions.
- Validate Docker and PM2 production startup.
- Perform a controlled production cutover only after parity and migration checks pass.

## Working Rules

- Prefer existing local patterns and services over new abstractions.
- Keep changes focused and avoid unrelated refactors.
- Preserve public behavior unless the rewrite plan explicitly allows an improvement.
- Use structured logging with context instead of direct console output.
- Add tests proportional to behavioral risk.
- Do not commit changes automatically.
- After edits, run the narrowest relevant test or typecheck, then run the full typecheck before handoff.

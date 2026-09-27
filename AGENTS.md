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

### Architecture and Runtime

- Created the TypeScript/ESM rewrite with strict NodeNext module resolution.
- Established bootstrap, handler, command, service, model, and helper boundaries.
- Added command and button loaders.
- Added database connection and shutdown lifecycle handling.
- Added startup command registration with command ID tracking.
- Preserved multiple Discord.js listeners where separate features need the same event.

### Leveling

- Added message, interaction, and voice activity leveling.
- Added enabled-state guards before leveling work.
- Added threshold reward role assignment.
- Repaired missing reward roles for members who pass the threshold later.
- Added checks for missing, managed, or bot-unmanageable reward roles.
- Added guild-level `ManageRoles` validation.
- Added role hierarchy validation against the bot's highest role.
- Invalid reward configuration is disabled and administrators are notified.
- A member who already has the reward role is short-circuited before bot permission checks.
- The server owner is skipped silently because Discord does not allow bots to manage the owner.
- An unmanageable non-owner member is skipped and logged without disabling the guild configuration.
- Leveling APIs use options objects for multi-parameter operations.
- Leaderboard retrieval and embed creation are implemented.

### Member Announcements

- Added join and leave announcement handling.
- Added unavailable-channel detection and automatic configuration recovery.
- Invalid announcement settings are disabled and administrators are notified.
- Shared guild fallback message delivery is implemented through `sendGuildMessage`.
- Recovery messages use direct Unicode fallback emojis because Discord does not expand bot-sent `:name:` shortcodes.

### Commands and UX

- Added initial leveling, leaderboard, member announcement, audit log, warning, clear, doppelganger, help, about, and ping command flows. These commands still require parity and edge-case completion listed below.
- Added button and autocomplete dispatch.
- Added command mentions for recovery instructions.
- Added role and permission validation for leveling setup.
- Standardized many command rejection messages around the Unicode error indicator.
- Keep `requiredBotPermissions` limited to permissions required by every subcommand; check subcommand-specific permissions inside the relevant branch instead of applying them globally.

### Observability

- Added structured logger categories and contextual details.
- Added a default-off `ENABLE_EVENTS_DEBUG` configuration item.
- Added extended-event debug registration controlled by that switch.
- Debug event output includes enum-style names such as `Events.MessageCreate` and event arguments.

## Remaining Work

### Priority 1: Verification

- Run `pnpm run build` as a production compilation check.

### Priority 1: Runtime Efficiency and Correctness

- Replace leveling read-modify-save point updates with atomic MongoDB increments to avoid concurrent update loss.
- Reduce repeated guild settings reads on high-volume message events with a controlled cache or event-scoped cache.
- Avoid repeated reward role and bot-member fetches after configuration validation, while preserving recovery when roles or permissions change.
- Prevent duplicate threshold role work when multiple events arrive concurrently for the same member.
- Rate-limit or deduplicate repeated warnings for unmanageable non-owner members.

### Priority 2: Feature Parity

- Compare the rewrite against `CURRENT_SETUP_DETAILS.md` and the legacy bot feature inventory.
- Pending audit migration items from `Jappan_Discord_Bot/Components/AuditHandler.js`:
  - Add executor and reason attribution through recent `Guild.fetchAuditLogs()` entries for moderation and configuration events.
  - [x] Migrate invite creation and revocation auditing.
  - [x] Migrate guild member profile updates, including nickname, roles, timeout, guild-specific avatar changes, and timeout executor attribution.
  - Migrate ban and unban auditing.
  - Migrate channel create, update, delete, and permission-overwrite auditing.
  - Migrate role create, update, and delete auditing.
  - [x] Migrate user profile updates, including username and avatar changes, across guilds where the user is a member.
  - Migrate raw `guildAuditLogEntryCreate` forwarding with target, executor, reason, and changed fields.
  - Reconcile partial message-delete behavior with the legacy `fullVerbosity` setting.
  - Add an explicit message-update timestamp and confirm embed-change comparison semantics.
- Complete migrated command behavior, not only command registration:
  - `level`: finish response consistency and runtime configuration edge cases.
  - `leaderboard`: finish pagination, button recovery, empty-state, and disabled-leveling behavior.
  - `memberannounce`: finish response consistency and join/leave configuration edge cases.
  - `auditlog`: verify complete audit event coverage, unavailable-channel recovery, and verbosity parity.
  - `warn`: separate warning, timeout, and ban permission checks; verify threshold and audit-channel parity.
  - `clear`: support complete message pagination/history scanning and verify permission failure recovery.
  - `doppelganger`: verify webhook lifecycle, delete-button recovery, notification failure handling, and permission parity.
  - `help`, `about`, and `ping`: verify final UX and error behavior against legacy expectations.
- Replace remaining bot-sent `:error:` shortcodes with direct Unicode or shared response constants.
- Complete any missing music, moderation, audit, fun, utility, admin, and fallback operational flows.
- Preserve equivalent operational fallback capability when slash commands are unavailable.
- Verify all legacy persistence intent has an explicit rewrite model or migration path.

### Priority 3: Reliability and Operations

- Add explicit database availability guards for DB-dependent commands and event paths.
- Return deterministic service-unavailable responses when MongoDB is down.
- Add reconnect behavior and observable recovery logging.
- Persist critical logs to the database in addition to console output.
- Add correlation or request IDs for command and event traces.
- Harden shutdown, reconnect, and error handling for production operation.

### Priority 4: Data and Release Readiness

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

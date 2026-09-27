# Current Setup Details (Feature and Runtime Inventory)

## Purpose

This document holds the detailed current-state inventory so the main plan can stay concise.

## Scope Notes (Owner-Aligned)

- This file tracks current-state detail that v2 must account for.
- Rework allows internal cleanup and modernization, but functionality cannot be reduced.
- Legacy operational command paths are currently required as fallback when slash flows are unavailable.
- Data migration is allowed during a planned maintenance window at cutover.
- v2 intent is to bring implementation up to the owner's latest engineering standard while preserving end-game behavior.
- Command response wording can be improved if behavior/outcome parity is maintained.
- Better Discord.js input/interaction UX patterns are allowed and encouraged if functional parity is preserved.
- Command UX/UI can be improved broadly in v2 (not limited to wording) if functionality is preserved.
- Modular/reusable functions are a core design preference when logic is shared across multiple areas.
- Avoid unnecessary abstraction: keep non-shared logic local instead of forcing separate helper functions.
- Legacy fallback command set is kept by default.
- Fallback operational coverage is mandatory when slash flows are unavailable.
- Legacy fallback command names/paths may be redesigned/replaced as long as equivalent fallback capability remains.
- Exception rule: remove/replace only with owner sign-off and equivalent supported mechanism.
- No fixed maximum downtime has been set for migration; timing is defined by release readiness.
- Data migration is treated as an endgame/cutover-stage problem, not an early rework blocker.
- Migration approach is accepted as disruptive during planned production downtime, with expected low operational impact.
- DB schema lock-down is a required v2 outcome (strong validation, explicit ownership, controlled evolution).
- Schema validation approach should stay pragmatic and use Mongoose schema enforcement (reject invalid structure).
- Logging quality in v1 is considered poor and requires a substantial v2 overhaul.
- Logging sinks for v2 are console + DB; PM2 production capture is accepted for file-level retention.
- Log content can be broad because operational access is host-restricted.
- Core functionality requires practical test coverage before production cutover.
- Preferred test stack is Vitest, with practical expectations for Discord.js constraints.
- Breaking command redesign is allowed in v2: names/options can change, and commands can be merged/split.
- Breaking button interaction contract redesign is also allowed in v2 with controlled migration/testing.
- Rework boundary rule: all new v2 implementation lives under rework/ and original v1 files are not to be modified.
- Rework project may have independent package/env/lockfile setup under rework/.
- Desired v2 startup order: DB readiness first, Discord connection second, subsystem startup third.
- Deploying global commands on startup is acceptable when implemented as safe/idempotent behavior.
- v2 design should be shard-ready for future multi-instance operation.
- Architecture style may draw inspiration from the owner's Node.js Express backend:
  - https://github.com/febkosq8/FebGoServe
- Migration principle for v1 carry-over:
  - evaluate if each behavior is truly needed,
  - then evaluate if current approach is the best approach,
  - then optimize without reducing required functionality.

## Owner-Reported v1 Pain Points (Confirmed)

- DB disconnect behavior is currently unpredictable; DB-dependent paths must fail gracefully in v2.
- DB-dependent slash commands should be gated by a DB availability check and fail fast with service-down response when DB is unavailable.
- Blocked DB-dependent command attempts should be logged with command/user/guild context for diagnosis.
- Logging is currently too weak for reliable diagnosis and needs structured, context-rich output.
- Current architecture is perceived as fragile and over-patched, requiring a clean standards-aligned rebuild.
- Core confidence tests are needed early (initial examples: guild list retrieval and song loading path).

## Documentation Certainty Policy

- This file stores confirmed current-state facts only.
- Unconfirmed behavior should not be written here as fact.
- If a detail is suspected but not validated, track it as an assumption in planning discussion until confirmed.
- When a previously documented fact changes, update this file and note the new source of truth.
- Clarification rule: do not assume owner intent; ask direct questions whenever ambiguity exists.

## Runtime and Constraints (Current)

- Language/runtime: JavaScript (Node.js)
- Discord library: discord.js 14.26.4
- Music stack: discord-player 7.2.0 + extractors
- Database: MongoDB via mongoose 9.7.0
- Process/dev: PM2 config present, Dockerfile present, nodemon for development

Primary references:

- index.js
- indexPost.js
- package.json

## Current Command Surface

### Global Slash Commands

- General: about, help, ping
- Music: play, pause, skip, stop, previous, queue, nowplaying, playlist, playtop, loop, volume, shuffle, remove
- Moderation/Config-like: warn, clear, level, memberannounce, lock-vc-region, auditlog
- Fun: doppelganger, soundboard
- Progression: leaderboard

Source: slashCommands/global

### Guild Slash Commands

- admin

Source: slashCommands/guild

### Button Interactions

- Help pages: Help, GeneralHelp, MusicHelp, LevelHelp, ModHelp, FunHelp
- Music controls: PlayerSkip, PlayerPause, PlayerPrevious, PlayerStop, PlayerQueue
- Leaderboard navigation: FrontLeaderboard, BackLeaderboard
- Other: Ping, DeleteDoppelganger

Source: slashCommands/buttonInteractions

### Legacy Prefix/Message Commands (Operational)

- deploy, testDeploy, unDeployGlobal, unDeployGuild
- playerDebug, playerDeps
- legacy ping

Source: indexPost.js messageCreate path

## Event-Driven Feature Behavior

- guildCreate initialization flow
- member announce events (join/leave)
- audit event processing for:
  - member, role, channel, message, invite, ban, user update, voice state
  - guild audit log entry events
- DM logging path
- message-based level checks
- voice join/leave level checks
- voice-channel region locking and restoration based on configured users
- button interaction dynamic dispatch by customId

Source: indexPost.js

## Music Runtime Behavior

- Player startup and extractor loading
- Queue message refresh loop
- Player lifecycle handling and user-facing queue messages for:
  - playerStart
  - playerSkip (including issue-based skips)
  - audioTrackAdd / audioTracksAdd
  - disconnect
  - emptyChannel
  - emptyQueue
- Debug state controlled by env and legacy admin command

Sources:

- indexPost.js
- Components/PlayerHandler.js

## Persistence Model (Current)

### guildList schema fields

- guildId, guildName
- levelActive, levelThreshold, levelRoleId, levelRoleName
- announceActive, announceChannelId, announceChannelName
- auditActive, auditChannelId, auditChannelName, auditFullVerbosity
- warnTimeoutThreshold, warnTimeoutDuration, warnBanThreshold
- warnAuditChannelId, warnAuditChannelName
- memberList
- regionWatchMembers

Source: Managers/Schemas/guildListSchema.js

### Other schemas

- userPlaylist
- eventLog
- debugLog
- errorLog

Source: Managers/Schemas

## Process and Reliability Behavior

- login and presence lifecycle
- reconnect/disconnect logging
- uncaughtException tracking and forced exit threshold behavior
- unhandledRejection logging
- SIGTERM shutdown path calling player shutdown logic

Source: index.js

## Similar/Overlapping Flows to Watch in Rework

- ping exists in slash, button, and legacy prefix paths
- help is split across slash entry and button pages
- music controls are both slash and button-driven
- moderation/config behavior spans commands + handlers + schema fields
- deploy/debug operations are message-command based and easy to omit accidentally

## Dependency Snapshot

- @discord-player/equalizer 7.2.0
- @discord-player/extractor 7.2.0
- @discord-player/utils 7.2.0
- @discordjs/voice 0.19.2
- axios 1.17.0
- bgutils-js 3.2.0
- discord-player 7.2.0
- discord-player-youtube 0.8.4
- discord.js 14.26.4
- dotenv 17.4.2
- mediaplex 1.0.0
- mongoose 9.7.0

Source: package.json

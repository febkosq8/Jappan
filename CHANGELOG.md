# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.2] - 2026-10-18

### Fixed

- Prevented `/clear` from submitting an empty interaction response when there are no overflow statistics.

## [2.0.0] - 2026-09-29

This release delivers the TypeScript rewrite of the Jappan Discord bot, with stability and reliability as major areas of focus alongside expanded administration, leveling, and music features.

### Added

- Rebuilt the bot in strict TypeScript using native ESM modules and a service-oriented architecture.
- Added slash-command, button, and autocomplete loading and dispatch.
- Added message, interaction, and voice leveling with reward roles, recovery, leaderboards, and concurrency-safe updates.
- Added voice-channel region locking with autocomplete, persistence, and automatic restoration.
- Added join and leave announcements with unavailable-channel recovery and administrator fallback notifications.
- Added idempotent guild initialization with permission-aware welcome messages and `/help` guidance.
- Added structured audit logging for members, roles, channels, threads, messages, invites, bans, users, voice states, permission overwrites, and raw audit-log entries.
- Added configurable event debugging and structured logging with contextual details.
- Added guild deployment commands, legacy admin deployment operations, bot diagnostics, and graceful bot shutdown controls.
- Added guild administration for listing guilds and channels, sending targeted messages, managing invites, kicking members, and reporting progress.
- Added warning threshold setup with action-specific timeout and ban permission checks.
- Added music playback with track and playlist search, queue controls, Discord Player lifecycle management, and extractor loading.
- Added persistent user playlists with add, remove, check, shuffle, and loop settings.
- Added the six legacy soundboard clips through `/soundboard`.
- Added online bot presence with periodic guild and user count updates.

### Changed

- Database readiness, model loading, index synchronization, and Discord startup are now coordinated through an awaited startup lifecycle.
- Database-dependent commands now reject requests cleanly when database availability is lost.
- Button payloads use named fields in the canonical `Action|KEY#value` format.
- User-facing Discord entities use clickable mentions and permission names follow Discord formatting conventions.
- Uncaught exceptions and unhandled rejections now use a configurable shutdown threshold and graceful shutdown handling.
- Discord shard disconnect, reconnect, and recovery events now produce structured logs.

### Fixed

- Prevented concurrent leveling updates and warning updates from losing persisted changes.
- Prevented duplicate concurrent reward-role assignments for the same member.
- Added recovery for missing or unavailable channels used by announcements.
- Added hierarchy and permission checks before reward-role, warning, timeout, ban, and administration actions.

## [1.4.5]

### Changed

- Updated discord.js, Discord Player, and related dependencies.

## [1.4.4]

### Added

- Added Discord Player context-aware hooks.

### Changed

- Improved audit-handler error handling.
- Docker now starts with `node index.js` so shutdown signals are handled correctly.
- The bot now clears its queue and informs users when it receives a shutdown signal.

## [1.4.3]

### Added

- Added the `GetChannel` admin command.
- Added an `unhandledRejection` listener.

### Changed

- Prefix commands now run only after a pre-check.
- Guild list responses are sent in pairs of 20 servers and include join timestamps and owner IDs.
- Doppelganger now uses a user's global name instead of their nickname.
- Audit logging now serializes event objects before saving them to the database.
- Audit handling skips events triggered by the bot itself and catches handler errors.
- Play autocomplete item names are truncated when they exceed Discord's length limit.
- MongoDB disconnection propagation waits 10 seconds to support cluster transitions.

### Removed

- Removed all references to user discriminators.

## [1.4.2]

### Changed

- Updated discord.js and Discord Player.
- Switched from `UseMasterPlayer` to `useMainPlayer`.
- Switched from opusscript to mediaplex.
- Admin guild-list operations now check for the bot's administrator role.
- Removed ffmpeg from npm and moved it to Docker.
- Play autocomplete responses are truncated when they exceed Discord's length limit.

### Fixed

- Fixed audit-handler errors when data is missing.
- Interaction failures no longer send error stacks.

## [1.4.1]

### Added

- Added Docker support to fix song-skipping issues on Heroku.

### Changed

- Updated discord.js and Discord Player.
- Improved error handling for music commands.
- Improved prefix-message argument validation.
- The admin guild-list command now checks the bot's administrator permissions.
- Discord Player loads extractors automatically.

## [1.4.0]

### Changed

- Updated discord.js and Discord Player.
- Improved general error handling.
- Improved handling for `GuildAuditEntryCreate` events.
- Discord Player loads extractors manually.

## [1.3.9]

### Added

- Added thumbnails and `requestedBy` information to `/nowplaying`.
- Added a command for toggling player debug state.
- Added handling for `GuildAuditEntryCreate` events.

### Changed

- Moved guild playback logic to `PlayerHandler`.
- Added the missing `NOTICE` handling to `EventHandler`.

### Fixed

- Fixed undefined audit-log values when a role is deleted during a `GuildMember` update.

## [1.3.8]

### Changed

- Updated Discord Player, equalizer, and extractor dependencies.
- Switched to Discord Player's `usePlayer()` API.

### Fixed

- Added ffmpeg-static to fix early track termination.

## [1.3.7]

### Added

- Added the `/warn` command and documentation.

[2.0.2]: https://github.com/febkosq8/Jappan/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/febkosq8/Jappan/releases/tag/v2.0.0
[1.4.5]: https://github.com/febkosq8/Jappan/releases/tag/v1.4.5
[1.4.4]: https://github.com/febkosq8/Jappan/releases/tag/v1.4.4
[1.4.3]: https://github.com/febkosq8/Jappan/releases/tag/v1.4.3
[1.4.2]: https://github.com/febkosq8/Jappan/releases/tag/v1.4.2
[1.4.1]: https://github.com/febkosq8/Jappan/releases/tag/v1.4.1
[1.4.0]: https://github.com/febkosq8/Jappan/releases/tag/v1.4.0
[1.3.9]: https://github.com/febkosq8/Jappan/releases/tag/v1.3.9
[1.3.8]: https://github.com/febkosq8/Jappan/releases/tag/v1.3.8
[1.3.7]: https://github.com/febkosq8/Jappan/releases/tag/v1.3.7
